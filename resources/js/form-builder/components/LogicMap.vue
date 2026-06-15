<script setup>
import { computed } from 'vue';
import { store } from '../store.js';
import { t, i18n } from '../i18n.js';
import { buildLogicMap } from '../ui-helpers.js';

const props = defineProps({
    open: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const uiLocale = computed(() => i18n.locale);

const map = computed(() =>
    buildLogicMap(store.state, store.runtimeContextKeys ?? [], uiLocale.value),
);

function actionLabel(action) {
    if (action === 'hide') {
        return t('logicMapHiddenWhen');
    }
    if (action === 'disable') {
        return t('logicMapDisableWhen');
    }

    return t('logicMapShownWhen');
}

function matchLabel(match) {
    return match === 'any' ? t('logicMapMatchAny') : t('logicMapMatchAll');
}

function close() {
    emit('close');
}
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="fb-lm-overlay" @click.self="close">
            <div class="fb-lm" :dir="i18n.locale === 'ar' ? 'rtl' : 'ltr'" role="dialog" aria-modal="true">
                <div class="fb-lm-head">
                    <h2 class="fb-lm-title">{{ t('logicMapTitle') }}</h2>
                    <button
                        type="button"
                        class="fb-lm-close fb-focus"
                        :title="t('logicMapClose')"
                        :aria-label="t('logicMapClose')"
                        @click="close"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div class="fb-lm-body fb-scroll">
                    <p v-if="map.isEmpty" class="fb-lm-empty">{{ t('logicMapEmpty') }}</p>

                    <ul v-else class="fb-lm-list">
                        <li v-for="entry in map.entries" :key="entry.name" class="fb-lm-entry">
                            <div class="fb-lm-entry-head">
                                <span class="fb-lm-entry-label">{{ entry.label }}</span>
                                <code class="fb-lm-entry-name" dir="ltr">{{ entry.name }}</code>
                            </div>

                            <div v-if="entry.action" class="fb-lm-rule-block">
                                <span class="fb-lm-rule-head">
                                    <span class="fb-lm-action" :class="`fb-lm-action--${entry.action}`">
                                        {{ actionLabel(entry.action) }}
                                    </span>
                                    <span class="fb-lm-match">{{ matchLabel(entry.match) }}:</span>
                                </span>
                                <ul class="fb-lm-rules">
                                    <li v-for="(rule, idx) in entry.rules" :key="idx" class="fb-lm-rule">{{ rule }}</li>
                                </ul>
                            </div>

                            <div v-if="entry.advanced" class="fb-lm-rule-block">
                                <span class="fb-lm-advanced-label">{{ t('logicMapAdvanced') }}</span>
                                <code class="fb-lm-advanced" dir="ltr">{{ entry.advanced }}</code>
                            </div>

                            <p v-if="entry.referencedBy.length" class="fb-lm-refs">
                                <span class="fb-lm-refs-label">{{ t('logicMapReferencedBy') }}:</span>
                                {{ entry.referencedBy.join(i18n.locale === 'ar' ? '، ' : ', ') }}
                            </p>
                        </li>
                    </ul>

                    <div v-if="map.quiz.questions.length" class="fb-lm-quiz">
                        <h3 class="fb-lm-quiz-title">{{ t('logicMapQuizSection') }}</h3>
                        <ul class="fb-lm-quiz-list">
                            <li v-for="q in map.quiz.questions" :key="q.name" class="fb-lm-quiz-item">
                                <span class="fb-lm-quiz-label">{{ q.label }}</span>
                                <span class="fb-lm-quiz-pts">{{ q.points }} {{ t('logicMapQuizPoints') }}</span>
                            </li>
                        </ul>
                        <div class="fb-lm-quiz-total">
                            <span>Σ {{ t('logicMapQuizTotal') }}</span>
                            <span class="fb-lm-quiz-total-val">{{ map.quiz.total }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.fb-lm-overlay {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.45);
    padding: 1rem;
    font-family: "IBM Plex Sans Arabic", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.fb-lm {
    width: 100%;
    max-width: 32rem;
    max-height: min(80vh, 40rem);
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border-radius: 0.875rem;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
    overflow: hidden;
}

.fb-lm-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #e5e7eb;
}

.fb-lm-title {
    font-size: 1rem;
    font-weight: 700;
    color: #111827;
    margin: 0;
}

.fb-lm-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.875rem;
    height: 1.875rem;
    border: none;
    background: transparent;
    color: #6b7280;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background-color 0.15s;
}

.fb-lm-close:hover {
    background: #f9fafb;
}

.fb-lm-close svg {
    width: 1.125rem;
    height: 1.125rem;
}

.fb-lm-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 1.25rem;
}

.fb-lm-empty {
    text-align: center;
    color: #6b7280;
    font-size: 0.875rem;
    padding: 2rem 1rem;
    margin: 0;
}

.fb-lm-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
}

.fb-lm-entry {
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 0.75rem 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.fb-lm-entry-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
}

.fb-lm-entry-label {
    font-size: 0.9375rem;
    font-weight: 600;
    color: #111827;
}

.fb-lm-entry-name {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.6875rem;
    color: #6b7280;
    background: #f3f4f6;
    border-radius: 0.25rem;
    padding: 0.0625rem 0.3125rem;
}

.fb-lm-rule-block {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding-inline-start: 0.75rem;
    border-inline-start: 2px solid #e5e7eb;
}

.fb-lm-rule-head {
    display: inline-flex;
    align-items: center;
    gap: 0.4375rem;
    flex-wrap: wrap;
}

.fb-lm-action {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.125rem 0.4375rem;
    border-radius: 0.375rem;
}

.fb-lm-action--show {
    color: #065f46;
    background: #d1fae5;
}

.fb-lm-action--hide {
    color: #991b1b;
    background: #fee2e2;
}

.fb-lm-action--disable {
    color: #92400e;
    background: #fef3c7;
}

.fb-lm-match {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 600;
}

.fb-lm-rules {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.fb-lm-rule {
    font-size: 0.8125rem;
    color: #374151;
    background: #f9fafb;
    border-radius: 0.4375rem;
    padding: 0.3125rem 0.5rem;
}

.fb-lm-advanced-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: #6b7280;
}

.fb-lm-advanced {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
    color: #e2e8f0;
    background: #0f172a;
    border-radius: 0.4375rem;
    padding: 0.375rem 0.5rem;
    word-break: break-all;
    white-space: pre-wrap;
}

.fb-lm-refs {
    margin: 0;
    font-size: 0.75rem;
    color: #6b7280;
    line-height: 1.5;
}

.fb-lm-refs-label {
    font-weight: 600;
}

.fb-lm-quiz {
    margin-top: 1rem;
    border-top: 1px dashed #e5e7eb;
    padding-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.fb-lm-quiz-title {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #9ca3af;
    margin: 0;
}

.fb-lm-quiz-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.fb-lm-quiz-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.8125rem;
    color: #374151;
}

.fb-lm-quiz-pts {
    flex: 0 0 auto;
    font-weight: 600;
    color: #b45309;
    background: #fef3c7;
    border-radius: 0.375rem;
    padding: 0.0625rem 0.4375rem;
    white-space: nowrap;
}

.fb-lm-quiz-total {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.8125rem;
    font-weight: 700;
    color: #111827;
    background: var(--fb-brand-50, #fffbeb);
    border-radius: 0.5rem;
    padding: 0.4375rem 0.625rem;
}

.fb-lm-quiz-total-val {
    color: var(--fb-brand-600, #b45309);
}
</style>
