<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { store, markClean, pushToast, setContentLocale, quizFieldCount, totalQuizPoints } from '../store.js';
import { t } from '../i18n.js';
import { toSurveyJson } from '../model/serialize.js';
import { isEmptyLStr } from '../model/localized.js';
import { copyTextToClipboard } from '../ui-helpers.js';
import { pulse } from '../motion.js';
import MoreMenu from './MoreMenu.vue';

const props = defineProps({
    boot: { type: Object, default: () => ({}) },
    activeTab: { type: String, default: 'build' },
});

const emit = defineEmits(['update:active-tab', 'open-json', 'open-settings', 'open-logic-map']);

/** Heroicons-outline path `d` strings for the consolidated "More" menu items. */
const ICON_JSON = 'M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z';
const ICON_LOGIC_MAP = 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5A4.5 4.5 0 0021 12V3';

/** Secondary actions consolidated into the "⋯ More" dropdown (fix 3). */
const moreItems = computed(() => [
    { id: 'logic-map', label: t('logicMapOpen'), icon: ICON_LOGIC_MAP },
    { id: 'json', label: t('jsonOpen'), icon: ICON_JSON },
]);

function onMoreSelect(id) {
    if (id === 'json') {
        emit('open-json');
    } else if (id === 'logic-map') {
        emit('open-logic-map');
    }
}

/** The shareable public survey URL from the boot payload (empty when absent). */
const publicUrl = computed(() => {
    const url = store.boot?.publicUrl;

    return typeof url === 'string' ? url.trim() : '';
});
const hasPublicUrl = computed(() => publicUrl.value !== '');

/** Copy the public survey link to the clipboard and toast on success/failure. */
async function copyLink() {
    if (!hasPublicUrl.value) {
        return;
    }
    const ok = await copyTextToClipboard(publicUrl.value);
    if (ok) {
        pushToast(t('linkCopied'), 'success');
    } else {
        pushToast(t('saveFailed'), 'error');
    }
}

const SAVE_IDLE = 'idle';
const SAVE_SAVING = 'saving';
const SAVE_SAVED = 'saved';
const SAVE_ERROR = 'error';

const saveStatus = ref(SAVE_IDLE);
let savedResetTimer = null;

const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');

const titleValue = computed({
    get() {
        const lstr = store.state?.meta.title;
        if (!lstr) {
            return '';
        }

        return (contentLocale.value === 'en' ? lstr.en : lstr.ar) ?? '';
    },
    set(value) {
        if (!store.state) {
            return;
        }
        const lstr = store.state.meta.title;
        if (contentLocale.value === 'en') {
            lstr.en = value === '' ? null : value;
        } else {
            lstr.ar = value;
        }
        store.dirty = true;
    },
});

const descriptionValue = computed({
    get() {
        const lstr = store.state?.meta.description;
        if (!lstr) {
            return '';
        }

        return (contentLocale.value === 'en' ? lstr.en : lstr.ar) ?? '';
    },
    set(value) {
        if (!store.state) {
            return;
        }
        const lstr = store.state.meta.description;
        if (contentLocale.value === 'en') {
            lstr.en = value === '' ? null : value;
        } else {
            lstr.ar = value;
        }
        store.dirty = true;
    },
});

/** Any field/title with Arabic text but a missing English translation. */
const hasMissingTranslations = computed(() => {
    if (!store.state) {
        return false;
    }
    const missing = (lstr) => lstr && !isEmptyLStr(lstr) && (lstr.ar ?? '').trim() !== '' && (lstr.en ?? '').trim() === '';
    if (missing(store.state.meta.title) || missing(store.state.meta.description)) {
        return true;
    }
    for (const page of store.state.pages) {
        if (page.title && missing(page.title)) {
            return true;
        }
        for (const field of page.fields) {
            if (missing(field.label)) {
                return true;
            }
        }
    }

    return false;
});

const showPointsBadge = computed(() => quizFieldCount() > 0);
const pointsTotal = computed(() => totalQuizPoints());

/** Save-button checkmark, pulsed once when a save succeeds. */
const saveIcon = ref(null);
/** Header points badge (Σ), pulsed when the running quiz total changes. */
const pointsBadge = ref(null);

// Confirmation pulse on the Save checkmark the moment status flips to "saved".
watch(saveStatus, (status) => {
    if (status === SAVE_SAVED) {
        nextTick(() => pulse(saveIcon.value));
    }
});

// Tiny pulse when the quiz points total ticks (e.g. a scored question added).
// Skipped on the first resolve and while the badge is hidden.
watch(pointsTotal, (next, prev) => {
    if (!showPointsBadge.value || next === prev) {
        return;
    }
    nextTick(() => pulse(pointsBadge.value, { scale: 1.22 }));
});

const saveLabel = computed(() => {
    switch (saveStatus.value) {
        case SAVE_SAVING:
            return t('saving');
        case SAVE_SAVED:
            return t('saved');
        case SAVE_ERROR:
            return t('saveFailed');
        default:
            return t('save');
    }
});

function switchContentLocale(locale) {
    setContentLocale(locale);
}

function switchTab(tab) {
    emit('update:active-tab', tab);
}

async function save() {
    if (!store.state || saveStatus.value === SAVE_SAVING) {
        return;
    }
    saveStatus.value = SAVE_SAVING;
    if (savedResetTimer) {
        clearTimeout(savedResetTimer);
        savedResetTimer = null;
    }

    const runtimeContextKeys = props.boot?.runtimeContextKeys ?? [];
    const surveyJson = toSurveyJson(store.state, { runtimeContextKeys });

    try {
        const response = await fetch(props.boot?.routes?.save, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': props.boot?.csrf ?? '',
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify({ survey_json: surveyJson }),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json().catch(() => ({}));
        if (data && data.success === false) {
            throw new Error(data.message || 'save failed');
        }

        saveStatus.value = SAVE_SAVED;
        markClean();
        savedResetTimer = setTimeout(() => {
            saveStatus.value = SAVE_IDLE;
        }, 2000);
    } catch (error) {
        console.error('[form-builder] save failed', error);
        saveStatus.value = SAVE_ERROR;
        savedResetTimer = setTimeout(() => {
            saveStatus.value = SAVE_IDLE;
        }, 3000);
    }
}

function onKeydown(event) {
    const isSaveCombo = (event.metaKey || event.ctrlKey) && (event.key === 's' || event.key === 'S');
    if (isSaveCombo) {
        event.preventDefault();
        save();
    }
}

function onBeforeUnload(event) {
    if (store.dirty) {
        event.preventDefault();
        event.returnValue = '';

        return '';
    }

    return undefined;
}

onMounted(() => {
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('beforeunload', onBeforeUnload);
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('beforeunload', onBeforeUnload);
    if (savedResetTimer) {
        clearTimeout(savedResetTimer);
    }
});
</script>

<template>
    <header class="fb-header">
        <div class="fb-header-start">
            <a class="fb-back" :href="props.boot?.routes?.backUrl" :title="t('back')" :aria-label="t('back')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" class="fb-back-icon">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                    />
                </svg>
            </a>

            <div class="fb-titles">
                <input
                    v-model="titleValue"
                    type="text"
                    class="fb-title-input fb-focus"
                    :placeholder="t('formTitlePlaceholder')"
                    :aria-label="t('formTitlePlaceholder')"
                />
                <input
                    v-model="descriptionValue"
                    type="text"
                    class="fb-desc-input fb-focus"
                    :placeholder="t('formDescriptionPlaceholder')"
                    :aria-label="t('formDescriptionPlaceholder')"
                />
            </div>
        </div>

        <div class="fb-header-center">
            <div class="fb-tabs" role="tablist">
                <button
                    type="button"
                    role="tab"
                    class="fb-tab"
                    :class="{ 'fb-tab--active': props.activeTab === 'build' }"
                    :aria-selected="props.activeTab === 'build'"
                    @click="switchTab('build')"
                >
                    {{ t('tabBuild') }}
                </button>
                <button
                    type="button"
                    role="tab"
                    class="fb-tab"
                    :class="{ 'fb-tab--active': props.activeTab === 'preview' }"
                    :aria-selected="props.activeTab === 'preview'"
                    @click="switchTab('preview')"
                >
                    {{ t('tabPreview') }}
                </button>
            </div>
        </div>

        <div class="fb-header-end">
            <span v-if="showPointsBadge" ref="pointsBadge" class="fb-points" :title="t('totalPoints')">
                Σ {{ pointsTotal }}
            </span>

            <button
                v-if="hasPublicUrl"
                type="button"
                class="fb-icon-btn fb-focus"
                :title="t('copyLink')"
                :aria-label="t('copyLink')"
                @click="copyLink"
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
            </button>

            <button
                type="button"
                class="fb-icon-btn fb-focus"
                :title="t('surveySettingsOpen')"
                :aria-label="t('surveySettingsOpen')"
                @click="emit('open-settings')"
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            </button>

            <div class="fb-segment" :title="t('contentLanguage')" role="group" :aria-label="t('contentLanguage')">
                <button
                    type="button"
                    class="fb-segment-btn"
                    :class="{ 'fb-segment-btn--active': contentLocale === 'ar' }"
                    @click="switchContentLocale('ar')"
                >
                    ع
                </button>
                <button
                    type="button"
                    class="fb-segment-btn"
                    :class="{ 'fb-segment-btn--active': contentLocale === 'en' }"
                    @click="switchContentLocale('en')"
                >
                    EN
                </button>
                <span
                    v-if="hasMissingTranslations"
                    class="fb-missing-dot"
                    :title="t('missingTranslationHint')"
                    :aria-label="t('missingTranslation')"
                ></span>
            </div>

            <MoreMenu :items="moreItems" @select="onMoreSelect" />

            <button
                type="button"
                class="fb-save fb-focus"
                :class="{
                    'fb-save--saving': saveStatus === 'saving',
                    'fb-save--saved': saveStatus === 'saved',
                    'fb-save--error': saveStatus === 'error',
                }"
                :disabled="saveStatus === 'saving'"
                @click="save"
            >
                <span v-if="saveStatus === 'saving'" class="fb-spinner" aria-hidden="true"></span>
                <svg
                    v-else-if="saveStatus === 'saved'"
                    ref="saveIcon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    class="fb-save-icon"
                    aria-hidden="true"
                >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span>{{ saveLabel }}</span>
            </button>
        </div>
    </header>
</template>

<style scoped>
.fb-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.625rem 1rem;
    background: var(--fb-surface);
    border-bottom: 1px solid var(--fb-border);
}

.fb-header-start {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1 1 0;
    min-width: 0;
}

.fb-header-center {
    flex: 0 0 auto;
}

.fb-header-end {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1 1 0;
    justify-content: flex-end;
    min-width: 0;
}

.fb-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.625rem;
    color: var(--fb-text-muted);
    flex: 0 0 auto;
    transition: background-color 0.15s, color 0.15s;
}

.fb-back:hover {
    background: var(--fb-canvas);
    color: var(--fb-text);
}

.fb-back-icon {
    width: 1.25rem;
    height: 1.25rem;
}

/* Mirror the arrow in RTL so it always points "back". */
:dir(rtl) .fb-back-icon {
    transform: scaleX(-1);
}

.fb-titles {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1 1 0;
}

.fb-title-input {
    border: none;
    background: transparent;
    font-size: 1rem;
    font-weight: 600;
    color: var(--fb-text);
    padding: 0.125rem 0.25rem;
    border-radius: 0.375rem;
    width: 100%;
    text-overflow: ellipsis;
}

.fb-desc-input {
    border: none;
    background: transparent;
    font-size: 0.8125rem;
    color: var(--fb-text-muted);
    padding: 0.0625rem 0.25rem;
    border-radius: 0.375rem;
    width: 100%;
    text-overflow: ellipsis;
}

.fb-title-input::placeholder,
.fb-desc-input::placeholder {
    color: #9ca3af;
}

.fb-tabs {
    display: inline-flex;
    background: var(--fb-canvas);
    border: 1px solid var(--fb-border);
    border-radius: 0.625rem;
    padding: 0.1875rem;
    gap: 0.1875rem;
}

.fb-tab {
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.375rem 0.875rem;
    border-radius: 0.4375rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

.fb-tab--active {
    background: var(--fb-surface);
    color: var(--fb-text);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.fb-points {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--fb-brand-600);
    background: var(--fb-brand-50);
    padding: 0.25rem 0.5rem;
    border-radius: 0.5rem;
    white-space: nowrap;
}

.fb-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--fb-border);
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    border-radius: 0.5rem;
    cursor: pointer;
    flex: 0 0 auto;
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.fb-icon-btn:hover {
    background: var(--fb-brand-50);
    color: var(--fb-brand-600);
    border-color: var(--fb-brand);
}

.fb-icon-btn svg {
    width: 1.125rem;
    height: 1.125rem;
}

.fb-segment {
    position: relative;
    display: inline-flex;
    border: 1px solid var(--fb-border);
    border-radius: 0.5rem;
    overflow: hidden;
}

.fb-segment-btn {
    border: none;
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.3125rem 0.625rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
    min-width: 2rem;
}

.fb-segment-btn--active {
    background: var(--fb-brand);
    color: #fff;
}

.fb-missing-dot {
    position: absolute;
    top: -0.25rem;
    inset-inline-end: -0.25rem;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 9999px;
    background: #f59e0b;
    border: 1px solid var(--fb-surface);
}

.fb-save {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    border: none;
    background: var(--fb-brand);
    color: #fff;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.4375rem 1rem;
    border-radius: 0.5rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.15s, opacity 0.15s;
}

.fb-save:hover:not(:disabled) {
    background: var(--fb-brand-600);
}

.fb-save:disabled {
    opacity: 0.7;
    cursor: not-allowed;
}

.fb-save--saved {
    background: #059669;
}

.fb-save--error {
    background: #dc2626;
}

.fb-save-icon {
    width: 1rem;
    height: 1rem;
}

.fb-spinner {
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #fff;
    border-radius: 9999px;
    animation: fb-spin 0.6s linear infinite;
}

@keyframes fb-spin {
    to {
        transform: rotate(360deg);
    }
}

@media (max-width: 1024px) {
    .fb-header-center {
        order: 3;
    }
}
</style>
