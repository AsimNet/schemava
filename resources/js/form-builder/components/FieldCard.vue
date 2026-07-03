<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import draggable from 'vuedraggable';
import {
    store,
    selectField,
    setChoices,
    duplicateField,
    removeField,
    removeFieldCascade,
    fieldsReferencing,
    clearLabelFocus,
    clearFieldAdded,
    markDirty,
    addTemplateQuestion,
    updateTypeProp,
} from '../store.js';
import { t, i18n } from '../i18n.js';
import { fadeInUp, collapseOut, stop } from '../motion.js';
import { renameChoiceLabel, makeChoice, makeTextItem, sanitizeStatementHtml } from '../ui-helpers.js';
import { FIELD_TYPES, ADVANCED_TYPE } from '../model/fieldTypes.js';
import { ratingPreviewItems } from '../ui-helpers.js';
import AddQuestionMenu from './AddQuestionMenu.vue';
import MatrixCardGrid from './MatrixCardGrid.vue';
// Self-import: panel_dynamic cards render their template questions as nested
// FieldCards, so authoring inside a repeating panel is the same experience as
// authoring at the page level (Vite resolves the circular self-reference).
import FieldCard from './FieldCard.vue';

const props = defineProps({
    field: { type: Object, required: true },
    /** True when this card is a panel_dynamic template question (nested render). */
    nested: { type: Boolean, default: false },
});

/** Max choice rows rendered inline before the "+N" hint hands off to the drawer. */
const INLINE_CHOICE_LIMIT = 6;

const uiLocale = computed(() => i18n.locale);
const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');

const isAdvanced = computed(() => props.field.type === ADVANCED_TYPE);
const def = computed(() => FIELD_TYPES[props.field.type] ?? null);
const isSelected = computed(() => store.selectedFieldName === props.field.name);

const typeLabel = computed(() => {
    if (isAdvanced.value) {
        return props.field.raw?.type ?? ADVANCED_TYPE;
    }

    return def.value?.label?.[uiLocale.value] ?? def.value?.label?.ar ?? props.field.type;
});

const typeIcon = computed(() => def.value?.icon ?? null);

const labelValue = computed({
    get() {
        const lstr = props.field.label;
        if (!lstr) {
            return '';
        }

        return (contentLocale.value === 'en' ? lstr.en : lstr.ar) ?? '';
    },
    set(value) {
        const lstr = props.field.label;
        if (contentLocale.value === 'en') {
            lstr.en = value === '' ? null : value;
        } else {
            lstr.ar = value;
        }
        markDirty();
    },
});

const advancedLabel = computed(() => {
    const lstr = props.field.label;
    if (!lstr) {
        return props.field.name;
    }

    return lstr.ar || lstr.en || props.field.name;
});

/* --------------------------------------------------- enter / leave motion */

/** The card root element — the target for enter/leave animations. */
const cardEl = ref(null);

/**
 * Play the one-shot enter animation when this card is the just-added field. The
 * focal "a new question appeared" moment: a brief fade + upward slide. Gated on
 * the store marker so it never fires on initial paint or reorder re-renders, and
 * on reduced-motion inside the helper. Clears the marker once kicked off.
 */
function playEnterIfAdded() {
    if (store.justAddedFieldName !== props.field.name) {
        return;
    }
    clearFieldAdded();
    nextTick(() => fadeInUp(cardEl.value, { distance: 10 }));
}

/* --------------------------------------------------- label auto-focus (fix 1) */

/** Inline label <input>, focused when an add-question affordance requests it. */
const labelInput = ref(null);

/** Focus + select the inline label when this card is the pending focus target. */
function focusLabelIfRequested() {
    if (store.focusFieldName !== props.field.name) {
        return;
    }
    nextTick(() => {
        const el = labelInput.value;
        if (el && typeof el.focus === 'function') {
            el.focus();
            if (typeof el.select === 'function') {
                el.select();
            }
        }
        clearLabelFocus();
    });
}

onMounted(() => {
    playEnterIfAdded();
    focusLabelIfRequested();
});
watch(() => store.focusFieldName, focusLabelIfRequested);

onBeforeUnmount(() => stop(cardEl.value));

const hasLogic = computed(() => Boolean(props.field.logic));
const hasQuiz = computed(() => Boolean(props.field.quiz));

/** Whether this field's choices are editable inline on the card. imagepicker
 * stays read-only here — its choices carry image links that need the drawer. */
const isChoiceField = computed(() => ['single_choice', 'multi_choice', 'dropdown', 'ranking', 'tagbox'].includes(props.field.type));

/** imagepicker with no choices yet: point at the drawer instead of a dead void. */
const isEmptyImagePicker = computed(() => props.field.type === 'imagepicker' && allChoices.value.length === 0);

/* --------------------------------------------- matrix family (canvas grid) */

const isMatrixFamily = computed(() => ['matrix', 'matrixdropdown', 'matrixdynamic'].includes(props.field.type));

/* --------------------------------------- multipletext items (canvas rows) */

const isMultipleText = computed(() => props.field.type === 'multipletext');

const textItems = computed(() => {
    const list = props.field.typeProps?.items;

    return Array.isArray(list) ? list : [];
});

function itemTitleText(item) {
    const lstr = item?.title ?? { ar: '', en: null };

    return (contentLocale.value === 'en' ? lstr.en : lstr.ar) ?? '';
}

const itemInputs = ref([]);

function setItemInputRef(el, index) {
    if (el) {
        itemInputs.value[index] = el;
    }
}

function onItemTitleInput(index, value) {
    const next = [...textItems.value];
    const item = { ...next[index] };
    const lstr = { ...(item.title ?? { ar: '', en: null }) };
    if (contentLocale.value === 'en') {
        lstr.en = value === '' ? null : value;
    } else {
        lstr.ar = value;
    }
    item.title = lstr;
    next[index] = item;
    updateTypeProp(props.field.name, 'items', next);
}

function removeItemAt(index) {
    updateTypeProp(props.field.name, 'items', textItems.value.filter((_, i) => i !== index));
}

function addItem() {
    const next = [...textItems.value, makeTextItem('', textItems.value.map((item) => item.name))];
    updateTypeProp(props.field.name, 'items', next);
    nextTick(() => itemInputs.value[next.length - 1]?.focus());
}

function onItemKeydown(index, event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        if (index === textItems.value.length - 1) {
            addItem();
        } else {
            itemInputs.value[index + 1]?.focus();
        }
    } else if (event.key === 'Escape') {
        event.preventDefault();
        event.target.blur();
    }
}

const allChoices = computed(() => (Array.isArray(props.field.choices) ? props.field.choices : []));

function isCorrectChoice(value) {
    const correct = props.field.quiz?.correct;
    if (Array.isArray(correct)) {
        return correct.includes(value);
    }

    return correct !== undefined && correct !== null && correct === value;
}

/**
 * Choice rows shown on the card. Editable choice fields render up to
 * `INLINE_CHOICE_LIMIT` rows inline (each editable in place); the rest collapse
 * into a "+N" hint that opens the drawer. Non-editable fields keep the legacy
 * read-only preview (capped at 5 rows).
 */
const choicePreview = computed(() => {
    if (allChoices.value.length === 0) {
        return [];
    }
    const limit = isChoiceField.value ? INLINE_CHOICE_LIMIT : 5;

    return allChoices.value.slice(0, limit).map((choice, index) => ({
        index,
        // Stable per-row key so blank choices (value === '') don't collide.
        uid: choice._uid ?? `idx_${index}`,
        value: choice.value,
        text: (contentLocale.value === 'en' ? choice.label?.en : choice.label?.ar) ?? choice.label?.ar ?? String(choice.value),
        correct: isCorrectChoice(choice.value),
    }));
});

const extraChoiceCount = computed(() => {
    const limit = isChoiceField.value ? INLINE_CHOICE_LIMIT : 5;

    return allChoices.value.length > limit ? allChoices.value.length - limit : 0;
});

/* -------------------------------------------------- inline choice editing */

/** Refs to the inline row inputs, keyed by choice index, for focus control. */
const choiceInputs = ref([]);

function setChoiceInputRef(el, index) {
    if (el) {
        choiceInputs.value[index] = el;
    }
}

/** Rename a choice's active-locale label in place (value mirrors per the rule). */
function onChoiceLabelInput(index, value) {
    const next = [...allChoices.value];
    if (!next[index]) {
        return;
    }
    next[index] = renameChoiceLabel(next[index], contentLocale.value, value);
    setChoices(props.field.name, next);
}

function removeChoiceAt(index) {
    const next = allChoices.value.filter((_, i) => i !== index);
    setChoices(props.field.name, next);
}

/** Append a blank choice and focus it (Google-Forms-like add affordance). */
function addChoice() {
    const next = [...allChoices.value, makeChoice('')];
    setChoices(props.field.name, next);
    const newIndex = next.length - 1;
    nextTick(() => {
        choiceInputs.value[newIndex]?.focus();
    });
}

/** Enter on a row commits and appends the next choice; Esc blurs (commit). */
function onChoiceKeydown(index, event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        // Only spawn a new row from the last visible row to avoid surprising jumps.
        if (index === allChoices.value.length - 1) {
            addChoice();
        } else {
            choiceInputs.value[index + 1]?.focus();
        }
    } else if (event.key === 'Escape') {
        event.preventDefault();
        event.target.blur();
    }
}

/** Open the drawer (full ChoicesEditor) when the "+N" overflow hint is clicked. */
function openChoicesDrawer() {
    selectField(props.field.name);
}

/**
 * The نعم/لا rows shown on a yes_no card. Created fields carry explicit Arabic
 * labels; imported fields without labels fall back to نعم/لا placeholders so the
 * card always communicates the boolean output (the renderer resolves the real
 * labels at runtime).
 */
const yesNoPreview = computed(() => {
    if (props.field.type !== 'yes_no') {
        return [];
    }
    const pick = (lstr) => (contentLocale.value === 'en' ? lstr?.en : lstr?.ar) ?? lstr?.ar ?? '';

    return [
        { key: 'true', text: pick(props.field.typeProps?.labelTrue), placeholder: 'نعم' },
        { key: 'false', text: pick(props.field.typeProps?.labelFalse), placeholder: 'لا' },
    ];
});

/** Edit the نعم/لا labels in place on the card (canvas-first, like choices). */
function onYesNoInput(key, value) {
    const propKey = key === 'true' ? 'labelTrue' : 'labelFalse';
    const lstr = { ...(props.field.typeProps?.[propKey] ?? { ar: '', en: null }) };
    if (contentLocale.value === 'en') {
        lstr.en = value === '' ? null : value;
    } else {
        lstr.ar = value;
    }
    updateTypeProp(props.field.name, propKey, lstr);
}

/* ------------------------------------------------- rating preview (fix 3) */

const isRating = computed(() => props.field.type === 'rating');

/** Live rating style descriptor for the card preview (reacts to drawer edits). */
const ratingPreview = computed(() => {
    if (!isRating.value) {
        return null;
    }

    return ratingPreviewItems(props.field.typeProps);
});

/* ----------------------------------------------- statement content (fix 4) */

const isStatement = computed(() => props.field.type === 'statement');

/**
 * The statement's active-locale html (the LStr behind typeProps.html). SurveyJS
 * `html` elements render only their `html`, so the card shows the rendered markup
 * (sanitized) and the label is irrelevant for this type (spec fix 4). Editing
 * happens in the drawer's rich editor; the card is a faithful preview.
 */
const statementRawHtml = computed(() => {
    const lstr = props.field.typeProps?.html;
    if (!lstr || typeof lstr !== 'object') {
        return '';
    }

    return (contentLocale.value === 'en' ? lstr.en : lstr.ar) ?? '';
});

/** Sanitized html for v-html on the card (strip `<script>` — admin-trust). */
const statementHtml = computed(() => sanitizeStatementHtml(statementRawHtml.value));
const statementHasContent = computed(() => statementHtml.value.trim() !== '');

/* ----------------------------------------------------- image preview (fix 5) */

const isImage = computed(() => props.field.type === 'image');
const imageLink = computed(() => props.field.typeProps?.imageLink ?? null);

/* --------------------------------------- panel_dynamic nested authoring */

const isPanelDynamic = computed(() => props.field.type === 'panel_dynamic');

/**
 * The panel's template questions — the LIVE store array, so the nested
 * draggable's in-place mutations persist (mirrors BuilderCanvas's binding).
 * makeField/serialize always seed `templateElements: []` for panel_dynamic,
 * so the fallback only guards hand-crafted states.
 */
const templateList = computed(() => {
    const list = props.field.typeProps?.templateElements;

    return Array.isArray(list) ? list : [];
});

const templateQuestionCount = computed(() => templateList.value.length);

/** What the respondent's add-entry button will say (falls back like the runtime). */
const panelAddLabel = computed(() => {
    const lstr = props.field.typeProps?.panelAddText;
    const text = (contentLocale.value === 'en' ? lstr?.en : lstr?.ar) ?? lstr?.ar ?? '';

    return text !== '' ? text : t('panelAddTextPlaceholder');
});

const panelMaxCount = computed(() => {
    const max = props.field.typeProps?.maxPanelCount;

    return typeof max === 'number' && Number.isFinite(max) ? max : null;
});

/** Add a question inside this panel (selects it + auto-focuses its label). */
function onAddTemplateQuestion(typeId) {
    addTemplateQuestion(props.field.name, typeId);
}

/**
 * Nested draggable change handler — vuedraggable already mutated the bound
 * template array in place, so only the dirty flag needs to be raised.
 */
function onTemplateChange() {
    markDirty();
}

function onSelect(event) {
    // Nested cards live inside their parent's clickable body: stop the click
    // here so the parent card doesn't immediately steal the selection back.
    event?.stopPropagation?.();
    selectField(props.field.name);
}

function onDuplicate() {
    duplicateField(props.field.name);
}

const confirmOpen = ref(false);
const dependents = ref([]);

function dependentLabel(entry) {
    const lstr = entry.label;
    const text = (contentLocale.value === 'en' ? lstr?.en : lstr?.ar) ?? lstr?.ar ?? '';

    return text || entry.name;
}

/**
 * Collapse the card out, then invoke `remove` once the motion settles so the
 * row's gap closes smoothly before the store splices it away. Under reduced
 * motion (or a missing node) `collapseOut` resolves `onComplete` synchronously,
 * so removal stays instant. The list gap (`.fb-field-list`, 0.625rem = 10px) is
 * folded into the collapse so neighbours don't jump. Store removal logic is
 * unchanged — only the timing of the call is animated.
 *
 * @param {() => void} remove  the store remover for this field
 */
function animateThenRemove(remove) {
    collapseOut(cardEl.value, { gap: 10, onComplete: remove });
}

function onDelete() {
    const refs = fieldsReferencing(props.field.name);
    if (refs.length > 0) {
        dependents.value = refs;
        confirmOpen.value = true;

        return;
    }
    animateThenRemove(() => removeField(props.field.name));
}

function confirmDelete() {
    confirmOpen.value = false;
    animateThenRemove(() => removeFieldCascade(props.field.name));
}

function cancelDelete() {
    confirmOpen.value = false;
}
</script>

<template>
    <div
        ref="cardEl"
        class="fb-card"
        :class="{ 'fb-card--selected': isSelected, 'fb-card--locked': isAdvanced, 'fb-card--nested': nested }"
        :data-field-name="field.name"
        @click="onSelect"
    >
        <button
            type="button"
            :class="nested ? 'fb-subdrag-handle' : 'fb-drag-handle'"
            :title="t('dragHandle')"
            :aria-label="t('dragHandle')"
            @click.stop
        >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="9" cy="6" r="1.6" />
                <circle cx="15" cy="6" r="1.6" />
                <circle cx="9" cy="12" r="1.6" />
                <circle cx="15" cy="12" r="1.6" />
                <circle cx="9" cy="18" r="1.6" />
                <circle cx="15" cy="18" r="1.6" />
            </svg>
        </button>

        <div class="fb-card-body">
            <div class="fb-card-meta">
                <span class="fb-type-badge">
                    <svg v-if="typeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" :d="typeIcon" />
                    </svg>
                    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                        />
                    </svg>
                    <span>{{ typeLabel }}</span>
                </span>
                <span v-if="field.required" class="fb-required" :title="t('required')">*</span>
                <span v-if="field.hidden" class="fb-hidden-pill">{{ t('hiddenToggle') }}</span>

                <span class="fb-card-flags">
                    <span v-if="hasLogic" class="fb-flag fb-flag--logic" :title="t('sectionLogic')" :aria-label="t('sectionLogic')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </span>
                    <span v-if="hasQuiz" class="fb-flag fb-flag--quiz" :title="t('sectionQuiz')" :aria-label="t('sectionQuiz')">
                        Σ{{ Number(field.quiz.score ?? 1) }}
                    </span>
                </span>
            </div>

            <template v-if="isAdvanced">
                <div class="fb-locked-label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" class="fb-lock-icon">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            d="M16.5 10.5V6.75a4.5 4.5 0 00-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                        />
                    </svg>
                    <span class="fb-locked-text">{{ advancedLabel }}</span>
                </div>
                <p class="fb-locked-hint">
                    <code class="fb-locked-name">{{ field.name }}</code>
                    · {{ t('lockedFieldHint') }}
                </p>
            </template>

            <template v-else>
                <input
                    v-if="!isStatement"
                    ref="labelInput"
                    v-model="labelValue"
                    type="text"
                    class="fb-card-label fb-focus"
                    :placeholder="t('fieldLabelPlaceholder')"
                    :aria-label="t('labelField')"
                    @click.stop
                />

                <!-- statement: render the formatted HTML so the admin sees it on
                     the canvas; editing happens in the drawer's rich editor (fix 4).
                     Admin-trust content, but `<script>` is stripped defensively. -->
                <template v-if="isStatement">
                    <div
                        v-if="statementHasContent"
                        class="fb-card-statement-html"
                        :dir="contentLocale === 'en' ? 'ltr' : 'rtl'"
                        v-html="statementHtml"
                    ></div>
                    <p v-else class="fb-card-statement-empty" @click.stop="onSelect">
                        {{ t('statementCardEmpty') }}
                    </p>
                </template>

                <!-- image: show the uploaded thumbnail on the card (fix 5) -->
                <template v-if="isImage">
                    <div v-if="imageLink" class="fb-card-image">
                        <img :src="imageLink" :alt="t('imagePreviewAlt')" loading="lazy" />
                    </div>
                    <p v-else class="fb-card-image-empty">{{ t('imageCardEmpty') }}</p>
                </template>

                <!-- panel_dynamic: the panel template IS the card — its questions
                     render as nested cards with the full inline experience
                     (label editing, choices, drag-reorder, duplicate, delete),
                     and clicking one opens its full settings drawer. -->
                <div v-if="isPanelDynamic" class="fb-panel">
                    <div class="fb-panel-bar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" class="fb-panel-bar-icon">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M21.015 4.356v4.99m0 0l-3.181-3.182a8.25 8.25 0 00-13.803 3.7" />
                        </svg>
                        <span class="fb-panel-bar-text">{{ t('panelRepeatsBadge') }}</span>
                        <span class="fb-panel-count-chip">{{ templateQuestionCount }} {{ t('panelQuestionsChip') }}</span>
                    </div>

                    <p v-if="templateQuestionCount === 0" class="fb-panel-empty">
                        {{ t('panelTemplateEmpty') }}
                    </p>

                    <draggable
                        v-else
                        :list="templateList"
                        item-key="name"
                        handle=".fb-subdrag-handle"
                        class="fb-panel-sublist"
                        ghost-class="fb-ghost"
                        chosen-class="fb-chosen"
                        drag-class="fb-drag"
                        :animation="150"
                        @change="onTemplateChange"
                    >
                        <template #item="{ element }">
                            <FieldCard :field="element" nested />
                        </template>
                    </draggable>

                    <div class="fb-panel-foot" @click.stop>
                        <AddQuestionMenu :exclude-types="['panel_dynamic']" :hint="t('addQuestionHintPanel')" @select="onAddTemplateQuestion" />
                        <!-- Not a builder control: explains that respondents add
                             entries at fill time (tooltip shows their button text). -->
                        <span class="fb-panel-addpreview" :title="`${t('panelAddPreviewTitle')}: ${panelAddLabel}`" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            <span>{{ t('panelRespondentsAdd') }}</span>
                            <span v-if="panelMaxCount" class="fb-panel-addpreview-max">×{{ panelMaxCount }}</span>
                        </span>
                    </div>
                </div>

                <!-- rating: reflect the configured rateType + rateMax (fix 3) -->
                <div v-if="ratingPreview" class="fb-card-rating" :aria-label="t('ratePreview')">
                    <template v-if="ratingPreview.type === 'stars'">
                        <svg v-for="n in ratingPreview.items" :key="n" viewBox="0 0 24 24" fill="currentColor" class="fb-card-rating-star" aria-hidden="true">
                            <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                        </svg>
                    </template>
                    <template v-else-if="ratingPreview.type === 'smileys'">
                        <span v-for="(emoji, idx) in ratingPreview.items" :key="idx" class="fb-card-rating-smiley" aria-hidden="true">{{ emoji }}</span>
                    </template>
                    <template v-else>
                        <span v-for="n in ratingPreview.items" :key="n" class="fb-card-rating-num">{{ n }}</span>
                    </template>
                </div>

                <ul v-if="choicePreview.length && isChoiceField" class="fb-card-choices">
                    <li
                        v-for="choice in choicePreview"
                        :key="choice.uid"
                        class="fb-card-choice fb-card-choice--editable"
                    >
                        <span class="fb-card-choice-mark" :class="{ 'fb-card-choice-mark--correct': choice.correct }" aria-hidden="true">
                            <svg v-if="choice.correct" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                        </span>
                        <input
                            :ref="(el) => setChoiceInputRef(el, choice.index)"
                            :value="choice.text"
                            type="text"
                            class="fb-card-choice-edit fb-focus"
                            :placeholder="t('fieldLabelPlaceholder')"
                            :aria-label="t('choicesLabel')"
                            @click.stop
                            @input="onChoiceLabelInput(choice.index, $event.target.value)"
                            @keydown="onChoiceKeydown(choice.index, $event)"
                        />
                        <button
                            type="button"
                            class="fb-card-choice-remove fb-focus"
                            :title="t('removeChoice')"
                            :aria-label="t('removeChoice')"
                            @click.stop="removeChoiceAt(choice.index)"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </li>
                    <li v-if="extraChoiceCount" class="fb-card-choice fb-card-choice--more">
                        <button type="button" class="fb-card-choice-more-btn fb-focus" @click.stop="openChoicesDrawer">
                            +{{ extraChoiceCount }}
                        </button>
                    </li>
                </ul>

                <button
                    v-if="isChoiceField"
                    type="button"
                    class="fb-card-add-choice fb-focus"
                    @click.stop="addChoice"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span>{{ t('addChoice') }}</span>
                </button>

                <ul v-if="choicePreview.length && !isChoiceField" class="fb-card-choices">
                    <li v-for="choice in choicePreview" :key="choice.uid" class="fb-card-choice">
                        <span class="fb-card-choice-mark" :class="{ 'fb-card-choice-mark--correct': choice.correct }" aria-hidden="true">
                            <svg v-if="choice.correct" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                        </span>
                        <span class="fb-card-choice-text">{{ choice.text }}</span>
                    </li>
                    <li v-if="extraChoiceCount" class="fb-card-choice fb-card-choice--more">
                        +{{ extraChoiceCount }}
                    </li>
                </ul>

                <p v-if="isEmptyImagePicker" class="fb-card-image-empty">{{ t('imagePickerCardEmpty') }}</p>

                <ul v-if="yesNoPreview.length" class="fb-card-choices">
                    <li v-for="option in yesNoPreview" :key="option.key" class="fb-card-choice fb-card-choice--editable">
                        <span class="fb-card-choice-mark" aria-hidden="true"></span>
                        <input
                            :value="option.text"
                            type="text"
                            class="fb-card-choice-edit fb-focus"
                            :placeholder="option.placeholder"
                            :aria-label="t('labelField')"
                            @click.stop
                            @input="onYesNoInput(option.key, $event.target.value)"
                        />
                    </li>
                </ul>

                <!-- matrix family: the grid IS the card — rows/columns edited
                     in place; cell types & per-column choices in the drawer. -->
                <MatrixCardGrid v-if="isMatrixFamily" :field="field" />

                <!-- multipletext: its textbox items, edited in place -->
                <ul v-if="isMultipleText" class="fb-card-items" @click.stop>
                    <li v-for="(item, index) in textItems" :key="item._uid ?? index" class="fb-card-item">
                        <span class="fb-card-item-mark" aria-hidden="true"></span>
                        <input
                            :ref="(el) => setItemInputRef(el, index)"
                            :value="itemTitleText(item)"
                            type="text"
                            size="1"
                            class="fb-card-item-edit fb-focus"
                            :placeholder="t('textItemTitlePlaceholder')"
                            :aria-label="t('textItemsLabel')"
                            @input="onItemTitleInput(index, $event.target.value)"
                            @keydown="onItemKeydown(index, $event)"
                        />
                        <button
                            type="button"
                            class="fb-card-choice-remove fb-focus"
                            :title="t('removeTextItem')"
                            :aria-label="t('removeTextItem')"
                            @click.stop="removeItemAt(index)"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </li>
                </ul>

                <button
                    v-if="isMultipleText"
                    type="button"
                    class="fb-card-add-choice fb-focus"
                    @click.stop="addItem"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span>{{ t('addTextItem') }}</span>
                </button>
            </template>
        </div>

        <div class="fb-card-actions">
            <button
                type="button"
                class="fb-action fb-focus"
                :title="t('duplicate')"
                :aria-label="t('duplicate')"
                @click.stop="onDuplicate"
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.6"
                        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m11.25 5.95h-3.375c-.621 0-1.125-.504-1.125-1.125V3.125"
                    />
                </svg>
            </button>
            <button
                type="button"
                class="fb-action fb-action--danger fb-focus"
                :title="t('delete')"
                :aria-label="t('delete')"
                @click.stop="onDelete"
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.6"
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                </svg>
            </button>
        </div>

        <Teleport to="body">
            <div v-if="confirmOpen" class="fb-modal-overlay" @click.self="cancelDelete">
                <div class="fb-modal" :dir="i18n.locale === 'ar' ? 'rtl' : 'ltr'" role="dialog" aria-modal="true" @click.stop>
                    <h3 class="fb-modal-title">{{ t('deleteFieldConfirmTitle') }}</h3>
                    <p class="fb-modal-text">{{ t('deleteFieldReferenced') }}</p>
                    <ul class="fb-modal-list">
                        <li v-for="dep in dependents" :key="dep.name">{{ dependentLabel(dep) }}</li>
                    </ul>
                    <div class="fb-modal-actions">
                        <button type="button" class="fb-modal-btn fb-focus" @click="cancelDelete">{{ t('cancel') }}</button>
                        <button type="button" class="fb-modal-btn fb-modal-btn--danger fb-focus" @click="confirmDelete">{{ t('confirm') }}</button>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<style>
/* Confirmation modal (teleported to body — uses the builder font stack). */
.fb-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.45);
    padding: 1rem;
    font-family: "IBM Plex Sans Arabic", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.fb-modal {
    width: 100%;
    max-width: 22rem;
    background: #ffffff;
    border-radius: 0.875rem;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
    padding: 1.25rem;
}

.fb-modal-title {
    font-size: 1rem;
    font-weight: 700;
    color: #111827;
    margin: 0 0 0.5rem;
}

.fb-modal-text {
    font-size: 0.8125rem;
    color: #6b7280;
    margin: 0 0 0.625rem;
    line-height: 1.5;
}

.fb-modal-list {
    margin: 0 0 1rem;
    padding-inline-start: 1.25rem;
    font-size: 0.8125rem;
    color: #111827;
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
}

.fb-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
}

.fb-modal-btn {
    border: 1px solid #d1d5db;
    background: #ffffff;
    color: #111827;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.4375rem 0.875rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background-color 0.15s;
}

.fb-modal-btn:hover {
    background: #f9fafb;
}

.fb-modal-btn--danger {
    border-color: #dc2626;
    background: #dc2626;
    color: #fff;
}

.fb-modal-btn--danger:hover {
    background: #b91c1c;
}
</style>

<style scoped>
.fb-card {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius);
    padding: 0.75rem 0.875rem;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
}

.fb-card:hover {
    border-color: var(--fb-border-strong);
}

.fb-card--selected {
    border-color: var(--fb-brand);
    box-shadow: 0 0 0 1px var(--fb-brand);
}

.fb-card--locked {
    background: #fbfbfc;
    border-style: dashed;
}

.fb-drag-handle {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.75rem;
    border: none;
    background: transparent;
    color: #c4c7cd;
    cursor: grab;
    border-radius: 0.375rem;
    padding: 0;
}

.fb-drag-handle:hover {
    color: var(--fb-text-muted);
    background: var(--fb-canvas);
}

.fb-drag-handle:active {
    cursor: grabbing;
}

.fb-drag-handle svg {
    width: 1.125rem;
    height: 1.125rem;
}

.fb-card-body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.fb-card-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.fb-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--fb-text-muted);
    background: var(--fb-canvas);
    border: 1px solid var(--fb-border);
    padding: 0.1875rem 0.4375rem;
    border-radius: 0.4375rem;
}

.fb-type-badge svg {
    width: 0.875rem;
    height: 0.875rem;
}

.fb-required {
    color: #dc2626;
    font-weight: 700;
    font-size: 0.9375rem;
    line-height: 1;
}

.fb-hidden-pill {
    font-size: 0.6875rem;
    font-weight: 600;
    color: #92400e;
    background: #fef3c7;
    padding: 0.125rem 0.4375rem;
    border-radius: 0.4375rem;
}

.fb-card-label {
    width: 100%;
    border: none;
    background: transparent;
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--fb-text);
    padding: 0.125rem 0;
}

.fb-card-label::placeholder {
    color: #9ca3af;
    font-weight: 400;
}

/* statement rendered html preview (fix 4 — editing lives in the drawer) */
.fb-card-statement-html {
    font-size: 0.875rem;
    color: var(--fb-text);
    line-height: 1.6;
    overflow-wrap: anywhere;
}

.fb-card-statement-html :deep(h2) {
    font-size: 1.0625rem;
    font-weight: 700;
    margin: 0.25rem 0;
}

.fb-card-statement-html :deep(h3) {
    font-size: 0.9375rem;
    font-weight: 700;
    margin: 0.25rem 0;
}

.fb-card-statement-html :deep(ul) {
    margin: 0.25rem 0;
    padding-inline-start: 1.25rem;
}

.fb-card-statement-html :deep(p) {
    margin: 0.25rem 0;
}

.fb-card-statement-html :deep(a) {
    color: var(--fb-brand-600);
    text-decoration: underline;
}

.fb-card-statement-empty {
    margin: 0;
    font-size: 0.875rem;
    color: #9ca3af;
    background: var(--fb-canvas);
    border: 1px dashed var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.4375rem 0.5rem;
    line-height: 1.5;
}

/* image thumbnail on the card (fix 5) */
.fb-card-image {
    border: 1px solid var(--fb-border);
    border-radius: 0.5rem;
    overflow: hidden;
    background: var(--fb-canvas);
}

.fb-card-image img {
    display: block;
    width: 100%;
    max-height: 160px;
    object-fit: cover;
}

/* ------------------- panel_dynamic: nested template container ------------------- */

/*
 * The template container reads as a "stack of sheets" (offset shadow layers
 * below) so the repetition is visible at a glance without any copy.
 */
.fb-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--fb-canvas);
    border: 1px solid var(--fb-border);
    border-radius: 0.625rem;
    padding: 0.625rem;
    margin-bottom: 0.5rem;
    box-shadow:
        0 0.25rem 0 -0.125rem var(--fb-surface),
        0 0.3125rem 0 -0.125rem var(--fb-border),
        0 0.5625rem 0 -0.3125rem var(--fb-surface),
        0 0.625rem 0 -0.3125rem var(--fb-border);
}

.fb-panel-bar {
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

.fb-panel-bar-icon {
    flex: 0 0 auto;
    width: 0.875rem;
    height: 0.875rem;
    color: var(--fb-brand-600);
}

.fb-panel-bar-text {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 0.71875rem;
    font-weight: 700;
    color: var(--fb-brand-600);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.fb-panel-count-chip {
    flex: 0 0 auto;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--fb-text-muted);
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    padding: 0.125rem 0.4375rem;
    border-radius: 0.4375rem;
    white-space: nowrap;
}

.fb-panel-empty {
    margin: 0;
    font-size: 0.75rem;
    color: var(--fb-text-muted);
    background: var(--fb-surface);
    border: 1px dashed var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.75rem;
    text-align: center;
}

.fb-panel-sublist {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.fb-panel-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    cursor: default;
}

/* Faithful mini-preview of the respondent's add-entry button (decorative). */
.fb-panel-addpreview {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.71875rem;
    font-weight: 600;
    color: var(--fb-text-muted);
    border: 1px dashed var(--fb-border-strong);
    border-radius: 999px;
    padding: 0.25rem 0.625rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 45%;
}

.fb-panel-addpreview svg {
    flex: 0 0 auto;
    width: 0.6875rem;
    height: 0.6875rem;
}

.fb-panel-addpreview-max {
    color: var(--fb-brand-600);
    font-weight: 700;
}

/* Nested (template) cards: compact chrome, same interaction model. */
.fb-card--nested {
    padding: 0.5rem 0.625rem;
    border-radius: 0.5rem;
    cursor: pointer;
}

.fb-card--nested .fb-card-label {
    font-size: 0.875rem;
}

.fb-subdrag-handle {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.5rem;
    border: none;
    background: transparent;
    color: #c4c7cd;
    cursor: grab;
    border-radius: 0.375rem;
    padding: 0;
}

.fb-subdrag-handle:hover {
    color: var(--fb-text-muted);
    background: var(--fb-canvas);
}

.fb-subdrag-handle:active {
    cursor: grabbing;
}

.fb-subdrag-handle svg {
    width: 1rem;
    height: 1rem;
}

.fb-card-image-empty {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--fb-text-muted);
    background: var(--fb-canvas);
    border: 1px dashed var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.625rem 0.75rem;
    text-align: center;
}

/* rating preview reflecting rateType/rateMax (fix 3) */
.fb-card-rating {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
}

.fb-card-rating-star {
    width: 1.25rem;
    height: 1.25rem;
    color: #f59e0b;
}

.fb-card-rating-smiley {
    font-size: 1.125rem;
    line-height: 1.2;
}

.fb-card-rating-num {
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

.fb-locked-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--fb-text);
}

.fb-lock-icon {
    width: 0.9375rem;
    height: 0.9375rem;
    color: var(--fb-text-muted);
    flex: 0 0 auto;
}

.fb-locked-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.fb-locked-hint {
    font-size: 0.75rem;
    color: var(--fb-text-muted);
    margin: 0;
    line-height: 1.4;
}

.fb-locked-name {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.6875rem;
    background: var(--fb-canvas);
    border: 1px solid var(--fb-border);
    padding: 0.0625rem 0.25rem;
    border-radius: 0.25rem;
}

.fb-card-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 0.125rem;
}

.fb-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    border-radius: 0.4375rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

.fb-action:hover {
    background: var(--fb-canvas);
    color: var(--fb-text);
}

.fb-action svg {
    width: 1rem;
    height: 1rem;
}

.fb-action--danger:hover {
    background: #fef2f2;
    color: #dc2626;
}

.fb-card-flags {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-inline-start: auto;
}

.fb-flag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.375rem;
    font-size: 0.625rem;
    font-weight: 700;
}

.fb-flag--logic {
    width: 1.125rem;
    height: 1.125rem;
    color: var(--fb-brand-600);
    background: var(--fb-brand-50);
}

.fb-flag--logic svg {
    width: 0.8125rem;
    height: 0.8125rem;
}

.fb-flag--quiz {
    padding: 0.0625rem 0.3125rem;
    color: #b45309;
    background: #fef3c7;
    line-height: 1.2;
}

.fb-card-choices {
    list-style: none;
    margin: 0.125rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
}

.fb-card-choice {
    display: flex;
    align-items: center;
    gap: 0.4375rem;
    font-size: 0.8125rem;
    color: var(--fb-text-muted);
}

.fb-card-choice-mark {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 0.875rem;
    height: 0.875rem;
    border: 1.5px solid var(--fb-border-strong);
    border-radius: 9999px;
    color: #fff;
}

.fb-card-choice-mark--correct {
    background: var(--fb-brand);
    border-color: var(--fb-brand);
}

.fb-card-choice-mark svg {
    width: 0.625rem;
    height: 0.625rem;
}

.fb-card-choice-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.fb-card-choice--more {
    font-size: 0.6875rem;
    font-weight: 600;
    color: #9ca3af;
    padding-inline-start: 1.3125rem;
}

.fb-card-choice--editable {
    gap: 0.375rem;
}

/* multipletext items — same rhythm as editable choices, text-line mark */
.fb-card-items {
    list-style: none;
    margin: 0.125rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
    cursor: default;
}

.fb-card-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    color: var(--fb-text-muted);
}

.fb-card-item-mark {
    flex: 0 0 auto;
    width: 0.875rem;
    height: 0;
    border-bottom: 1.5px solid var(--fb-border-strong);
}

.fb-card-item-edit {
    flex: 1 1 0;
    min-width: 0;
    border: 1px solid transparent;
    background: transparent;
    font-size: 0.8125rem;
    color: var(--fb-text);
    padding: 0.25rem 0.375rem;
    border-radius: 0.375rem;
    font-family: inherit;
    transition: border-color 0.15s, background-color 0.15s;
}

.fb-card-item-edit:hover {
    border-color: var(--fb-border);
}

.fb-card-item-edit:focus {
    border-color: var(--fb-border-strong);
    background: var(--fb-surface);
}

.fb-card-item-edit::placeholder {
    color: #b6bac2;
    font-weight: 400;
}

.fb-card-choice-edit {
    flex: 1 1 auto;
    min-width: 0;
    border: 1px solid transparent;
    background: transparent;
    font-size: 0.8125rem;
    color: var(--fb-text);
    padding: 0.1875rem 0.375rem;
    border-radius: 0.375rem;
    font-family: inherit;
    transition: border-color 0.15s, background-color 0.15s;
}

.fb-card-choice-edit::placeholder {
    color: #b6bac1;
}

.fb-card-choice-edit:hover {
    border-color: var(--fb-border);
}

.fb-card-choice-edit:focus {
    outline: none;
    border-color: var(--fb-brand);
    background: var(--fb-surface);
}

.fb-card-choice-remove {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.375rem;
    height: 1.375rem;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    border-radius: 0.375rem;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background-color 0.15s, color 0.15s;
}

.fb-card-choice--editable:hover .fb-card-choice-remove,
.fb-card-choice-remove:focus-visible {
    opacity: 1;
}

.fb-card-choice-remove:hover {
    background: #fef2f2;
    color: #dc2626;
}

.fb-card-choice-remove svg {
    width: 0.8125rem;
    height: 0.8125rem;
}

.fb-card-choice-more-btn {
    border: none;
    background: transparent;
    color: #9ca3af;
    font-size: 0.6875rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0.125rem 0.25rem;
    border-radius: 0.375rem;
}

.fb-card-choice-more-btn:hover {
    color: var(--fb-brand-600);
    background: var(--fb-brand-50);
}

.fb-card-add-choice {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
    align-self: flex-start;
    margin-top: 0.125rem;
    margin-inline-start: 1.3125rem;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.1875rem 0.375rem;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: color 0.15s, background-color 0.15s;
}

.fb-card-add-choice:hover {
    color: var(--fb-brand-600);
    background: var(--fb-brand-50);
}

.fb-card-add-choice svg {
    width: 0.8125rem;
    height: 0.8125rem;
}
</style>
