<script setup>
import { computed } from 'vue';
import { t } from '../i18n.js';
import { store, setSurveyText } from '../store.js';

const props = defineProps({
    open: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

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
</style>
