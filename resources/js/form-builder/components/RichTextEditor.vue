<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { watch } from 'vue';
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

watch(
    () => props.modelValue,
    () => {
        if (!rawMode.value) {
            syncEditableFromModel();
        }
    },
);

/**
 * Strip editor-inherited font declarations from WYSIWYG output. execCommand
 * block-wrapping (justify*, lists) makes Chromium bake the EDITOR UI's
 * computed font-family/size into <span style="…"> — which would force the
 * builder's font (IBM Plex) and sizing onto the published form, where hosts
 * and respondents may not even have that font. Authors can't set fonts from
 * the toolbar, so any such declaration is an artifact. Filters per declaration
 * inside each style attribute (values may contain &quot; entities), keeping
 * intentional ones like text-align. Raw-HTML mode is left untouched.
 */
function stripEditorArtifacts(html) {
    return String(html ?? '').replace(/\s*style="([^"]*)"/gi, (match, css) => {
        const kept = css
            .split(';')
            .map((declaration) => declaration.trim())
            .filter((declaration) => declaration !== '' && !/^font(-family|-size)?\s*:/i.test(declaration));

        return kept.length > 0 ? ` style="${kept.join('; ')};"` : '';
    });
}

/** Emit the current contenteditable html (sanitized) on every input. */
function onInput() {
    const el = editable.value;
    if (!el) {
        return;
    }
    emit('update:modelValue', stripEditorArtifacts(sanitizeStatementHtml(el.innerHTML)));
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
        const cleaned = stripEditorArtifacts(stripStyleBlocks(sanitizeStatementHtml(el.innerHTML)));
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
    refreshActiveStates();
}

/* --------------------------------------------- caret-aware toolbar states */

/**
 * Which formats are live at the caret/selection — drives the toolbar's pressed
 * states so the buttons answer "what am I inside of?" instead of being inert.
 */
const active = ref({
    bold: false, italic: false, underline: false,
    h2: false, h3: false, list: false,
    alignRight: false, alignCenter: false, alignLeft: false,
});

function refreshActiveStates() {
    const el = editable.value;
    if (!el || rawMode.value) {
        return;
    }
    const selection = typeof document !== 'undefined' ? document.getSelection() : null;
    if (!selection || !selection.anchorNode || !el.contains(selection.anchorNode)) {
        return;
    }
    const state = (command) => {
        try {
            return document.queryCommandState(command);
        } catch {
            return false;
        }
    };
    let block = '';
    try {
        block = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
    } catch {
        /* unsupported */
    }
    active.value = {
        bold: state('bold'),
        italic: state('italic'),
        underline: state('underline'),
        h2: block === 'h2',
        h3: block === 'h3',
        list: state('insertUnorderedList'),
        alignRight: state('justifyRight'),
        alignCenter: state('justifyCenter'),
        alignLeft: state('justifyLeft'),
    };
}

onMounted(() => {
    if (!rawMode.value) {
        syncEditableFromModel();
    }
    document.addEventListener('selectionchange', refreshActiveStates);
});

onBeforeUnmount(() => {
    document.removeEventListener('selectionchange', refreshActiveStates);
});

/** Heading buttons toggle: clicking the active heading returns to paragraph. */
function formatBlock(tag) {
    exec('formatBlock', active.value[tag] ? 'p' : tag);
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
    refreshActiveStates();
}

/** Raw-HTML textarea writes the html string directly (sanitized). */
function onRawInput(event) {
    emit('update:modelValue', sanitizeStatementHtml(event.target.value));
}

/** Switch WYSIWYG <-> raw; re-render the editable from the model on return. */
function setRawMode(next) {
    if (rawMode.value === next) {
        return;
    }
    rawMode.value = next;
    if (!next) {
        nextTick(syncEditableFromModel);
    }
}

/**
 * Toolbar model: groups separated by hairlines. Letter glyphs stay for the
 * text-level formats (locale-neutral, self-styling); structural tools get
 * stroke icons. `state` names the entry in `active` that marks it pressed.
 */
const TOOL_GROUPS = [
    [
        { key: 'bold', label: 'richBold', glyph: 'B', style: 'font-weight:700', state: 'bold', command: () => exec('bold') },
        { key: 'italic', label: 'richItalic', glyph: 'I', style: 'font-style:italic', state: 'italic', command: () => exec('italic') },
        { key: 'underline', label: 'richUnderline', glyph: 'U', style: 'text-decoration:underline', state: 'underline', command: () => exec('underline') },
    ],
    [
        { key: 'h2', label: 'richHeading2', glyph: 'H2', style: 'font-weight:700;font-size:0.8125rem', state: 'h2', command: () => formatBlock('h2') },
        { key: 'h3', label: 'richHeading3', glyph: 'H3', style: 'font-weight:700;font-size:0.71875rem', state: 'h3', command: () => formatBlock('h3') },
    ],
    [
        {
            key: 'alignRight',
            label: 'richAlignRight',
            state: 'alignRight',
            icon: 'M20.25 6.75H3.75M14.25 12H3.75m13.5 5.25H3.75',
            command: () => exec('justifyRight'),
        },
        {
            key: 'alignCenter',
            label: 'richAlignCenter',
            state: 'alignCenter',
            icon: 'M20.25 6.75H3.75M16.5 12h-9m11.25 5.25H5.25',
            command: () => exec('justifyCenter'),
        },
        {
            key: 'alignLeft',
            label: 'richAlignLeft',
            state: 'alignLeft',
            icon: 'M20.25 6.75H3.75m16.5 5.25H9.75m10.5 5.25H6.75',
            command: () => exec('justifyLeft'),
        },
    ],
    [
        {
            key: 'list',
            label: 'richList',
            state: 'list',
            icon: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
            command: () => exec('insertUnorderedList'),
        },
        {
            key: 'link',
            label: 'richLink',
            icon: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244',
            command: insertLink,
        },
    ],
    [
        {
            key: 'clear',
            label: 'richClear',
            icon: 'M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z',
            command: clearFormatting,
        },
    ],
];
</script>

<template>
    <div class="fb-rte">
        <!-- One writing frame: toolbar fused to the surface, focus lifts the whole unit. -->
        <div class="fb-rte-frame" :class="{ 'fb-rte-frame--raw': rawMode }">
            <div class="fb-rte-toolbar">
                <div v-if="!rawMode" class="fb-rte-tools" role="toolbar" :aria-label="t('statementHtml')">
                    <div v-for="(group, gIndex) in TOOL_GROUPS" :key="gIndex" class="fb-rte-group">
                        <button
                            v-for="tool in group"
                            :key="tool.key"
                            type="button"
                            class="fb-rte-btn fb-focus"
                            :class="{ 'fb-rte-btn--on': tool.state && active[tool.state] }"
                            :title="t(tool.label)"
                            :aria-label="t(tool.label)"
                            :aria-pressed="tool.state ? Boolean(active[tool.state]) : undefined"
                            :style="tool.style"
                            @mousedown.prevent
                            @click="tool.command"
                        >
                            <svg v-if="tool.icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" :d="tool.icon" />
                            </svg>
                            <template v-else>{{ tool.glyph }}</template>
                        </button>
                    </div>
                </div>
                <span v-else class="fb-rte-rawnote" dir="ltr">&lt;/&gt;</span>

                <!-- Mode switch: same segmented grammar as the header's ع|EN toggle. -->
                <div class="fb-rte-mode" role="group" :aria-label="t('editHtml')">
                    <button
                        type="button"
                        class="fb-rte-mode-btn fb-focus"
                        :class="{ 'fb-rte-mode-btn--active': !rawMode }"
                        :aria-pressed="!rawMode"
                        @click="setRawMode(false)"
                    >
                        {{ t('richModeVisual') }}
                    </button>
                    <button
                        type="button"
                        class="fb-rte-mode-btn fb-focus"
                        :class="{ 'fb-rte-mode-btn--active': rawMode }"
                        :aria-pressed="rawMode"
                        @click="setRawMode(true)"
                    >
                        HTML
                    </button>
                </div>
            </div>

            <div
                v-show="!rawMode"
                ref="editable"
                class="fb-rte-surface"
                contenteditable="true"
                role="textbox"
                aria-multiline="true"
                :dir="dir"
                :data-placeholder="t('richPlaceholder')"
                @input="onInput"
                @paste="onPaste"
                @focus="refreshActiveStates"
            ></div>

            <textarea
                v-show="rawMode"
                class="fb-rte-raw"
                dir="ltr"
                spellcheck="false"
                rows="6"
                :placeholder="'<p>…</p>'"
                :value="modelValue"
                @input="onRawInput"
            ></textarea>
        </div>

        <p class="fb-rte-hint">{{ t('statementHtmlHint') }}</p>
    </div>
</template>

<style scoped>
.fb-rte {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

/* ------------------------------------------------------- the writing frame */

.fb-rte-frame {
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.625rem;
    background: var(--fb-surface);
    overflow: hidden;
    transition: border-color 0.15s, box-shadow 0.15s;
}

.fb-rte-frame:focus-within {
    border-color: var(--fb-brand);
    box-shadow: 0 0 0 1px var(--fb-brand);
}

.fb-rte-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
    row-gap: 0.25rem;
    padding: 0.25rem 0.375rem;
    background: var(--fb-canvas);
    border-bottom: 1px solid var(--fb-border);
}

.fb-rte-tools {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    flex-wrap: wrap;
}

/* semantic groups, separated by hairlines */
.fb-rte-group {
    display: inline-flex;
    align-items: center;
    gap: 0.0625rem;
    padding-inline: 0.1875rem;
}

.fb-rte-group + .fb-rte-group {
    border-inline-start: 1px solid var(--fb-border);
}

.fb-rte-group:first-child {
    padding-inline-start: 0;
}

.fb-rte-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    height: 1.625rem;
    padding: 0 0.1875rem;
    border: none;
    background: transparent;
    color: var(--fb-text);
    font-size: 0.78125rem;
    border-radius: 0.4375rem;
    cursor: pointer;
    transition: background-color 0.12s, color 0.12s;
}

.fb-rte-btn svg {
    width: 0.9375rem;
    height: 0.9375rem;
}

.fb-rte-btn:hover {
    background: var(--fb-brand-50);
    color: var(--fb-brand-600);
}

/* the caret is inside this format — the button answers back */
.fb-rte-btn--on {
    background: var(--fb-brand-50);
    color: var(--fb-brand-600);
    box-shadow: inset 0 0 0 1px var(--fb-brand);
}

.fb-rte-rawnote {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.71875rem;
    font-weight: 700;
    color: var(--fb-text-muted);
    padding-inline: 0.25rem;
}

/* mode switch — mirrors the header's segmented control */
.fb-rte-mode {
    display: inline-flex;
    align-items: center;
    margin-inline-start: auto;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    background: var(--fb-surface);
    padding: 0.09375rem;
    flex: 0 0 auto;
}

.fb-rte-mode-btn {
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    font-size: 0.65625rem;
    font-weight: 700;
    padding: 0.1875rem 0.4375rem;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: background-color 0.12s, color 0.12s;
}

.fb-rte-mode-btn--active {
    background: var(--fb-brand);
    color: #fff;
}

/* --------------------------------------------------------- writing surface */

.fb-rte-surface {
    min-height: 7rem;
    max-height: 18rem;
    overflow-y: auto;
    padding: 0.75rem 0.875rem;
    font-size: 0.875rem;
    line-height: 1.7;
    color: var(--fb-text);
    background: var(--fb-surface);
}

.fb-rte-surface:focus {
    outline: none;
}

.fb-rte-surface :deep(h2) {
    font-size: 1.0625rem;
    font-weight: 700;
    margin: 0.375rem 0 0.25rem;
}

.fb-rte-surface :deep(h3) {
    font-size: 0.9375rem;
    font-weight: 700;
    margin: 0.375rem 0 0.25rem;
}

.fb-rte-surface :deep(ul),
.fb-rte-surface :deep(ol) {
    /* Tailwind preflight (bundled with the builder) resets list-style: none —
       restore markers so authored lists LOOK like lists while editing. */
    margin: 0.25rem 0;
    padding-inline-start: 1.25rem;
}

.fb-rte-surface :deep(ul) {
    list-style: disc;
}

.fb-rte-surface :deep(ol) {
    list-style: decimal;
}

.fb-rte-surface :deep(a) {
    color: var(--fb-brand-600);
    text-decoration: underline;
}

.fb-rte-surface:empty::before {
    content: attr(data-placeholder);
    color: #9ca3af;
    pointer-events: none;
}

/* HTML source mode: same frame, code atmosphere */
.fb-rte-raw {
    display: block;
    width: 100%;
    resize: vertical;
    min-height: 7rem;
    border: none;
    padding: 0.75rem 0.875rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
    line-height: 1.6;
    color: var(--fb-text);
    background: var(--fb-surface);
}

.fb-rte-raw:focus {
    outline: none;
}

.fb-rte-raw::placeholder {
    color: #b6bac2;
}

.fb-rte-hint {
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    margin: 0;
    line-height: 1.4;
}
</style>
