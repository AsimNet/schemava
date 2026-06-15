<script setup>
import { computed, nextTick, ref } from 'vue';
import { t } from '../i18n.js';
import {
    store,
    selectedField,
    setAiProposal,
    applyAiProposal,
    discardAiProposal,
    previewAiProposal,
} from '../store.js';
import { toSurveyJson } from '../model/serialize.js';
import { validateSurveyJson } from '../survey-runtime.js';

const emit = defineEmits(['open-json']);

const MAX_HISTORY = 18;
const COMPACT_JSON_LIMIT = 20000;
const REQUEST_TIMEOUT_MS = 60000;

const open = ref(false);
const sending = ref(false);
const draft = ref('');
const messagesEl = ref(null);
const inputEl = ref(null);

/**
 * Chat history sent to the server. Each entry is `{role, content}`; display-only
 * entries additionally carry `text` (what the user sees) and a `kind` for
 * status styling. The server provides the system prompt — we never send one.
 *
 * Proposal cards are a distinct display kind: `{kind: 'proposal', id, resolution}`
 * (no upstream `content`). `resolution` is null while pending, then
 * 'applied' | 'discarded' once decided. They never go upstream. Undo lives on a
 * source-agnostic toast (see store.applyAiProposal), not on the card.
 *
 * @type {import('vue').Ref<Array<{role?: string, content?: string, text?: string, kind?: string, id?: number, resolution?: string|null}>>}
 */
const history = ref([
    { role: 'assistant', content: t('aiWelcome'), text: t('aiWelcome'), kind: 'assistant' },
]);

/** Status line under the latest exchange (error/timeout only), not sent upstream. */
const status = ref(null);

/** Monotonic id for proposal cards so a newer proposal supersedes an older one. */
let proposalSeq = 0;

/**
 * Id of the proposal card whose action buttons are still live. A new proposal
 * (or applying/discarding) retires the previous card's buttons so a stale card
 * can never act on superseded proposal state.
 *
 * @type {import('vue').Ref<number|null>}
 */
const activeProposalId = ref(null);

const displayMessages = computed(() => history.value.filter((m) => Boolean(m.text) || m.kind === 'proposal'));

/** Whether `card` is the live proposal (buttons shown) vs a resolved/stale one. */
function isProposalActive(card) {
    return card.kind === 'proposal' && card.resolution == null && card.id === activeProposalId.value && Boolean(store.aiProposal);
}

const canSend = computed(() => !sending.value && draft.value.trim() !== '');

function toggle() {
    open.value = !open.value;
    if (open.value) {
        nextTick(() => {
            inputEl.value?.focus();
            scrollToEnd();
        });
    }
}

function scrollToEnd() {
    nextTick(() => {
        if (messagesEl.value) {
            messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
        }
    });
}

/** Trim history to MAX_HISTORY, preserving the first 2 entries + most recent. */
function trimHistory(list) {
    if (list.length <= MAX_HISTORY) {
        return list;
    }
    const preserved = list.slice(0, 2);
    const recent = list.slice(2).slice(-(MAX_HISTORY - 2));

    return [...preserved, ...recent];
}

/** Cap embedded JSON to COMPACT_JSON_LIMIT chars (legacy parity). */
function compactJson(text) {
    const value = (text ?? '').toString();
    if (value.length <= COMPACT_JSON_LIMIT) {
        return value;
    }

    return `${value.slice(0, COMPACT_JSON_LIMIT)}\n[TRUNCATED]`;
}

/**
 * Parse the model reply into `{comment, json}` from [COMMENT]/[JSON] blocks.
 *
 * When a reply carries a [JSON] block but no [COMMENT], the comment is left
 * empty — the proposal card carries the messaging, and an empty comment is
 * filtered out of the chat — so the raw JSON is never dumped into a chat bubble.
 * Only a reply with neither block falls back to its plain text (a normal
 * conversational answer).
 */
function parseResponse(responseText) {
    const text = typeof responseText === 'string' ? responseText : JSON.stringify(responseText ?? '');
    const commentMatch = text.match(/\[COMMENT\]([\s\S]*?)\[\/COMMENT\]/);
    const jsonMatch = text.match(/\[JSON\]([\s\S]*?)\[\/JSON\]/);

    const comment = (commentMatch && commentMatch[1].trim())
        || (jsonMatch ? '' : text.trim());

    return {
        comment,
        json: jsonMatch ? jsonMatch[1].trim() : null,
    };
}

async function send() {
    if (!canSend.value) {
        return;
    }
    const userText = draft.value.trim();
    draft.value = '';
    status.value = null;

    // A new request supersedes any still-pending proposal: drop it from the
    // store (no orphan) and mark its card abandoned so its buttons retire.
    supersedePendingProposal();

    // Build the upstream payload: current JSON + (optional) selected element +
    // the user's text, appended to the running history (display entry added too).
    const jsonText = compactJson(JSON.stringify(currentJson()));
    const selected = selectedField();
    const messageHistory = [...history.value];

    messageHistory.push({ role: 'user', content: `Current survey JSON: ${jsonText}` });
    if (selected?.name) {
        messageHistory.push({ role: 'user', content: `Currently selected element: ${selected.name}` });
    }
    messageHistory.push({ role: 'user', content: userText, text: userText, kind: 'user' });

    history.value = trimHistory(messageHistory);
    sending.value = true;
    scrollToEnd();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const payload = {
            text: userText,
            // Proposal cards are display-only (no role/content) — keep them out
            // of the upstream history so only real chat turns are sent.
            messageHistory: history.value
                .filter((m) => typeof m.role === 'string' && typeof m.content === 'string')
                .map((m) => ({ role: m.role, content: m.content })),
        };

        const response = await fetch(store.boot?.routes?.aiQuery, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': store.boot?.csrf ?? '',
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            signal: controller.signal,
            body: JSON.stringify(payload),
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.error) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        const parsed = parseResponse(result.text);
        history.value = trimHistory([
            ...history.value,
            { role: 'assistant', content: result.text ?? '', text: parsed.comment, kind: 'assistant' },
        ]);

        applyJson(parsed.json);
    } catch (error) {
        const key = error && error.name === 'AbortError' ? 'aiTimeout' : 'aiError';
        status.value = { kind: 'error', key };
    } finally {
        clearTimeout(timeoutId);
        sending.value = false;
        scrollToEnd();
    }
}

/**
 * Validate the model's returned JSON and, when valid, stage it as a *proposal*
 * (the canvas is NOT touched — the user previews then approves/declines via the
 * proposal card). On parse failure / invalid schema, keep the legacy fallback:
 * open the JSON panel pre-filled for manual fixing.
 */
function applyJson(jsonString) {
    const normalized = (jsonString ?? '').trim();
    if (!normalized) {
        return;
    }

    let parsed;
    try {
        parsed = JSON.parse(normalized);
    } catch {
        openJsonForFix(normalized);

        return;
    }

    if (!parsed || typeof parsed !== 'object' || JSON.stringify(parsed) === '{}') {
        return;
    }

    const validation = validateSurveyJson(parsed);
    if (!validation.valid) {
        openJsonForFix(normalized);

        return;
    }

    proposeJson(parsed);
}

/**
 * Stage a validated proposal: hand it to the store (no canvas mutation) and add
 * a proposal card to the chat with preview/apply/discard affordances. Any prior
 * pending card is retired first so only the newest proposal is actionable.
 *
 * @param {object} parsed  validated SurveyJS JSON
 */
function proposeJson(parsed) {
    supersedePendingProposal();
    setAiProposal(parsed);
    proposalSeq += 1;
    activeProposalId.value = proposalSeq;
    history.value = trimHistory([
        ...history.value,
        { kind: 'proposal', text: t('aiProposed'), id: proposalSeq, resolution: null },
    ]);
}

/**
 * Retire any still-pending proposal without applying it: clear the store's
 * pending proposal and mark its card abandoned (resolved as discarded) so its
 * buttons disappear. No-op when nothing is pending.
 */
function supersedePendingProposal() {
    if (activeProposalId.value == null) {
        return;
    }
    const card = history.value.find((m) => m.kind === 'proposal' && m.id === activeProposalId.value);
    if (card && card.resolution == null) {
        card.resolution = 'discarded';
    }
    activeProposalId.value = null;
    discardAiProposal();
}

/** Open the staged proposal in the Preview tab. */
function onPreviewProposal() {
    previewAiProposal();
}

/**
 * Approve the proposal: apply it and flip the card to a plain applied status.
 * Undo is owned by the source-agnostic toast the store fires on apply, so the
 * card carries no inline undo (card and preview-banner paths behave identically).
 */
function onApplyProposal(card) {
    status.value = null;
    const applied = applyAiProposal();
    if (!applied) {
        return;
    }
    activeProposalId.value = null;
    card.resolution = 'applied';
    scrollToEnd();
}

/** Decline the proposal: drop it and mark the card discarded. */
function onDiscardProposal(card) {
    discardAiProposal();
    activeProposalId.value = null;
    card.resolution = 'discarded';
    status.value = null;
    scrollToEnd();
}

function openJsonForFix(text) {
    status.value = { kind: 'error', key: 'aiInvalidJson' };
    emit('open-json', text);
}

function currentJson() {
    if (!store.state) {
        return {};
    }

    return toSurveyJson(store.state, { runtimeContextKeys: store.runtimeContextKeys ?? [] });
}

function onKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send();
    }
}
</script>

<template>
    <div class="fb-ai">
        <button
            v-if="!open"
            type="button"
            class="fb-ai-fab fb-focus"
            :title="t('aiOpen')"
            :aria-label="t('aiOpen')"
            @click="toggle"
        >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.456-2.456L14.25 6l1.035-.259a3.375 3.375 0 002.456-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
        </button>

        <aside v-if="open" class="fb-ai-panel" :aria-label="t('aiTitle')">
            <div class="fb-ai-head">
                <div class="fb-ai-head-text">
                    <span class="fb-ai-title">{{ t('aiTitle') }}</span>
                    <span class="fb-ai-subtitle">{{ t('aiSubtitle') }}</span>
                </div>
                <button
                    type="button"
                    class="fb-ai-close fb-focus"
                    :title="t('aiClose')"
                    :aria-label="t('aiClose')"
                    @click="toggle"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div ref="messagesEl" class="fb-ai-messages fb-scroll">
                <template v-for="(message, index) in displayMessages" :key="message.kind === 'proposal' ? `p${message.id}` : `m${index}`">
                    <div
                        v-if="message.kind === 'proposal'"
                        class="fb-ai-proposal"
                        :class="{ 'fb-ai-proposal--resolved': message.resolution }"
                    >
                        <div class="fb-ai-proposal-head">
                            <svg class="fb-ai-proposal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                            </svg>
                            <span class="fb-ai-proposal-text">{{ message.text }}</span>
                        </div>

                        <div v-if="isProposalActive(message)" class="fb-ai-proposal-actions">
                            <button type="button" class="fb-ai-pbtn fb-ai-pbtn--ghost fb-focus" @click="onPreviewProposal">
                                {{ t('aiPreview') }}
                            </button>
                            <button type="button" class="fb-ai-pbtn fb-ai-pbtn--primary fb-focus" @click="onApplyProposal(message)">
                                {{ t('aiApply') }}
                            </button>
                            <button type="button" class="fb-ai-pbtn fb-ai-pbtn--ghost fb-focus" @click="onDiscardProposal(message)">
                                {{ t('aiDiscard') }}
                            </button>
                        </div>

                        <div v-else-if="message.resolution === 'applied'" class="fb-ai-proposal-resolved fb-ai-proposal-resolved--ok">
                            {{ t('aiApplied') }}
                        </div>

                        <div v-else-if="message.resolution === 'discarded'" class="fb-ai-proposal-resolved">
                            {{ t('aiDiscarded') }}
                        </div>
                    </div>

                    <div
                        v-else
                        class="fb-ai-msg"
                        :class="message.kind === 'user' ? 'fb-ai-msg--user' : 'fb-ai-msg--assistant'"
                    >
                        {{ message.text }}
                    </div>
                </template>

                <div v-if="sending" class="fb-ai-msg fb-ai-msg--assistant fb-ai-msg--loading">
                    <span class="fb-ai-typing" aria-hidden="true">
                        <span></span><span></span><span></span>
                    </span>
                    <span class="fb-ai-typing-text">{{ t('aiThinking') }}</span>
                </div>

                <div
                    v-if="status"
                    class="fb-ai-status fb-ai-status--error"
                >
                    {{ t(status.key) }}
                </div>
            </div>

            <div class="fb-ai-input-row">
                <textarea
                    ref="inputEl"
                    v-model="draft"
                    class="fb-ai-input fb-focus"
                    rows="1"
                    :placeholder="t('aiPlaceholder')"
                    :disabled="sending"
                    @keydown="onKeydown"
                ></textarea>
                <button
                    type="button"
                    class="fb-ai-send fb-focus"
                    :disabled="!canSend"
                    @click="send"
                >
                    {{ t('aiSend') }}
                </button>
            </div>
        </aside>
    </div>
</template>

<style scoped>
.fb-ai-fab {
    position: fixed;
    bottom: 1.25rem;
    inset-inline-end: 1.25rem;
    z-index: 50;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3.25rem;
    height: 3.25rem;
    border: none;
    border-radius: 9999px;
    background: var(--fb-brand);
    color: #fff;
    cursor: pointer;
    box-shadow: 0 8px 22px rgba(217, 119, 6, 0.4);
    transition: background-color 0.15s, transform 0.15s;
}

.fb-ai-fab:hover {
    background: var(--fb-brand-600);
    transform: translateY(-1px);
}

.fb-ai-fab svg {
    width: 1.5rem;
    height: 1.5rem;
}

.fb-ai-panel {
    position: fixed;
    bottom: 1.25rem;
    inset-inline-end: 1.25rem;
    z-index: 50;
    display: flex;
    flex-direction: column;
    width: min(22rem, calc(100vw - 2.5rem));
    height: min(32rem, calc(100vh - 6rem));
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius);
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.22);
    overflow: hidden;
}

.fb-ai-head {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--fb-border);
}

.fb-ai-head-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
}

.fb-ai-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--fb-text);
}

.fb-ai-subtitle {
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    line-height: 1.4;
}

.fb-ai-close {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background-color 0.15s;
}

.fb-ai-close:hover {
    background: var(--fb-canvas);
}

.fb-ai-close svg {
    width: 1.0625rem;
    height: 1.0625rem;
}

.fb-ai-messages {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--fb-canvas);
}

.fb-ai-msg {
    max-width: 90%;
    padding: 0.5rem 0.6875rem;
    border-radius: 0.75rem;
    font-size: 0.8125rem;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
}

.fb-ai-msg--user {
    align-self: flex-end;
    background: var(--fb-brand);
    color: #fff;
    border-bottom-inline-end-radius: 0.25rem;
}

.fb-ai-msg--assistant {
    align-self: flex-start;
    background: var(--fb-surface);
    color: var(--fb-text);
    border: 1px solid var(--fb-border);
    border-bottom-inline-start-radius: 0.25rem;
}

.fb-ai-msg--loading {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--fb-text-muted);
}

.fb-ai-typing {
    display: inline-flex;
    align-items: center;
    gap: 0.1875rem;
}

.fb-ai-typing span {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 9999px;
    background: #9ca3af;
    animation: fb-ai-bounce 1s infinite ease-in-out;
}

.fb-ai-typing span:nth-child(2) {
    animation-delay: 0.15s;
}

.fb-ai-typing span:nth-child(3) {
    animation-delay: 0.3s;
}

@keyframes fb-ai-bounce {
    0%, 80%, 100% {
        transform: scale(0.7);
        opacity: 0.6;
    }
    40% {
        transform: scale(1);
        opacity: 1;
    }
}

.fb-ai-typing-text {
    font-size: 0.75rem;
}

.fb-ai-status {
    align-self: stretch;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.4375rem 0.625rem;
    border-radius: 0.5rem;
    line-height: 1.4;
}

.fb-ai-status--error {
    color: #b91c1c;
    background: #fee2e2;
}

/* ---- AI proposal card (preview / approve / decline / undo) ---- */
.fb-ai-proposal {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.625rem 0.6875rem;
    border-radius: 0.75rem;
    border: 1px solid var(--fb-brand);
    background: var(--fb-brand-50);
}

.fb-ai-proposal--resolved {
    border-color: var(--fb-border);
    background: var(--fb-surface);
}

.fb-ai-proposal-head {
    display: flex;
    align-items: flex-start;
    gap: 0.4375rem;
}

.fb-ai-proposal-icon {
    flex: 0 0 auto;
    width: 1rem;
    height: 1rem;
    margin-top: 0.0625rem;
    color: var(--fb-brand-600);
}

.fb-ai-proposal-text {
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.4;
    color: var(--fb-text);
}

.fb-ai-proposal-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
}

.fb-ai-pbtn {
    flex: 1 1 auto;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.375rem 0.625rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.fb-ai-pbtn--primary {
    background: var(--fb-brand);
    color: #fff;
}

.fb-ai-pbtn--primary:hover {
    background: var(--fb-brand-600);
}

.fb-ai-pbtn--ghost {
    background: var(--fb-surface);
    border-color: var(--fb-border-strong);
    color: var(--fb-text);
}

.fb-ai-pbtn--ghost:hover {
    background: var(--fb-canvas);
}

.fb-ai-proposal-resolved {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--fb-text-muted);
}

.fb-ai-proposal-resolved--ok {
    color: #047857;
}

.fb-ai-input-row {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 0.75rem;
    border-top: 1px solid var(--fb-border);
}

.fb-ai-input {
    flex: 1 1 auto;
    min-width: 0;
    max-height: 6rem;
    resize: none;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.625rem;
    padding: 0.5rem 0.625rem;
    font-size: 0.8125rem;
    font-family: inherit;
    color: var(--fb-text);
    background: var(--fb-surface);
    line-height: 1.4;
}

.fb-ai-send {
    flex: 0 0 auto;
    border: none;
    border-radius: 0.625rem;
    background: var(--fb-brand);
    color: #fff;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.5rem 0.875rem;
    cursor: pointer;
    transition: background-color 0.15s, opacity 0.15s;
}

.fb-ai-send:hover:not(:disabled) {
    background: var(--fb-brand-600);
}

.fb-ai-send:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}
</style>
