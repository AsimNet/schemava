<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
    store,
    selectField,
    renameField,
    updateField,
    updateTypeProp,
    setPrefill,
    pushToast,
    priorFields,
    allFieldEntries,
} from '../store.js';
import { t } from '../i18n.js';
import { fadeInUp, staggerIn } from '../motion.js';
import { FIELD_TYPES, ADVANCED_TYPE } from '../model/fieldTypes.js';
import {
    containsVariable,
    insertVariableAt,
    bytesToMb,
    mbToBytes,
    ratingPreviewItems,
    fieldReferenceOptions,
    calculatedValueOptions,
} from '../ui-helpers.js';
import VariableMenu from './VariableMenu.vue';
import ChoicesEditor from './ChoicesEditor.vue';
import MatrixEditor from './MatrixEditor.vue';
import LogicEditor from './LogicEditor.vue';
import QuizEditor from './QuizEditor.vue';
import RichTextEditor from './RichTextEditor.vue';
import PanelTemplateEditor from './PanelTemplateEditor.vue';

const props = defineProps({
    open: { type: Boolean, default: false },
    field: { type: Object, default: null },
});

/** Scroll/content wrapper — the target for the drawer's open fade+slide. */
const drawerBody = ref(null);

/**
 * Animate the drawer content whenever it opens AND whenever the selected field
 * changes while it's already open (switching field A → B keeps `open` true, so
 * watching `open` alone would only animate the first selection). The shell width
 * still eases via CSS; this gives the content a clear, repeatable entrance — the
 * panel's sections cascade in (fade + rise), which reads as "the settings
 * opened" far more than the previous single 12px fade did. No-op under reduced
 * motion. `flush: 'post'` runs the callback after the DOM has the new content.
 */
watch(
    () => [props.open, props.field?.name],
    ([open]) => {
        if (!open) {
            return;
        }
        nextTick(() => {
            const body = drawerBody.value;
            if (!body) {
                return;
            }
            const sections = body.querySelectorAll(':scope > .fb-section');
            if (sections.length > 0) {
                staggerIn(sections, { distance: 12, step: 45, duration: 220 });
            } else {
                fadeInUp(body, { distance: 12 });
            }
        });
    },
    { flush: 'post' },
);

const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');
const def = computed(() => (props.field ? FIELD_TYPES[props.field.type] ?? null : null));
const isAdvanced = computed(() => props.field?.type === ADVANCED_TYPE);
const isStatement = computed(() => props.field?.type === 'statement');
const isExpression = computed(() => props.field?.type === 'expression');
const hasPlaceholder = computed(() => Boolean(def.value?.hasPlaceholder));
const hasChoices = computed(() => Boolean(def.value?.hasChoices));
const MATRIX_TYPES = ['matrix', 'matrixdropdown', 'matrixdynamic'];
const isMatrixFamily = computed(() => MATRIX_TYPES.includes(props.field?.type));

/** Types that support a static/piped prefill value in Basics. */
const PREFILLABLE = ['short_text', 'long_text', 'number', 'date', 'dropdown', 'single_choice'];
const supportsPrefill = computed(() => PREFILLABLE.includes(props.field?.type));

/** Types that get a Quiz section: quizzable catalog types + short_text. */
const supportsQuiz = computed(() => Boolean(def.value?.quizzable) || props.field?.type === 'short_text');

/** Whether the Options section has any content for this type. */
const TYPES_WITH_OPTIONS = [
    'short_text', 'number', 'long_text', 'single_choice', 'multi_choice',
    'dropdown', 'yes_no', 'rating', 'file', 'image', 'statement', 'hidden_value',
    'panel_dynamic',
    'expression',
    'matrix', 'matrixdropdown', 'matrixdynamic',
];
const hasOptions = computed(() => !isAdvanced.value && (TYPES_WITH_OPTIONS.includes(props.field?.type) || hasChoices.value));

/* ----------------------------------------------------------- disclosures */

const sections = reactive({
    options: true,
    logic: false,
    quiz: false,
    advanced: false,
});

const nameDraft = ref('');
const nameError = ref(null);

watch(
    () => props.field?.name,
    () => {
        nameDraft.value = props.field?.name ?? '';
        nameError.value = null;
        sections.logic = Boolean(props.field?.logic);
        sections.quiz = Boolean(props.field?.quiz);
    },
    { immediate: true },
);

/* --------------------------------------------------------- localized inputs */

function localeValue(lstr) {
    if (!lstr) {
        return '';
    }

    return (contentLocale.value === 'en' ? lstr.en : lstr.ar) ?? '';
}

function setLocaleValue(lstr, value) {
    if (contentLocale.value === 'en') {
        lstr.en = value === '' ? null : value;
    } else {
        lstr.ar = value;
    }
    store.dirty = true;
}

const labelValue = computed({
    get: () => localeValue(props.field?.label),
    set: (value) => props.field && setLocaleValue(props.field.label, value),
});

const descriptionValue = computed({
    get: () => localeValue(props.field?.description),
    set(value) {
        if (!props.field) {
            return;
        }
        if (!props.field.description) {
            updateField(props.field.name, { description: { ar: '', en: null } });
        }
        setLocaleValue(props.field.description, value);
    },
});

const placeholderValue = computed({
    get: () => localeValue(props.field?.placeholder),
    set(value) {
        if (!props.field) {
            return;
        }
        if (!props.field.placeholder) {
            updateField(props.field.name, { placeholder: { ar: '', en: null } });
        }
        setLocaleValue(props.field.placeholder, value);
    },
});

const requiredValue = computed({
    get: () => Boolean(props.field?.required),
    set: (value) => props.field && updateField(props.field.name, { required: value }),
});

const hiddenValue = computed({
    get: () => Boolean(props.field?.hidden),
    set: (value) => props.field && updateField(props.field.name, { hidden: value }),
});

const readOnlyValue = computed({
    get: () => Boolean(props.field?.readOnly),
    set: (value) => props.field && updateField(props.field.name, { readOnly: value }),
});

/**
 * Read-only/disabled only makes sense for fields the respondent would otherwise
 * fill in. It is meaningless for statement (html) and image (display-only)
 * fields, and advanced passthrough fields are never editable here.
 */
const supportsReadOnly = computed(
    () => !isAdvanced.value && !isStatement.value && !isExpression.value && props.field?.type !== 'image',
);

/** Per-field required-error override (LStr), serialized as requiredErrorText (fix 7). */
const requiredErrorValue = computed({
    get: () => localeValue(props.field?.requiredErrorText),
    set(value) {
        if (!props.field) {
            return;
        }
        const existing = props.field.requiredErrorText;
        const lstr = existing && typeof existing === 'object' ? { ...existing } : { ar: '', en: null };
        if (contentLocale.value === 'en') {
            lstr.en = value === '' ? null : value;
        } else {
            lstr.ar = value;
        }
        const empty = (lstr.ar ?? '').trim() === '' && (lstr.en ?? '').trim() === '';
        updateField(props.field.name, { requiredErrorText: empty ? null : lstr });
    },
});

/** The required-error override only makes sense for fields that can be required. */
const supportsRequiredError = computed(
    () => !isAdvanced.value && !isStatement.value && !isExpression.value && props.field?.type !== 'image' && props.field?.type !== 'hidden_value',
);

/* --------------------------------------------- variable-menu caret handling */

const inputRefs = reactive({});
const caretPositions = reactive({});

function registerRef(key, el) {
    inputRefs[key] = el;
}

function rememberCaret(key, event) {
    const el = event?.target;
    if (el && typeof el.selectionStart === 'number') {
        caretPositions[key] = el.selectionStart;
    }
}

/**
 * Insert `{variableKey}` at the remembered caret of the input identified by
 * `key`, then route the new text through `assign` (a setter computed).
 */
function insertVariable(key, variableKey, current, assign) {
    const caret = caretPositions[key] ?? (current ?? '').length;
    const { text, caret: nextCaret } = insertVariableAt(current ?? '', caret, variableKey);
    assign(text);
    caretPositions[key] = nextCaret;
    const el = inputRefs[key];
    if (el) {
        requestAnimationFrame(() => {
            el.focus();
            try {
                el.setSelectionRange(nextCaret, nextCaret);
            } catch {
                /* non-text inputs */
            }
        });
    }
}

/* ----------------------------------------------------------------- prefill */

const prefillRaw = computed(() => {
    if (!props.field) {
        return '';
    }
    if (typeof props.field.defaultValueExpression === 'string' && props.field.defaultValueExpression !== '') {
        return props.field.defaultValueExpression;
    }
    const value = props.field.defaultValue;

    return value === undefined || value === null ? '' : String(value);
});

const prefillIsExpression = computed(() => containsVariable(prefillRaw.value));

function setPrefillValue(value) {
    setPrefill(props.field.name, value, containsVariable(value));
}

/* ----------------------------------------------------- per-type option props */

function typeProp(key, fallback = null) {
    const value = props.field?.typeProps?.[key];

    return value === undefined ? fallback : value;
}

function setProp(key, value) {
    updateTypeProp(props.field.name, key, value);
}

/** Localized typeProp (labelTrue/labelFalse/statement html). */
function localizedProp(key) {
    const lstr = props.field?.typeProps?.[key];

    return localeValue(lstr);
}

function setLocalizedProp(key, value) {
    const existing = props.field?.typeProps?.[key];
    const lstr = existing && typeof existing === 'object' ? { ...existing } : { ar: '', en: null };
    if (contentLocale.value === 'en') {
        lstr.en = value === '' ? null : value;
    } else {
        lstr.ar = value;
    }
    setProp(key, lstr);
}

/**
 * Append a `{variable}` piping token to the statement html (active locale). The
 * statement editor is a rich contenteditable surface, so caret tracking isn't
 * available the way it is for plain inputs — appending the token is the simplest
 * reliable insertion (the admin can then move it within the rich editor).
 */
function appendVariableToHtml(variableKey) {
    const current = localizedProp('html') ?? '';
    const token = `{${variableKey}}`;
    setLocalizedProp('html', current === '' ? token : `${current} ${token}`);
}

/* number min/max */
function numberProp(key) {
    const value = typeProp(key);

    return value === null || value === undefined ? '' : value;
}

function setNumberProp(key, raw) {
    const num = raw === '' ? null : Number(raw);
    setProp(key, Number.isFinite(num) ? num : null);
}

/* file maxSize (MB <-> bytes) */
const maxSizeMb = computed({
    get: () => {
        const mb = bytesToMb(typeProp('maxSize'));

        return mb === null ? '' : mb;
    },
    set(value) {
        setProp('maxSize', mbToBytes(value));
    },
});

/* rating preview (shares ratingPreviewItems with the canvas card — fix 3) */
const DISPLAY_STYLES = ['none', 'decimal', 'percent', 'currency'];

/** Prior fields (document order, mirrors visibleIf) offered as formula references. */
const expressionFieldOptions = computed(() => fieldReferenceOptions(priorFields(props.field?.name ?? ''), contentLocale.value));
const expressionCalcOptions = computed(() => calculatedValueOptions(store.state?.calculatedValues ?? []));

const RATE_TYPES = ['stars', 'labels', 'smileys'];
const ratePreview = computed(() => ratingPreviewItems(props.field?.typeProps));

const INPUT_TYPES = [
    { value: 'text', key: 'inputTypeText' },
    { value: 'email', key: 'inputTypeEmail' },
    { value: 'tel', key: 'inputTypeTel' },
    { value: 'url', key: 'inputTypeUrl' },
];

/* ------------------------------------------------------------- image upload */

const imageUploading = ref(false);
const imageError = ref(false);
const imageInput = ref(null);

function triggerImagePick() {
    imageInput.value?.click();
}

async function onImageSelected(event) {
    const file = event.target?.files?.[0];
    if (!file) {
        return;
    }
    imageError.value = false;
    imageUploading.value = true;

    const csrf = store.boot?.csrf ?? '';
    const url = store.boot?.routes?.uploadImage ?? '';

    const form = new FormData();
    form.append('files[]', file);
    form.append('_token', csrf);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': csrf,
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            body: form,
        });
        const data = await response.json().catch(() => ({}));
        // Only set imageLink on a genuine success with a non-empty url; on any
        // failure (incl. the server's empty-path guard) surface a toast and
        // leave imageLink untouched (fix 5).
        if (response.ok && data.status === 'success' && typeof data.url === 'string' && data.url.trim() !== '') {
            setProp('imageLink', data.url);
        } else {
            throw new Error(data.message || `HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('[form-builder] image upload failed', error);
        imageError.value = true;
        pushToast(t('imageUploadFailed'), 'error');
    } finally {
        imageUploading.value = false;
        if (event.target) {
            event.target.value = '';
        }
    }
}

function removeImage() {
    setProp('imageLink', null);
    imageError.value = false;
}

const imageLink = computed(() => typeProp('imageLink'));

/* ---------------------------------------------------------------- toggles */

function commitName() {
    if (!props.field) {
        return;
    }
    const result = renameField(props.field.name, nameDraft.value);
    nameError.value = result;
}

function close() {
    selectField(null);
}
</script>

<template>
    <aside class="fb-drawer fb-scroll" :class="{ 'fb-drawer--open': open }" aria-live="polite">
        <div class="fb-drawer-head">
            <h2 class="fb-drawer-title">{{ t('settings') }}</h2>
            <button
                type="button"
                class="fb-drawer-close fb-focus"
                :title="t('closePanel')"
                :aria-label="t('closePanel')"
                @click="close"
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>

        <div v-if="!field" class="fb-drawer-empty">
            {{ t('noFieldSelected') }}
        </div>

        <div v-else ref="drawerBody" class="fb-drawer-body">
            <!-- ===================== Basics ===================== -->
            <section class="fb-section">
                <h3 class="fb-section-title">{{ t('sectionBasics') }}</h3>

                <div v-if="isAdvanced" class="fb-locked-note">
                    {{ t('lockedFieldHint') }}
                </div>

                <template v-else>
                    <!-- statement: the label is irrelevant (html elements render only
                         their html content); the text is edited in Options (fix 4). -->
                    <p v-if="isStatement" class="fb-hint">{{ t('statementHtmlPlaceholder') }}</p>

                    <div v-if="!isStatement" class="fb-field">
                        <div class="fb-field-head">
                            <span class="fb-field-label">{{ t('labelField') }}</span>
                            <VariableMenu @insert="(k) => insertVariable('label', k, labelValue, (v) => (labelValue = v))" />
                        </div>
                        <input
                            :ref="(el) => registerRef('label', el)"
                            v-model="labelValue"
                            type="text"
                            class="fb-input fb-focus"
                            @keyup="rememberCaret('label', $event)"
                            @click="rememberCaret('label', $event)"
                            @blur="rememberCaret('label', $event)"
                        />
                    </div>

                    <div v-if="!isStatement" class="fb-field">
                        <div class="fb-field-head">
                            <span class="fb-field-label">{{ t('descriptionField') }}</span>
                            <VariableMenu @insert="(k) => insertVariable('description', k, descriptionValue, (v) => (descriptionValue = v))" />
                        </div>
                        <textarea
                            :ref="(el) => registerRef('description', el)"
                            v-model="descriptionValue"
                            class="fb-input fb-textarea fb-focus"
                            rows="2"
                            @keyup="rememberCaret('description', $event)"
                            @click="rememberCaret('description', $event)"
                            @blur="rememberCaret('description', $event)"
                        ></textarea>
                    </div>

                    <div v-if="hasPlaceholder" class="fb-field">
                        <div class="fb-field-head">
                            <span class="fb-field-label">{{ t('placeholderField') }}</span>
                            <VariableMenu @insert="(k) => insertVariable('placeholder', k, placeholderValue, (v) => (placeholderValue = v))" />
                        </div>
                        <input
                            :ref="(el) => registerRef('placeholder', el)"
                            v-model="placeholderValue"
                            type="text"
                            class="fb-input fb-focus"
                            @keyup="rememberCaret('placeholder', $event)"
                            @click="rememberCaret('placeholder', $event)"
                            @blur="rememberCaret('placeholder', $event)"
                        />
                    </div>

                    <div v-if="supportsPrefill" class="fb-field">
                        <div class="fb-field-head">
                            <span class="fb-field-label">{{ t('defaultValueLabel') }}</span>
                            <span class="fb-prefill-mode">{{ prefillIsExpression ? t('prefillModeExpression') : t('prefillModeValue') }}</span>
                            <VariableMenu @insert="(k) => insertVariable('prefill', k, prefillRaw, (v) => setPrefillValue(v))" />
                        </div>
                        <input
                            :ref="(el) => registerRef('prefill', el)"
                            :value="prefillRaw"
                            type="text"
                            class="fb-input fb-focus"
                            :class="{ 'fb-input--expr': prefillIsExpression }"
                            :placeholder="t('defaultValuePlaceholder')"
                            @input="setPrefillValue($event.target.value)"
                            @keyup="rememberCaret('prefill', $event)"
                            @click="rememberCaret('prefill', $event)"
                            @blur="rememberCaret('prefill', $event)"
                        />
                    </div>

                    <label v-if="!isStatement && !isExpression" class="fb-toggle">
                        <input v-model="requiredValue" type="checkbox" class="fb-checkbox" />
                        <span>{{ t('requiredToggle') }}</span>
                    </label>

                    <label class="fb-toggle">
                        <input v-model="hiddenValue" type="checkbox" class="fb-checkbox" />
                        <span>{{ t('hiddenToggle') }}</span>
                    </label>
                    <p class="fb-hint">{{ t('hiddenToggleHint') }}</p>

                    <label v-if="supportsReadOnly" class="fb-toggle">
                        <input v-model="readOnlyValue" type="checkbox" class="fb-checkbox" />
                        <span>{{ t('readOnlyLabel') }}</span>
                    </label>
                    <p v-if="supportsReadOnly" class="fb-hint">{{ t('readOnlyHelp') }}</p>
                </template>
            </section>

            <!-- ===================== Options ===================== -->
            <section v-if="hasOptions" class="fb-section">
                <button
                    type="button"
                    class="fb-disclosure fb-focus"
                    :aria-expanded="sections.options"
                    @click="sections.options = !sections.options"
                >
                    <span>{{ t('sectionOptions') }}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" class="fb-disclosure-chevron" :class="{ 'fb-disclosure-chevron--open': sections.options }">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                </button>

                <div v-show="sections.options" class="fb-disclosure-body">
                    <!-- short_text: inputType -->
                    <label v-if="field.type === 'short_text'" class="fb-field">
                        <span class="fb-field-label">{{ t('inputTypeLabel') }}</span>
                        <select class="fb-input fb-focus" :value="typeProp('inputType', 'text')" @change="setProp('inputType', $event.target.value)">
                            <option v-for="it in INPUT_TYPES" :key="it.value" :value="it.value">{{ t(it.key) }}</option>
                        </select>
                    </label>

                    <!-- number: min/max -->
                    <template v-if="field.type === 'number'">
                        <div class="fb-row">
                            <label class="fb-field">
                                <span class="fb-field-label">{{ t('minValue') }}</span>
                                <input type="number" class="fb-input fb-focus" :value="numberProp('min')" @input="setNumberProp('min', $event.target.value)" />
                            </label>
                            <label class="fb-field">
                                <span class="fb-field-label">{{ t('maxValue') }}</span>
                                <input type="number" class="fb-input fb-focus" :value="numberProp('max')" @input="setNumberProp('max', $event.target.value)" />
                            </label>
                        </div>
                    </template>

                    <!-- long_text: rows -->
                    <label v-if="field.type === 'long_text'" class="fb-field">
                        <span class="fb-field-label">{{ t('rowsLabel') }}</span>
                        <input type="number" min="1" class="fb-input fb-focus" :value="numberProp('rows')" @input="setNumberProp('rows', $event.target.value)" />
                    </label>

                    <!-- single_choice / multi_choice / dropdown: choices -->
                    <ChoicesEditor v-if="hasChoices" :field="field" />

                    <!-- single_choice: showOtherItem -->
                    <label v-if="field.type === 'single_choice' || field.type === 'multi_choice'" class="fb-toggle">
                        <input type="checkbox" class="fb-checkbox" :checked="typeProp('showOtherItem', false)" @change="setProp('showOtherItem', $event.target.checked)" />
                        <span>{{ t('showOtherItem') }}</span>
                    </label>

                    <!-- multi_choice: showSelectAllItem -->
                    <label v-if="field.type === 'multi_choice'" class="fb-toggle">
                        <input type="checkbox" class="fb-checkbox" :checked="typeProp('showSelectAllItem', false)" @change="setProp('showSelectAllItem', $event.target.checked)" />
                        <span>{{ t('showSelectAllItem') }}</span>
                    </label>

                    <!-- yes_no: labelTrue / labelFalse (localized) -->
                    <template v-if="field.type === 'yes_no'">
                        <label class="fb-field">
                            <span class="fb-field-label">{{ t('labelTrue') }}</span>
                            <input type="text" class="fb-input fb-focus" :placeholder="t('labelTruePlaceholder')" :value="localizedProp('labelTrue')" @input="setLocalizedProp('labelTrue', $event.target.value)" />
                        </label>
                        <label class="fb-field">
                            <span class="fb-field-label">{{ t('labelFalse') }}</span>
                            <input type="text" class="fb-input fb-focus" :placeholder="t('labelFalsePlaceholder')" :value="localizedProp('labelFalse')" @input="setLocalizedProp('labelFalse', $event.target.value)" />
                        </label>
                    </template>

                    <!-- rating: rateMax + rateType + preview -->
                    <template v-if="field.type === 'rating'">
                        <label class="fb-field">
                            <span class="fb-field-label">{{ t('rateMax') }}</span>
                            <input type="number" min="3" max="10" class="fb-input fb-focus" :value="typeProp('rateMax', 5)" @input="setNumberProp('rateMax', $event.target.value)" />
                        </label>
                        <div class="fb-field">
                            <span class="fb-field-label">{{ t('rateType') }}</span>
                            <div class="fb-segment-inline">
                                <button v-for="rt in RATE_TYPES" :key="rt" type="button" class="fb-seg-btn" :class="{ 'fb-seg-btn--active': typeProp('rateType', 'stars') === rt }" @click="setProp('rateType', rt)">
                                    {{ t('rateType' + rt.charAt(0).toUpperCase() + rt.slice(1)) }}
                                </button>
                            </div>
                        </div>
                        <div class="fb-rate-preview">
                            <span class="fb-rate-preview-label">{{ t('ratePreview') }}</span>
                            <div class="fb-rate-preview-items">
                                <template v-if="ratePreview.type === 'stars'">
                                    <svg v-for="n in ratePreview.items" :key="n" viewBox="0 0 24 24" fill="currentColor" class="fb-rate-star" aria-hidden="true">
                                        <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                                    </svg>
                                </template>
                                <template v-else-if="ratePreview.type === 'smileys'">
                                    <span v-for="(emoji, idx) in ratePreview.items" :key="idx" class="fb-rate-smiley-emoji" aria-hidden="true">{{ emoji }}</span>
                                </template>
                                <template v-else>
                                    <span v-for="n in ratePreview.items" :key="n" class="fb-rate-num">{{ n }}</span>
                                </template>
                            </div>
                        </div>
                    </template>

                    <!-- file: allowMultiple + acceptedTypes + maxSize -->
                    <template v-if="field.type === 'file'">
                        <label class="fb-toggle">
                            <input type="checkbox" class="fb-checkbox" :checked="typeProp('allowMultiple', false)" @change="setProp('allowMultiple', $event.target.checked)" />
                            <span>{{ t('allowMultiple') }}</span>
                        </label>
                        <label class="fb-field">
                            <span class="fb-field-label">{{ t('acceptedTypes') }}</span>
                            <input type="text" class="fb-input fb-focus" dir="ltr" :placeholder="t('acceptedTypesPlaceholder')" :value="typeProp('acceptedTypes', '') ?? ''" @input="setProp('acceptedTypes', $event.target.value === '' ? null : $event.target.value)" />
                            <span class="fb-hint">{{ t('acceptedTypesHint') }}</span>
                        </label>
                        <label class="fb-field">
                            <span class="fb-field-label">{{ t('maxSizeMb') }}</span>
                            <input v-model.number="maxSizeMb" type="number" min="0" step="0.1" class="fb-input fb-focus" />
                        </label>
                    </template>

                    <!-- image: upload control -->
                    <template v-if="field.type === 'image'">
                        <div class="fb-field">
                            <span class="fb-field-label">{{ t('imageUpload') }}</span>
                            <div v-if="imageLink" class="fb-image-preview">
                                <img :src="imageLink" :alt="t('imagePreviewAlt')" />
                            </div>
                            <input ref="imageInput" type="file" accept="image/*" class="fb-hidden-file" @change="onImageSelected" />
                            <div class="fb-image-actions">
                                <button type="button" class="fb-upload-btn fb-focus" :disabled="imageUploading" @click="triggerImagePick">
                                    <span v-if="imageUploading" class="fb-spinner-sm" aria-hidden="true"></span>
                                    <span>{{ imageUploading ? t('imageUploading') : (imageLink ? t('imageReplace') : t('imageUploadButton')) }}</span>
                                </button>
                                <button
                                    v-if="imageLink && !imageUploading"
                                    type="button"
                                    class="fb-image-remove fb-focus"
                                    @click="removeImage"
                                >
                                    {{ t('imageRemove') }}
                                </button>
                            </div>
                            <p v-if="imageError" class="fb-error">{{ t('imageUploadFailed') }}</p>
                        </div>
                    </template>

                    <!-- statement: rich text + raw HTML editor (fix 4) -->
                    <div v-if="field.type === 'statement'" class="fb-field">
                        <div class="fb-field-head">
                            <span class="fb-field-label">{{ t('statementHtml') }}</span>
                            <VariableMenu @insert="(k) => appendVariableToHtml(k)" />
                        </div>
                        <RichTextEditor
                            :model-value="localizedProp('html')"
                            :dir="contentLocale === 'en' ? 'ltr' : 'rtl'"
                            @update:model-value="(v) => setLocalizedProp('html', v)"
                        />
                    </div>

                    <!-- expression: formula + display style -->
                    <template v-if="field.type === 'expression'">
                        <div class="fb-field">
                            <div class="fb-field-head">
                                <span class="fb-field-label">{{ t('expressionFormula') }}</span>
                                <VariableMenu
                                    :fields="expressionFieldOptions"
                                    :calculated-values="expressionCalcOptions"
                                    @insert="(k) => insertVariable('expression', k, typeProp('expression', ''), (v) => setProp('expression', v))"
                                />
                            </div>
                            <input
                                :ref="(el) => registerRef('expression', el)"
                                :value="typeProp('expression', '')"
                                type="text"
                                class="fb-input fb-mono fb-focus"
                                dir="ltr"
                                spellcheck="false"
                                :placeholder="t('expressionFormulaPlaceholder')"
                                @input="setProp('expression', $event.target.value)"
                                @keyup="rememberCaret('expression', $event)"
                                @click="rememberCaret('expression', $event)"
                                @blur="rememberCaret('expression', $event)"
                            />
                            <span class="fb-hint">{{ t('expressionFormulaHint') }}</span>
                        </div>
                        <label class="fb-field">
                            <span class="fb-field-label">{{ t('expressionDisplayStyle') }}</span>
                            <select class="fb-input fb-focus" :value="typeProp('displayStyle', 'none')" @change="setProp('displayStyle', $event.target.value)">
                                <option v-for="ds in DISPLAY_STYLES" :key="ds" :value="ds">{{ t('expressionDisplayStyle' + ds.charAt(0).toUpperCase() + ds.slice(1)) }}</option>
                            </select>
                        </label>
                    </template>

                    <!-- hidden_value: defaultValueExpression -->
                    <div v-if="field.type === 'hidden_value'" class="fb-field">
                        <div class="fb-field-head">
                            <span class="fb-field-label">{{ t('hiddenValueExpression') }}</span>
                            <VariableMenu @insert="(k) => insertVariable('hiddenExpr', k, field.defaultValueExpression || '', (v) => updateField(field.name, { defaultValueExpression: v }))" />
                        </div>
                        <input
                            :ref="(el) => registerRef('hiddenExpr', el)"
                            :value="field.defaultValueExpression || ''"
                            type="text"
                            class="fb-input fb-mono fb-focus"
                            dir="ltr"
                            spellcheck="false"
                            @input="updateField(field.name, { defaultValueExpression: $event.target.value })"
                            @keyup="rememberCaret('hiddenExpr', $event)"
                            @click="rememberCaret('hiddenExpr', $event)"
                            @blur="rememberCaret('hiddenExpr', $event)"
                        />
                        <span class="fb-hint">{{ t('hiddenValueExpressionHint') }}</span>
                    </div>

                    <!-- panel_dynamic: panel count bounds + add/remove texts + template -->
                    <template v-if="field.type === 'panel_dynamic'">
                        <div class="fb-row">
                            <label class="fb-field">
                                <span class="fb-field-label">{{ t('panelMinCount') }}</span>
                                <input type="number" min="0" class="fb-input fb-focus" :value="numberProp('minPanelCount')" @input="setNumberProp('minPanelCount', $event.target.value)" />
                            </label>
                            <label class="fb-field">
                                <span class="fb-field-label">{{ t('panelMaxCount') }}</span>
                                <input type="number" min="1" class="fb-input fb-focus" :value="numberProp('maxPanelCount')" @input="setNumberProp('maxPanelCount', $event.target.value)" />
                            </label>
                        </div>
                        <label class="fb-field">
                            <span class="fb-field-label">{{ t('panelInitialCount') }}</span>
                            <input type="number" min="0" class="fb-input fb-focus" :value="typeProp('panelCount', 1)" @input="setNumberProp('panelCount', $event.target.value)" />
                            <span class="fb-hint">{{ t('panelInitialCountHint') }}</span>
                        </label>
                        <label class="fb-field">
                            <span class="fb-field-label">{{ t('panelAddText') }}</span>
                            <input type="text" class="fb-input fb-focus" :placeholder="t('panelAddTextPlaceholder')" :value="localizedProp('panelAddText')" @input="setLocalizedProp('panelAddText', $event.target.value)" />
                        </label>
                        <label class="fb-field">
                            <span class="fb-field-label">{{ t('panelRemoveText') }}</span>
                            <input type="text" class="fb-input fb-focus" :placeholder="t('panelRemoveTextPlaceholder')" :value="localizedProp('panelRemoveText')" @input="setLocalizedProp('panelRemoveText', $event.target.value)" />
                        </label>
                        <PanelTemplateEditor :field="field" />
                    </template>

                    <!-- matrix family: rows/columns editor -->
                    <MatrixEditor v-if="isMatrixFamily" :field="field" />
                </div>
            </section>

            <!-- ===================== Logic ===================== -->
            <section v-if="!isAdvanced" class="fb-section">
                <button
                    type="button"
                    class="fb-disclosure fb-focus"
                    :aria-expanded="sections.logic"
                    @click="sections.logic = !sections.logic"
                >
                    <span>{{ t('sectionLogic') }}<span v-if="field.logic" class="fb-section-dot"></span></span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" class="fb-disclosure-chevron" :class="{ 'fb-disclosure-chevron--open': sections.logic }">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                </button>
                <div v-show="sections.logic" class="fb-disclosure-body">
                    <LogicEditor :field="field" />
                </div>
            </section>

            <!-- ===================== Quiz ===================== -->
            <section v-if="supportsQuiz" class="fb-section">
                <button
                    type="button"
                    class="fb-disclosure fb-focus"
                    :aria-expanded="sections.quiz"
                    @click="sections.quiz = !sections.quiz"
                >
                    <span>{{ t('sectionQuiz') }}<span v-if="field.quiz" class="fb-section-dot"></span></span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" class="fb-disclosure-chevron" :class="{ 'fb-disclosure-chevron--open': sections.quiz }">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                </button>
                <div v-show="sections.quiz" class="fb-disclosure-body">
                    <QuizEditor :field="field" />
                </div>
            </section>

            <!-- ===================== Advanced ===================== -->
            <section class="fb-section">
                <button
                    type="button"
                    class="fb-disclosure fb-focus"
                    :aria-expanded="sections.advanced"
                    @click="sections.advanced = !sections.advanced"
                >
                    <span>{{ t('sectionAdvanced') }}</span>
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        aria-hidden="true"
                        class="fb-disclosure-chevron"
                        :class="{ 'fb-disclosure-chevron--open': sections.advanced }"
                    >
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                </button>

                <div v-show="sections.advanced" class="fb-disclosure-body">
                    <label class="fb-field">
                        <span class="fb-field-label">{{ t('fieldName') }}</span>
                        <input
                            v-model="nameDraft"
                            type="text"
                            class="fb-input fb-mono fb-focus"
                            :class="{ 'fb-input--error': nameError }"
                            spellcheck="false"
                            autocomplete="off"
                            dir="ltr"
                            @blur="commitName"
                            @keydown.enter.prevent="commitName"
                        />
                    </label>
                    <p v-if="nameError" class="fb-error">{{ t(nameError) }}</p>
                    <p class="fb-hint">{{ t('fieldNameHint') }}</p>
                    <p class="fb-warning">{{ t('fieldNameRenameWarning') }}</p>

                    <!-- required-field message override (fix 7) -->
                    <div v-if="supportsRequiredError" class="fb-field">
                        <span class="fb-field-label">{{ t('requiredErrorText') }}</span>
                        <input
                            v-model="requiredErrorValue"
                            type="text"
                            class="fb-input fb-focus"
                            :placeholder="t('requiredErrorTextPlaceholder')"
                        />
                        <span class="fb-hint">{{ t('requiredErrorTextHint') }}</span>
                    </div>
                </div>
            </section>
        </div>
    </aside>
</template>

<style scoped>
.fb-drawer {
    flex: 0 0 0;
    width: 0;
    background: var(--fb-surface);
    border-inline-start: 1px solid var(--fb-border);
    overflow-y: auto;
    transition: width 0.2s ease, flex-basis 0.2s ease;
}

.fb-drawer--open {
    flex-basis: 22.5rem;
    width: 22.5rem;
}

.fb-drawer-head {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1rem;
    background: var(--fb-surface);
    border-bottom: 1px solid var(--fb-border);
    z-index: 2;
}

.fb-drawer-title {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--fb-text);
    margin: 0;
}

.fb-drawer-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.875rem;
    height: 1.875rem;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background-color 0.15s;
}

.fb-drawer-close:hover {
    background: var(--fb-canvas);
}

.fb-drawer-close svg {
    width: 1.125rem;
    height: 1.125rem;
}

.fb-drawer-empty {
    padding: 2rem 1.25rem;
    color: var(--fb-text-muted);
    font-size: 0.875rem;
    text-align: center;
}

.fb-drawer-body {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.fb-section {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
}

.fb-section-title {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #9ca3af;
    margin: 0;
}

.fb-section-dot {
    display: inline-block;
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 9999px;
    background: var(--fb-brand);
    margin-inline-start: 0.375rem;
    vertical-align: middle;
}

.fb-field {
    display: flex;
    flex-direction: column;
    gap: 0.3125rem;
}

.fb-field-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
}

.fb-field-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--fb-text);
}

.fb-prefill-mode {
    margin-inline-start: auto;
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--fb-text-muted);
    background: var(--fb-canvas);
    border: 1px solid var(--fb-border);
    padding: 0.0625rem 0.375rem;
    border-radius: 0.3125rem;
}

.fb-row {
    display: flex;
    gap: 0.625rem;
}

.fb-row .fb-field {
    flex: 1 1 0;
    min-width: 0;
}

.fb-input {
    width: 100%;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.4375rem 0.625rem;
    font-size: 0.8125rem;
    color: var(--fb-text);
    background: var(--fb-surface);
    font-family: inherit;
}

.fb-textarea {
    resize: vertical;
    min-height: 2.5rem;
}

.fb-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
}

.fb-input--error {
    border-color: #dc2626;
}

.fb-input--expr {
    border-color: var(--fb-brand);
    background: var(--fb-brand-50);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
}

.fb-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--fb-text);
    cursor: pointer;
}

.fb-checkbox {
    width: 1rem;
    height: 1rem;
    accent-color: var(--fb-brand);
    cursor: pointer;
}

.fb-hint {
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    margin: 0;
    line-height: 1.4;
}

.fb-warning {
    font-size: 0.6875rem;
    color: #92400e;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 0.4375rem;
    padding: 0.375rem 0.5rem;
    margin: 0;
    line-height: 1.4;
}

.fb-error {
    font-size: 0.6875rem;
    color: #dc2626;
    margin: 0;
}

.fb-locked-note {
    font-size: 0.8125rem;
    color: var(--fb-text-muted);
    background: var(--fb-canvas);
    border: 1px solid var(--fb-border);
    border-radius: 0.5rem;
    padding: 0.625rem 0.75rem;
    line-height: 1.5;
}

.fb-disclosure {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    border: none;
    background: transparent;
    color: var(--fb-text);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    padding: 0;
}

.fb-disclosure-chevron {
    width: 1rem;
    height: 1rem;
    color: var(--fb-text-muted);
    transition: transform 0.15s;
}

.fb-disclosure-chevron--open {
    transform: rotate(180deg);
}

.fb-disclosure-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.625rem;
}

/* Segmented controls (rating type, etc.) */
.fb-segment-inline {
    display: inline-flex;
    align-self: flex-start;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    overflow: hidden;
}

.fb-seg-btn {
    border: none;
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.3125rem 0.625rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

.fb-seg-btn--active {
    background: var(--fb-brand);
    color: #fff;
}

/* Rating preview */
.fb-rate-preview {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: var(--fb-canvas);
    border: 1px solid var(--fb-border);
    border-radius: 0.5rem;
    padding: 0.5rem 0.625rem;
}

.fb-rate-preview-label {
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #9ca3af;
}

.fb-rate-preview-items {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-items: center;
}

.fb-rate-star {
    width: 1.125rem;
    height: 1.125rem;
    color: #f59e0b;
}

.fb-rate-smiley {
    width: 1.25rem;
    height: 1.25rem;
    color: var(--fb-brand-600);
}

.fb-rate-smiley-emoji {
    font-size: 1.125rem;
    line-height: 1.2;
}

.fb-rate-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    height: 1.5rem;
    padding: 0 0.375rem;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--fb-text);
    background: var(--fb-surface);
}

/* Image upload */
.fb-image-preview {
    border: 1px solid var(--fb-border);
    border-radius: 0.5rem;
    overflow: hidden;
    background: var(--fb-canvas);
}

.fb-image-preview img {
    display: block;
    width: 100%;
    max-height: 10rem;
    object-fit: contain;
}

.fb-image-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
}

.fb-image-remove {
    border: 1px solid var(--fb-border-strong);
    background: var(--fb-surface);
    color: #dc2626;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.4375rem 0.75rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
}

.fb-image-remove:hover {
    background: #fef2f2;
    border-color: #fca5a5;
}

.fb-hidden-file {
    display: none;
}

.fb-upload-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    border: 1px dashed var(--fb-border-strong);
    background: var(--fb-surface);
    color: var(--fb-text);
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
}

.fb-upload-btn:hover:not(:disabled) {
    border-color: var(--fb-brand);
    color: var(--fb-brand-600);
}

.fb-upload-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
}

.fb-spinner-sm {
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid var(--fb-border-strong);
    border-top-color: var(--fb-brand);
    border-radius: 9999px;
    animation: fb-spin 0.6s linear infinite;
}

@keyframes fb-spin {
    to {
        transform: rotate(360deg);
    }
}

@media (max-width: 1024px) {
    .fb-drawer--open {
        flex-basis: 18rem;
        width: 18rem;
    }
}
</style>
