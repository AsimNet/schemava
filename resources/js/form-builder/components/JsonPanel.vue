<script setup>
import { computed, ref, watch } from 'vue';
import { t } from '../i18n.js';
import { store, replaceStateFromJson } from '../store.js';
import { toSurveyJson } from '../model/serialize.js';
import { validateSurveyJson } from '../survey-runtime.js';

const props = defineProps({
    open: { type: Boolean, default: false },
    /**
     * Optional initial text to pre-fill the editor with (used by the AI error
     * path, which passes the model's returned — invalid — JSON for manual fixing).
     */
    initialText: { type: String, default: null },
});

const emit = defineEmits(['close', 'applied']);

const draft = ref('');
const error = ref(null);
const copied = ref(false);
let copiedTimer = null;

/** Pretty-printed serialization of the current state, with runtime keys. */
function currentJsonText() {
    if (!store.state) {
        return '{}';
    }
    const json = toSurveyJson(store.state, {
        runtimeContextKeys: store.runtimeContextKeys ?? [],
    });

    return JSON.stringify(json, null, 2);
}

watch(
    () => props.open,
    (open) => {
        if (!open) {
            return;
        }
        error.value = null;
        copied.value = false;
        draft.value = typeof props.initialText === 'string' && props.initialText !== ''
            ? props.initialText
            : currentJsonText();
    },
    { immediate: true },
);

const lineCount = computed(() => draft.value.split('\n').length);

async function copy() {
    try {
        await navigator.clipboard.writeText(draft.value);
        copied.value = true;
        if (copiedTimer) {
            clearTimeout(copiedTimer);
        }
        copiedTimer = setTimeout(() => {
            copied.value = false;
        }, 1500);
    } catch {
        /* clipboard unavailable — silently ignore */
    }
}

function apply() {
    error.value = null;
    let parsed;
    try {
        parsed = JSON.parse(draft.value);
    } catch {
        error.value = 'jsonInvalid';

        return;
    }

    if (!parsed || typeof parsed !== 'object') {
        error.value = 'jsonInvalid';

        return;
    }

    const validation = validateSurveyJson(parsed);
    if (!validation.valid) {
        error.value = 'jsonSchemaInvalid';

        return;
    }

    replaceStateFromJson(parsed);
    emit('applied');
    close();
}

function close() {
    emit('close');
}
</script>

<template>
    <div v-if="open" class="fb-json-overlay" @click.self="close">
        <div class="fb-json-modal" role="dialog" aria-modal="true" :aria-label="t('jsonTitle')">
            <div class="fb-json-head">
                <h2 class="fb-json-title">{{ t('jsonTitle') }}</h2>
                <div class="fb-json-head-actions">
                    <button type="button" class="fb-json-copy fb-focus" @click="copy">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                        </svg>
                        <span>{{ copied ? t('jsonCopied') : t('jsonCopy') }}</span>
                    </button>
                    <button
                        type="button"
                        class="fb-json-close fb-focus"
                        :title="t('jsonCancel')"
                        :aria-label="t('jsonCancel')"
                        @click="close"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            <p class="fb-json-hint">{{ t('jsonHint') }}</p>

            <textarea
                v-model="draft"
                class="fb-json-editor fb-focus"
                dir="ltr"
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
                wrap="off"
                :rows="Math.min(Math.max(lineCount, 12), 28)"
            ></textarea>

            <p v-if="error" class="fb-json-error">{{ t(error) }}</p>

            <div class="fb-json-foot">
                <button type="button" class="fb-json-btn fb-json-btn--ghost fb-focus" @click="close">
                    {{ t('jsonCancel') }}
                </button>
                <button type="button" class="fb-json-btn fb-json-btn--primary fb-focus" @click="apply">
                    {{ t('jsonApply') }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.fb-json-overlay {
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

.fb-json-modal {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: min(48rem, 100%);
    max-height: 90vh;
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
    padding: 1rem 1.125rem 1.125rem;
}

.fb-json-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
}

.fb-json-title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--fb-text);
}

.fb-json-head-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
}

.fb-json-copy {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
    border: 1px solid var(--fb-border-strong);
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.3125rem 0.625rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.fb-json-copy:hover {
    background: var(--fb-brand-50);
    color: var(--fb-brand-600);
    border-color: var(--fb-brand);
}

.fb-json-copy svg {
    width: 0.875rem;
    height: 0.875rem;
}

.fb-json-close {
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

.fb-json-close:hover {
    background: var(--fb-canvas);
}

.fb-json-close svg {
    width: 1.125rem;
    height: 1.125rem;
}

.fb-json-hint {
    margin: 0;
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    line-height: 1.45;
}

.fb-json-editor {
    flex: 1 1 auto;
    min-height: 12rem;
    width: 100%;
    resize: vertical;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.625rem;
    padding: 0.75rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--fb-text);
    background: var(--fb-canvas);
    white-space: pre;
    overflow: auto;
}

.fb-json-error {
    margin: 0;
    font-size: 0.75rem;
    color: #dc2626;
}

.fb-json-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
}

.fb-json-btn {
    border: 1px solid transparent;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.4375rem 1rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
}

.fb-json-btn--ghost {
    background: var(--fb-surface);
    border-color: var(--fb-border-strong);
    color: var(--fb-text);
}

.fb-json-btn--ghost:hover {
    background: var(--fb-canvas);
}

.fb-json-btn--primary {
    background: var(--fb-brand);
    color: #fff;
}

.fb-json-btn--primary:hover {
    background: var(--fb-brand-600);
}
</style>
