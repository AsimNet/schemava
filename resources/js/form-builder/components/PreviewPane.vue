<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { t } from '../i18n.js';
import { store, applyAiProposal, discardAiProposal } from '../store.js';
import { toSurveyJson, fromSurveyJson } from '../model/serialize.js';
import { previewSampleData, scoreQuizPreview } from '../ui-helpers.js';
import {
    createPreviewModel,
    isRendererAvailable,
    isRtlLocale,
    renderPreviewModel,
    unmountPreview,
} from '../survey-runtime.js';

const props = defineProps({
    /** Whether the preview tab is currently active (drives re-render). */
    active: { type: Boolean, default: false },
});

// Default to the HOST PLATFORM's locale (boot.locale = app()->getLocale()) —
// the same locale the public form renders with — so the preview opens showing
// exactly what respondents on this platform will see. The toggle remains for
// checking the other content slot. Falls back to Arabic (the storage default).
const previewLocale = ref(store.boot?.locale === 'en' ? 'en' : 'ar');
const device = ref('mobile'); // 'mobile' | 'full'

/**
 * `host` is the *stable* container Vue owns. We never render the survey directly
 * into it — instead each (re)render mounts into a brand-new child node (`mount`)
 * so the renderer's (Preact) vnode tree is always pristine. Re-rendering into a
 * node that already held a tree silently produces a collapsed/empty frame, which
 * is the re-entry bug this guards against.
 */
const host = ref(null);
let mount = null;

const rendererMissing = ref(false);
const quizResult = ref(null);

let model = null;
let renderToken = 0;

const isRtl = computed(() => isRtlLocale(previewLocale.value));

/** True while the Preview tab is showing the pending AI proposal, not live state. */
const isProposalPreview = computed(() => store.aiProposalPreview && Boolean(store.aiProposal));

const hasFields = computed(() => {
    if (isProposalPreview.value) {
        const pages = store.aiProposal?.pages;

        return Array.isArray(pages)
            ? pages.some((page) => Array.isArray(page?.elements) && page.elements.length > 0)
            : Array.isArray(store.aiProposal?.elements) && store.aiProposal.elements.length > 0;
    }
    if (!store.state) {
        return false;
    }

    return store.state.pages.some((page) => (page.fields ?? []).length > 0);
});

const rootClass = computed(() => (isRtl.value ? 'sd-root-modern sd-root--rtl' : 'sd-root-modern'));

/**
 * Serialize the source to render: the live builder state normally, or — when
 * previewing an AI proposal — the proposal normalized through the serializer
 * round-trip so the preview matches exactly what applying it would produce
 * (enforced file/signature props, Arabic text defaults, runtime calculatedValues).
 */
function currentJson() {
    const runtimeContextKeys = store.runtimeContextKeys ?? [];
    if (isProposalPreview.value) {
        return toSurveyJson(fromSurveyJson(store.aiProposal), { runtimeContextKeys });
    }

    return toSurveyJson(store.state, { runtimeContextKeys });
}

/**
 * (Re)build and render the preview model from current state. Each call bumps a
 * token so a stale async render never overwrites a newer one.
 */
async function rebuild() {
    quizResult.value = null;
    rendererMissing.value = false;

    if (!store.state || !hasFields.value) {
        disposeModel();

        return;
    }

    if (!isRendererAvailable()) {
        rendererMissing.value = true;
        disposeModel();

        return;
    }

    const token = (renderToken += 1);
    const json = currentJson();
    const sampleData = previewSampleData(store.runtimeContextKeys ?? []);

    disposeModel();
    model = createPreviewModel(json, { locale: previewLocale.value, sampleData });
    if (!model) {
        rendererMissing.value = true;

        return;
    }

    if (typeof model.onComplete?.add === 'function') {
        model.onComplete.add((sender) => {
            computeQuizSummary(json, sender?.data ?? {});
        });
    }

    await nextTick();
    if (token !== renderToken || !host.value) {
        return;
    }

    // Always mount into a freshly created child node so the renderer never
    // diffs against a stale vnode tree (the cause of the empty-frame re-entry bug).
    const fresh = document.createElement('div');
    fresh.className = rootClass.value;
    fresh.setAttribute('dir', isRtl.value ? 'rtl' : 'ltr');
    host.value.replaceChildren(fresh);
    mount = fresh;

    const ok = renderPreviewModel(model, fresh);
    if (!ok) {
        rendererMissing.value = true;
    }
}

/** Compute and surface the client-side quiz score for completed preview data. */
function computeQuizSummary(json, data) {
    const result = scoreQuizPreview(json, data);
    quizResult.value = result.questions.length > 0 ? result : null;
}

function disposeModel() {
    // Unmount the renderer from its node first (drops the renderer's vnode tree),
    // then dispose the Survey model, then physically remove the node so a later
    // render starts from a pristine container.
    if (mount) {
        unmountPreview(mount);
    }
    if (model && typeof model.dispose === 'function') {
        try {
            model.dispose();
        } catch {
            /* ignore disposal errors */
        }
    }
    model = null;
    mount = null;
    if (host.value) {
        host.value.replaceChildren();
    }
}

function refresh() {
    rebuild();
}

function setLocale(locale) {
    if (previewLocale.value === locale) {
        return;
    }
    previewLocale.value = locale === 'en' ? 'en' : 'ar';
    rebuild();
}

function setDevice(next) {
    device.value = next === 'full' ? 'full' : 'mobile';
}

/** Approve the proposal from the preview banner (store exits proposal-preview). */
function onApplyProposal() {
    applyAiProposal();
}

/** Decline the proposal from the preview banner (store exits proposal-preview). */
function onDiscardProposal() {
    discardAiProposal();
}

// Re-create the model whenever the preview tab is (re)activated.
watch(
    () => props.active,
    (active) => {
        if (active) {
            rebuild();
        } else {
            disposeModel();
            quizResult.value = null;
        }
    },
    { immediate: true },
);

// Swap between the proposal and the live state while the preview tab is open.
// `aiProposal` is included so staging a NEW proposal mid-preview re-renders, and
// applying it (proposal → live, same content) also refreshes cleanly.
watch(
    () => [store.aiProposalPreview, store.aiProposal],
    () => {
        if (props.active) {
            rebuild();
        }
    },
);

onBeforeUnmount(disposeModel);
</script>

<template>
    <section class="fb-preview" :dir="isRtl ? 'rtl' : 'ltr'">
        <div class="fb-preview-toolbar">
            <div class="fb-preview-seg" role="group" :aria-label="t('previewLocale')">
                <button
                    type="button"
                    class="fb-preview-seg-btn"
                    :class="{ 'fb-preview-seg-btn--active': previewLocale === 'ar' }"
                    @click="setLocale('ar')"
                >
                    العربية
                </button>
                <button
                    type="button"
                    class="fb-preview-seg-btn"
                    :class="{ 'fb-preview-seg-btn--active': previewLocale === 'en' }"
                    @click="setLocale('en')"
                >
                    English
                </button>
            </div>

            <div class="fb-preview-seg" role="group" :aria-label="t('previewDeviceMobile')">
                <button
                    type="button"
                    class="fb-preview-seg-btn fb-preview-seg-icon"
                    :class="{ 'fb-preview-seg-btn--active': device === 'mobile' }"
                    :title="t('previewDeviceMobile')"
                    :aria-label="t('previewDeviceMobile')"
                    @click="setDevice('mobile')"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <rect x="7" y="3" width="10" height="18" rx="2" stroke-width="1.8" />
                        <path stroke-linecap="round" stroke-width="1.8" d="M11 18h2" />
                    </svg>
                </button>
                <button
                    type="button"
                    class="fb-preview-seg-btn fb-preview-seg-icon"
                    :class="{ 'fb-preview-seg-btn--active': device === 'full' }"
                    :title="t('previewDeviceFull')"
                    :aria-label="t('previewDeviceFull')"
                    @click="setDevice('full')"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="14" rx="2" stroke-width="1.8" />
                        <path stroke-linecap="round" stroke-width="1.8" d="M3 9h18" />
                    </svg>
                </button>
            </div>

            <button type="button" class="fb-preview-refresh fb-focus" :title="t('previewRefresh')" @click="refresh">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M16.023 9.348h4.992V4.356M3.985 19.644v-4.992h4.992M19.5 9.348A7.5 7.5 0 006.06 6.343M4.5 14.652a7.5 7.5 0 0013.44 3.005" />
                </svg>
                <span>{{ t('previewRefresh') }}</span>
            </button>
        </div>

        <div v-if="isProposalPreview" class="fb-preview-proposal-banner">
            <div class="fb-preview-proposal-text">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                <span>{{ t('aiProposalPreviewBanner') }}</span>
            </div>
            <div class="fb-preview-proposal-actions">
                <button type="button" class="fb-preview-proposal-btn fb-preview-proposal-btn--primary fb-focus" @click="onApplyProposal">
                    {{ t('aiApply') }}
                </button>
                <button type="button" class="fb-preview-proposal-btn fb-preview-proposal-btn--ghost fb-focus" @click="onDiscardProposal">
                    {{ t('aiDiscard') }}
                </button>
            </div>
        </div>

        <div class="fb-preview-stage fb-scroll">
            <div v-if="rendererMissing" class="fb-preview-state">
                <p>{{ t('previewRendererMissing') }}</p>
                <button type="button" class="fb-preview-retry fb-focus" @click="refresh">{{ t('previewReset') }}</button>
            </div>

            <div v-else-if="!hasFields" class="fb-preview-state">
                <p>{{ t('previewEmpty') }}</p>
            </div>

            <template v-else>
                <div class="fb-preview-note">{{ t('previewSampleNote') }}</div>

                <div class="fb-preview-frame" :class="{ 'fb-preview-frame--mobile': device === 'mobile' }">
                    <div ref="host" class="fb-preview-mount"></div>
                </div>

                <div v-if="quizResult" class="fb-preview-quiz" :dir="isRtl ? 'rtl' : 'ltr'">
                    <div class="fb-preview-quiz-head">
                        <span class="fb-preview-quiz-title">{{ t('previewQuizScore') }}</span>
                        <span class="fb-preview-quiz-total">
                            {{ t('previewQuizTotal') }}: {{ quizResult.total }} {{ t('previewQuizOutOf') }} {{ quizResult.max }}
                            <span class="fb-preview-quiz-pct">({{ quizResult.percent }}%)</span>
                        </span>
                    </div>
                    <ul class="fb-preview-quiz-list">
                        <li
                            v-for="q in quizResult.questions"
                            :key="q.name"
                            class="fb-preview-quiz-item"
                            :class="{ 'fb-preview-quiz-item--ok': q.correct, 'fb-preview-quiz-item--bad': !q.correct }"
                        >
                            <span class="fb-preview-quiz-icon" aria-hidden="true">
                                <svg v-if="q.correct" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </span>
                            <span class="fb-preview-quiz-label">{{ q.title }}</span>
                            <span class="fb-preview-quiz-pts">{{ q.correct ? q.score : 0 }}/{{ q.score }}</span>
                        </li>
                    </ul>
                    <p class="fb-preview-quiz-note">{{ t('previewQuizNote') }}</p>
                </div>
            </template>
        </div>
    </section>
</template>

<style scoped>
.fb-preview {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--fb-canvas);
}

.fb-preview-toolbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.625rem 1rem;
    background: var(--fb-surface);
    border-bottom: 1px solid var(--fb-border);
}

/* ---- Proposal-preview banner (sticky across the stage scroll) ---- */
.fb-preview-proposal-banner {
    flex: 0 0 auto;
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.625rem 1rem;
    background: var(--fb-brand-50);
    border-bottom: 1px solid var(--fb-brand);
}

.fb-preview-proposal-text {
    display: inline-flex;
    align-items: center;
    gap: 0.4375rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--fb-brand-600);
    min-width: 0;
}

.fb-preview-proposal-text svg {
    flex: 0 0 auto;
    width: 1rem;
    height: 1rem;
}

.fb-preview-proposal-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
}

.fb-preview-proposal-btn {
    border: 1px solid transparent;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.3125rem 0.75rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.fb-preview-proposal-btn--primary {
    background: var(--fb-brand);
    color: #fff;
}

.fb-preview-proposal-btn--primary:hover {
    background: var(--fb-brand-600);
}

.fb-preview-proposal-btn--ghost {
    background: var(--fb-surface);
    border-color: var(--fb-border-strong);
    color: var(--fb-text);
}

.fb-preview-proposal-btn--ghost:hover {
    background: var(--fb-canvas);
}

.fb-preview-seg {
    display: inline-flex;
    border: 1px solid var(--fb-border);
    border-radius: 0.5rem;
    overflow: hidden;
}

.fb-preview-seg-btn {
    border: none;
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.3125rem 0.75rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

.fb-preview-seg-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.3125rem 0.5rem;
}

.fb-preview-seg-icon svg {
    width: 1.0625rem;
    height: 1.0625rem;
}

.fb-preview-seg-btn--active {
    background: var(--fb-brand);
    color: #fff;
}

.fb-preview-refresh {
    margin-inline-start: auto;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    border: 1px solid var(--fb-border-strong);
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.3125rem 0.75rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.fb-preview-refresh:hover {
    background: var(--fb-brand-50);
    color: var(--fb-brand-600);
    border-color: var(--fb-brand);
}

.fb-preview-refresh svg {
    width: 0.9375rem;
    height: 0.9375rem;
}

.fb-preview-stage {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 1.5rem 1rem 4rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.875rem;
}

.fb-preview-state {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.875rem;
    color: var(--fb-text-muted);
    font-size: 0.9375rem;
    text-align: center;
    max-width: 22rem;
}

.fb-preview-retry {
    border: 1px solid var(--fb-border-strong);
    background: var(--fb-surface);
    color: var(--fb-text);
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.4375rem 1rem;
    border-radius: 0.5rem;
    cursor: pointer;
}

.fb-preview-retry:hover {
    background: var(--fb-canvas);
}

.fb-preview-note {
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: 9999px;
    padding: 0.25rem 0.75rem;
}

.fb-preview-frame {
    width: 100%;
    max-width: 56rem;
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    /* Cap the frame so long surveys scroll INSIDE it instead of being cut off
       (fix 2). The mount is the scroll container; the frame just clips to its
       rounded corners. */
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 12rem);
}

.fb-preview-frame--mobile {
    max-width: 390px;
    /* A phone frame is a fixed-height device: give it a realistic viewport so
       its content scrolls within the bezel. */
    height: 720px;
    max-height: calc(100vh - 9rem);
    border-radius: 1.75rem;
    border: 8px solid #111827;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
}

.fb-preview-mount {
    width: 100%;
    flex: 1 1 auto;
    min-height: 0;
    /* The real scroll surface — vertical only, momentum scroll on touch, thin
       RTL-safe scrollbar (logical, follows the frame's dir). */
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--fb-border-strong) transparent;
}

.fb-preview-mount::-webkit-scrollbar {
    width: 8px;
}

.fb-preview-mount::-webkit-scrollbar-thumb {
    background: var(--fb-border-strong);
    border-radius: 9999px;
}

/* Round the inner scroll area to the mobile bezel so content doesn't bleed past
   the rounded corners. */
.fb-preview-frame--mobile .fb-preview-mount {
    border-radius: 1.25rem;
}

.fb-preview-frame :deep(.sd-root-modern) {
    background: transparent;
    --sjs-font-family: "IBM Plex Sans Arabic", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.fb-preview-quiz {
    width: 100%;
    max-width: 56rem;
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius);
    padding: 0.875rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
}

.fb-preview-quiz-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.fb-preview-quiz-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--fb-text);
}

.fb-preview-quiz-total {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--fb-brand-600);
}

.fb-preview-quiz-pct {
    color: var(--fb-text-muted);
    font-weight: 600;
}

.fb-preview-quiz-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.fb-preview-quiz-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--fb-text);
}

.fb-preview-quiz-icon {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.125rem;
    height: 1.125rem;
    border-radius: 9999px;
}

.fb-preview-quiz-icon svg {
    width: 0.875rem;
    height: 0.875rem;
}

.fb-preview-quiz-item--ok .fb-preview-quiz-icon {
    color: #059669;
    background: #d1fae5;
}

.fb-preview-quiz-item--bad .fb-preview-quiz-icon {
    color: #dc2626;
    background: #fee2e2;
}

.fb-preview-quiz-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.fb-preview-quiz-pts {
    flex: 0 0 auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--fb-text-muted);
}

.fb-preview-quiz-note {
    margin: 0;
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
}
</style>
