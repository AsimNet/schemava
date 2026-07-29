<script setup>
import { computed } from 'vue';
import { t } from '../i18n.js';
import { store, setSurveyText, addTrigger, updateTrigger, removeTrigger, allFieldEntries } from '../store.js';
import CalculatedValuesEditor from './CalculatedValuesEditor.vue';

const props = defineProps({
    open: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

/* --------------------------------------------------- jump / finish triggers */

const triggers = computed(() => (Array.isArray(store.state?.triggers) ? store.state.triggers : []));

/** Editable trigger kinds; anything else is preserved verbatim (read-only). */
const EDITABLE_TRIGGERS = ['skip', 'complete'];

const questionOptions = computed(() => allFieldEntries().map((entry) => ({
    name: entry.name,
    label: (((contentLocale.value === 'en' ? entry.label?.en : entry.label?.ar) ?? entry.label?.ar) || entry.name),
})));

function isEditableTrigger(trigger) {
    return EDITABLE_TRIGGERS.includes(trigger.type);
}

const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');

/**
 * The six survey-level texts. Placeholders show the Arabic defaults the
 * serializer applies when a value is left empty (legacy `applySurveyTextDefaults`).
 */
const TEXT_FIELDS = [
    { key: 'completeText', labelKey: 'surveyTextCompleteText', defaultAr: 'أرسل', multiline: false },
    { key: 'pageNextText', labelKey: 'surveyTextPageNextText', defaultAr: 'التالي', multiline: false },
    { key: 'pagePrevText', labelKey: 'surveyTextPagePrevText', defaultAr: 'السابق', multiline: false },
    { key: 'completedHtml', labelKey: 'surveyTextCompletedHtml', defaultAr: 'شكراً لك على إكمال الاستبيان.', multiline: true },
    { key: 'completedBeforeHtml', labelKey: 'surveyTextCompletedBeforeHtml', defaultAr: 'لقد قمت بإكمال هذا الاستبيان مسبقاً.', multiline: true },
    { key: 'loadingHtml', labelKey: 'surveyTextLoadingHtml', defaultAr: 'جارٍ تحميل الاستبيان...', multiline: true },
];

function valueFor(key) {
    const lstr = store.state?.surveyTexts?.[key];
    if (!lstr || typeof lstr !== 'object') {
        return '';
    }

    return (contentLocale.value === 'en' ? lstr.en : lstr.ar) ?? '';
}

/** The placeholder: the Arabic default in ar mode; the active Arabic value in en mode. */
function placeholderFor(field) {
    if (contentLocale.value === 'en') {
        const lstr = store.state?.surveyTexts?.[field.key];
        const ar = lstr && typeof lstr === 'object' ? (lstr.ar ?? '') : '';

        return ar !== '' ? ar : field.defaultAr;
    }

    return field.defaultAr;
}

function update(key, value) {
    const existing = store.state?.surveyTexts?.[key];
    const lstr = existing && typeof existing === 'object'
        ? { ar: existing.ar ?? '', en: existing.en ?? null }
        : { ar: '', en: null };

    if (contentLocale.value === 'en') {
        lstr.en = value === '' ? null : value;
    } else {
        lstr.ar = value;
    }
    setSurveyText(key, lstr);
}

function close() {
    emit('close');
}
</script>

<template>
    <div v-if="open" class="fb-settings-overlay" @click.self="close">
        <div class="fb-settings-modal" role="dialog" aria-modal="true" :aria-label="t('surveySettingsTitle')">
            <div class="fb-settings-head">
                <h2 class="fb-settings-title">{{ t('surveySettingsTitle') }}</h2>
                <button
                    type="button"
                    class="fb-settings-close fb-focus"
                    :title="t('closePanel')"
                    :aria-label="t('closePanel')"
                    @click="close"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div class="fb-settings-body fb-scroll">
                <h3 class="fb-settings-section-title">{{ t('surveySettingsTexts') }}</h3>
                <p class="fb-settings-hint">{{ t('surveySettingsTextsHint') }}</p>

                <div v-for="field in TEXT_FIELDS" :key="field.key" class="fb-settings-field">
                    <label class="fb-settings-label" :for="`survey-text-${field.key}`">{{ t(field.labelKey) }}</label>
                    <textarea
                        v-if="field.multiline"
                        :id="`survey-text-${field.key}`"
                        class="fb-settings-input fb-settings-textarea fb-focus"
                        rows="2"
                        :placeholder="placeholderFor(field)"
                        :value="valueFor(field.key)"
                        @input="update(field.key, $event.target.value)"
                    ></textarea>
                    <input
                        v-else
                        :id="`survey-text-${field.key}`"
                        type="text"
                        class="fb-settings-input fb-focus"
                        :placeholder="placeholderFor(field)"
                        :value="valueFor(field.key)"
                        @input="update(field.key, $event.target.value)"
                    />
                </div>

                <h3 class="fb-settings-section-title">{{ t('surveySettingsCalculatedValues') }}</h3>
                <CalculatedValuesEditor />

                <h3 class="fb-settings-section-title">{{ t('surveySettingsTriggers') }}</h3>
                <p class="fb-settings-hint">{{ t('triggersHint') }}</p>

                <div v-for="(trigger, index) in triggers" :key="index" class="fb-trigger">
                    <template v-if="isEditableTrigger(trigger)">
                        <div class="fb-trigger-row">
                            <select
                                class="fb-settings-input fb-trigger-type fb-focus"
                                :value="trigger.type"
                                @change="updateTrigger(index, { type: $event.target.value })"
                            >
                                <option value="skip">{{ t('triggerJump') }}</option>
                                <option value="complete">{{ t('triggerFinish') }}</option>
                            </select>
                            <select
                                v-if="trigger.type === 'skip'"
                                class="fb-settings-input fb-focus"
                                :value="trigger.gotoName"
                                @change="updateTrigger(index, { gotoName: $event.target.value })"
                            >
                                <option value="" disabled>{{ t('triggerJumpTarget') }}</option>
                                <option v-for="opt in questionOptions" :key="opt.name" :value="opt.name">{{ opt.label }}</option>
                            </select>
                            <button
                                type="button"
                                class="fb-trigger-remove fb-focus"
                                :title="t('triggerRemove')"
                                :aria-label="t('triggerRemove')"
                                @click="removeTrigger(index)"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <label class="fb-trigger-expr">
                            <span>{{ t('triggerWhen') }}</span>
                            <input
                                type="text"
                                class="fb-settings-input fb-mono fb-focus"
                                dir="ltr"
                                spellcheck="false"
                                placeholder="{q1} > 18"
                                :value="trigger.expression"
                                @input="updateTrigger(index, { expression: $event.target.value })"
                            />
                        </label>
                    </template>
                    <p v-else class="fb-trigger-passthrough" dir="ltr">{{ trigger.type }}: {{ trigger.expression }}</p>
                </div>

                <button type="button" class="fb-trigger-add fb-focus" @click="addTrigger('skip')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span>{{ t('triggerAdd') }}</span>
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.fb-settings-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: rgba(17, 24, 39, 0.45);
    backdrop-filter: blur(2px);
}

.fb-settings-modal {
    display: flex;
    flex-direction: column;
    width: min(34rem, 100%);
    max-height: 90vh;
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}

.fb-settings-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.125rem;
    border-bottom: 1px solid var(--fb-border);
}

.fb-settings-title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--fb-text);
}

.fb-settings-close {
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

.fb-settings-close:hover {
    background: var(--fb-canvas);
}

.fb-settings-close svg {
    width: 1.125rem;
    height: 1.125rem;
}

.fb-settings-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 1.125rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.fb-settings-section-title {
    margin: 0;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #9ca3af;
}

.fb-settings-hint {
    margin: 0 0 0.25rem;
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    line-height: 1.45;
}

.fb-settings-field {
    display: flex;
    flex-direction: column;
    gap: 0.3125rem;
}

.fb-settings-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--fb-text);
}

.fb-settings-input {
    width: 100%;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.4375rem 0.625rem;
    font-size: 0.8125rem;
    color: var(--fb-text);
    background: var(--fb-surface);
    font-family: inherit;
}

.fb-settings-input::placeholder {
    color: #9ca3af;
}

.fb-settings-textarea {
    resize: vertical;
    min-height: 2.75rem;
    line-height: 1.5;
}
.fb-trigger {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    border: 1px solid var(--fb-border);
    border-radius: 0.5rem;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    background: var(--fb-canvas);
}

.fb-trigger-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

.fb-trigger-type {
    flex: 0 0 auto;
    width: auto;
}

.fb-trigger-expr {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--fb-text-muted);
}

.fb-trigger-passthrough {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.71875rem;
    color: var(--fb-text-muted);
}

.fb-trigger-remove {
    margin-inline-start: auto;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.625rem;
    height: 1.625rem;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    border-radius: 0.4375rem;
    cursor: pointer;
}

.fb-trigger-remove:hover {
    background: #fef2f2;
    color: #dc2626;
}

.fb-trigger-remove svg {
    width: 0.8125rem;
    height: 0.8125rem;
}

.fb-trigger-add {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
    align-self: flex-start;
    border: 1px dashed var(--fb-border-strong);
    background: transparent;
    color: var(--fb-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.3125rem 0.625rem;
    border-radius: 0.5rem;
    cursor: pointer;
}

.fb-trigger-add:hover {
    color: var(--fb-brand-600);
    border-color: var(--fb-brand);
}

.fb-trigger-add svg {
    width: 0.75rem;
    height: 0.75rem;
}
</style>
