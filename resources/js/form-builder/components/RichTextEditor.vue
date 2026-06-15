<script setup>
import { nextTick, onMounted, ref, watch } from 'vue';
import { t } from '../i18n.js';
import { sanitizeStatementHtml } from '../ui-helpers.js';

const props = defineProps({
    /** The HTML string being edited (the active-locale statement html). */
    modelValue: { type: String, default: '' },
    /** Text direction — follows the active content locale ('rtl' | 'ltr'). */
    dir: { type: String, default: 'rtl' },
});

const emit = defineEmits(['update:modelValue']);

/** WYSIWYG vs. raw-HTML entry — both write the same html string. */
const rawMode = ref(false);

/** The contenteditable surface (WYSIWYG mode). */
const editable = ref(null);

/**
 * Sync the contenteditable DOM from `modelValue`, but ONLY when the incoming
 * value differs from what is already live in the DOM. Writing innerHTML on every
 * keystroke would reset the caret to the start — the classic contenteditable+Vue
 * pitfall — so we compare first and skip no-op writes (which is the case while
 * the user is typing, since the input handler emits the DOM's own html).
 */
function syncEditableFromModel() {
    const el = editable.value;
    if (!el) {
        return;
    }
    const incoming = props.modelValue ?? '';
    if (el.innerHTML !== incoming) {
        el.innerHTML = incoming;
    }
}

onMounted(() => {
    if (!rawMode.value) {
        syncEditableFromModel();
    }
});

watch(
    () => props.modelValue,
    () => {
        if (!rawMode.value) {
            syncEditableFromModel();
        }
    },
);

/** Emit the current contenteditable html (sanitized) on every input. */
function onInput() {
    const el = editable.value;
    if (!el) {
        return;
    }
    emit('update:modelValue', sanitizeStatementHtml(el.innerHTML));
}

/**
 * Sanitize pasted content to plain-ish html: strip `<script>`/`<style>` so admin
 * paste from rich sources can't inject executable/blocking markup. We let the
 * default paste insert, then re-read + sanitize on the next tick.
 */
function onPaste() {
    nextTick(() => {
        const el = editable.value;
        if (!el) {
            return;
        }
        const cleaned = stripStyleBlocks(sanitizeStatementHtml(el.innerHTML));
        if (el.innerHTML !== cleaned) {
            el.innerHTML = cleaned;
        }
        emit('update:modelValue', cleaned);
    });
}

/** Strip `<style>` blocks/tags (sanitizeStatementHtml only handles `<script>`). */
function stripStyleBlocks(html) {
    return String(html ?? '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
        .replace(/<\/?style\b[^>]*>/gi, '');
}

/**
 * Run a `document.execCommand` formatting command against the current selection,
 * then re-focus and emit. execCommand is deprecated but remains the pragmatic,
 * dependency-free way to drive a contenteditable WYSIWYG (no new npm deps).
 */
function exec(command, value = null) {
    const el = editable.value;
    if (!el) {
        return;
    }
    el.focus();
    try {
        document.execCommand(command, false, value);
    } catch {
        /* command unsupported in this engine */
    }
    onInput();
}

function formatBlock(tag) {
    // Browsers differ on whether the block tag needs angle brackets.
    exec('formatBlock', tag);
}

function insertLink() {
    const url = typeof window !== 'undefined' && typeof window.prompt === 'function'
        ? window.prompt(t('richLink'), 'https://')
        : null;
    const trimmed = (url ?? '').trim();
    if (trimmed === '' || trimmed === 'https://') {
        return;
    }
    exec('createLink', trimmed);
}

function clearFormatting() {
    const el = editable.value;
    if (!el) {
        return;
    }
    el.focus();
    try {
        document.execCommand('removeFormat', false, null);
        document.execCommand('formatBlock', false, 'div');
    } catch {
        /* ignore */
    }
    onInput();
}

/** Raw-HTML textarea writes the html string directly (sanitized). */
function onRawInput(event) {
    emit('update:modelValue', sanitizeStatementHtml(event.target.value));
}

/** Toggle WYSIWYG <-> raw; re-render the editable from the model on return. */
function toggleRaw() {
    rawMode.value = !rawMode.value;
    if (!rawMode.value) {
        nextTick(syncEditableFromModel);
    }
}

const TOOLBAR = [
    { key: 'bold', label: 'richBold', glyph: 'B', style: 'font-weight:700', command: () => exec('bold') },
    { key: 'italic', label: 'richItalic', glyph: 'I', style: 'font-style:italic', command: () => exec('italic') },
    { key: 'underline', label: 'richUnderline', glyph: 'U', style: 'text-decoration:underline', command: () => exec('underline') },
    { key: 'h2', label: 'richHeading2', glyph: 'H2', style: 'font-weight:700', command: () => formatBlock('h2') },
    { key: 'h3', label: 'richHeading3', glyph: 'H3', style: 'font-weight:700', command: () => formatBlock('h3') },
    { key: 'list', label: 'richList', glyph: '•—', style: '', command: () => exec('insertUnorderedList') },
    { key: 'link', label: 'richLink', glyph: '🔗', style: '', command: insertLink },
    { key: 'clear', label: 'richClear', glyph: '⌫', style: '', command: clearFormatting },
];
</script>

<template>
    <div class="fb-rte">
        <div class="fb-rte-toolbar">
            <div v-if="!rawMode" class="fb-rte-tools" role="toolbar" :aria-label="t('statementHtml')">
                <button
                    v-for="tool in TOOLBAR"
                    :key="tool.key"
                    type="button"
                    class="fb-rte-btn fb-focus"
                    :title="t(tool.label)"
                    :aria-label="t(tool.label)"
                    :style="tool.style"
                    @mousedown.prevent
                    @click="tool.command"
                >
                    {{ tool.glyph }}
                </button>
            </div>
            <span v-else class="fb-rte-rawnote">{ } HTML</span>

            <button
                type="button"
                class="fb-rte-toggle fb-focus"
                :class="{ 'fb-rte-toggle--active': rawMode }"
                :title="rawMode ? t('editRich') : t('editHtml')"
                :aria-pressed="rawMode"
                @click="toggleRaw"
            >
                <span aria-hidden="true">&lt;/&gt;</span>
                <span>{{ rawMode ? t('editRich') : t('editHtml') }}</span>
            </button>
        </div>

        <div
            v-show="!rawMode"
            ref="editable"
            class="fb-rte-surface fb-focus"
            contenteditable="true"
            role="textbox"
            aria-multiline="true"
            :dir="dir"
            @input="onInput"
            @paste="onPaste"
        ></div>

        <textarea
            v-show="rawMode"
            class="fb-rte-raw fb-focus"
            dir="ltr"
            spellcheck="false"
            rows="5"
            :value="modelValue"
            @input="onRawInput"
        ></textarea>

        <p class="fb-rte-hint">{{ t('statementHtmlHint') }}</p>
    </div>
</template>

<style scoped>
.fb-rte {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.fb-rte-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
}

.fb-rte-tools {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.125rem;
    background: var(--fb-surface);
}

.fb-rte-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.75rem;
    height: 1.625rem;
    padding: 0 0.3125rem;
    border: none;
    background: transparent;
    color: var(--fb-text);
    font-size: 0.75rem;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: background-color 0.12s, color 0.12s;
}

.fb-rte-btn:hover {
    background: var(--fb-brand-50);
    color: var(--fb-brand-600);
}

.fb-rte-rawnote {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--fb-text-muted);
}

.fb-rte-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
    border: 1px solid var(--fb-border-strong);
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    border-radius: 0.4375rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.12s, color 0.12s, border-color 0.12s;
}

.fb-rte-toggle span:first-child {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.fb-rte-toggle:hover,
.fb-rte-toggle--active {
    background: var(--fb-brand-50);
    color: var(--fb-brand-600);
    border-color: var(--fb-brand);
}

.fb-rte-surface {
    min-height: 5rem;
    max-height: 16rem;
    overflow-y: auto;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.5rem 0.625rem;
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--fb-text);
    background: var(--fb-surface);
}

.fb-rte-surface:focus {
    outline: none;
    border-color: var(--fb-brand);
}

.fb-rte-surface :deep(h2) {
    font-size: 1.0625rem;
    font-weight: 700;
    margin: 0.25rem 0;
}

.fb-rte-surface :deep(h3) {
    font-size: 0.9375rem;
    font-weight: 700;
    margin: 0.25rem 0;
}

.fb-rte-surface :deep(ul) {
    margin: 0.25rem 0;
    padding-inline-start: 1.25rem;
}

.fb-rte-surface :deep(a) {
    color: var(--fb-brand-600);
    text-decoration: underline;
}

.fb-rte-surface:empty::before {
    content: attr(data-placeholder);
    color: #9ca3af;
}

.fb-rte-raw {
    width: 100%;
    resize: vertical;
    min-height: 5rem;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.5rem 0.625rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--fb-text);
    background: var(--fb-surface);
}

.fb-rte-raw:focus {
    outline: none;
    border-color: var(--fb-brand);
}

.fb-rte-hint {
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    margin: 0;
    line-height: 1.4;
}
</style>
