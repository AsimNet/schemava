<script setup>
import { computed, ref } from 'vue';
import draggable from 'vuedraggable';
import { t } from '../i18n.js';
import { store, setChoices } from '../store.js';
import {
    makeChoice,
    renameChoiceLabel,
    splitBulkLines,
    choiceValueDiverged,
} from '../ui-helpers.js';

const props = defineProps({
    field: { type: Object, required: true },
    /**
     * Optional override for persisting a new choices array, used when `field`
     * isn't a top-level page field the store can find by name (e.g. a
     * panel_dynamic template question — see PanelTemplateEditor.vue). Defaults
     * to the store's `setChoices(field.name, ...)`.
     */
    onChange: { type: Function, default: null },
});

const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');

const choices = computed(() => props.field.choices ?? []);

const draftInput = ref('');

function applyChoices(next) {
    if (typeof props.onChange === 'function') {
        props.onChange(next);
    } else {
        setChoices(props.field.name, next);
    }
}

function labelText(choice) {
    const lstr = choice.label ?? { ar: '', en: null };

    return (contentLocale.value === 'en' ? lstr.en : lstr.ar) ?? '';
}

function isMissingTranslation(choice) {
    const lstr = choice.label ?? { ar: '', en: null };

    return (lstr.ar ?? '').trim() !== '' && (lstr.en ?? '').trim() === '';
}

function onLabelInput(index, value) {
    const next = [...choices.value];
    next[index] = renameChoiceLabel(next[index], contentLocale.value, value);
    applyChoices(next);
}

function removeChoice(index) {
    const next = choices.value.filter((_, i) => i !== index);
    applyChoices(next);
}

function addFromDraft() {
    const lines = splitBulkLines(draftInput.value);
    if (lines.length === 0) {
        return;
    }
    const next = [...choices.value, ...lines.map((line) => makeChoice(line))];
    applyChoices(next);
    draftInput.value = '';
}

function onDraftPaste(event) {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!/\r?\n/.test(text)) {
        return; // single line — let the normal input flow handle it
    }
    event.preventDefault();
    const lines = splitBulkLines(text);
    if (lines.length === 0) {
        return;
    }
    const next = [...choices.value, ...lines.map((line) => makeChoice(line))];
    applyChoices(next);
    draftInput.value = '';
}

function onReorder() {
    // vuedraggable mutates field.choices in place; persist via setChoices to
    // keep the dirty flag honest.
    applyChoices([...choices.value]);
}

function diverged(choice) {
    return choiceValueDiverged(choice);
}
</script>

<template>
    <div class="fb-choices">
        <span class="fb-field-label">{{ t('choicesLabel') }}</span>

        <p v-if="choices.length === 0" class="fb-choices-empty">{{ t('emptyChoices') }}</p>

        <draggable
            v-else
            :list="props.field.choices"
            item-key="_uid"
            handle=".fb-choice-handle"
            class="fb-choice-list"
            ghost-class="fb-ghost"
            :animation="150"
            @end="onReorder"
        >
            <template #item="{ element, index }">
                <div class="fb-choice-row">
                    <button
                        type="button"
                        class="fb-choice-handle"
                        :title="t('dragHandle')"
                        :aria-label="t('dragHandle')"
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

                    <div class="fb-choice-main">
                        <input
                            :value="labelText(element)"
                            type="text"
                            class="fb-input fb-focus fb-choice-input"
                            @input="onLabelInput(index, $event.target.value)"
                        />
                        <span
                            v-if="diverged(element)"
                            class="fb-choice-value"
                            :title="t('choiceValueHint') + ' ' + element.value"
                            dir="ltr"
                        >{{ element.value }}</span>
                    </div>

                    <span
                        v-if="isMissingTranslation(element)"
                        class="fb-choice-missing"
                        :title="t('missingTranslation')"
                        :aria-label="t('missingTranslation')"
                    ></span>

                    <button
                        type="button"
                        class="fb-choice-remove fb-focus"
                        :title="t('removeChoice')"
                        :aria-label="t('removeChoice')"
                        @click="removeChoice(index)"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </template>
        </draggable>

        <div class="fb-choice-add">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" class="fb-choice-add-icon">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <input
                v-model="draftInput"
                type="text"
                class="fb-input fb-focus fb-choice-add-input"
                :placeholder="t('addChoicePlaceholder')"
                @keydown.enter.prevent="addFromDraft"
                @paste="onDraftPaste"
            />
        </div>
        <p class="fb-hint">{{ t('bulkPasteHint') }}</p>
    </div>
</template>

<style scoped>
.fb-choices {
    display: flex;
    flex-direction: column;
    gap: 0.4375rem;
}

.fb-field-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--fb-text);
}

.fb-choices-empty {
    font-size: 0.75rem;
    color: var(--fb-text-muted);
    margin: 0.25rem 0;
}

.fb-choice-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.fb-choice-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

.fb-choice-handle {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.125rem;
    height: 1.5rem;
    border: none;
    background: transparent;
    color: #c4c7cd;
    cursor: grab;
    padding: 0;
}

.fb-choice-handle:hover {
    color: var(--fb-text-muted);
}

.fb-choice-handle:active {
    cursor: grabbing;
}

.fb-choice-handle svg {
    width: 0.9375rem;
    height: 0.9375rem;
}

.fb-choice-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

.fb-input {
    width: 100%;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.375rem 0.5625rem;
    font-size: 0.8125rem;
    color: var(--fb-text);
    background: var(--fb-surface);
    font-family: inherit;
}

.fb-choice-input {
    flex: 1 1 auto;
    min-width: 0;
}

.fb-choice-value {
    flex: 0 0 auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.625rem;
    color: var(--fb-text-muted);
    background: var(--fb-canvas);
    border: 1px solid var(--fb-border);
    padding: 0.0625rem 0.25rem;
    border-radius: 0.25rem;
    max-width: 6rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.fb-choice-missing {
    flex: 0 0 auto;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 9999px;
    background: #f59e0b;
}

.fb-choice-remove {
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
    transition: background-color 0.15s, color 0.15s;
}

.fb-choice-remove:hover {
    background: #fef2f2;
    color: #dc2626;
}

.fb-choice-remove svg {
    width: 0.875rem;
    height: 0.875rem;
}

.fb-choice-add {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.125rem;
}

.fb-choice-add-icon {
    flex: 0 0 auto;
    width: 0.9375rem;
    height: 0.9375rem;
    color: var(--fb-text-muted);
    margin-inline-start: 0.0625rem;
}

.fb-choice-add-input {
    flex: 1 1 auto;
    min-width: 0;
}

.fb-hint {
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    margin: 0;
    line-height: 1.4;
}
</style>
