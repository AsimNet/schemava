<script setup>
import { computed, ref } from 'vue';
import draggable from 'vuedraggable';
import { t } from '../i18n.js';
import { store, setItems } from '../store.js';
import { makeItem } from '../ui-helpers.js';

const props = defineProps({
    field: { type: Object, required: true },
});

/** Input types offered per row (mirrors short_text's INPUT_TYPES). */
const INPUT_TYPES = [
    { value: 'text', key: 'inputTypeText' },
    { value: 'email', key: 'inputTypeEmail' },
    { value: 'tel', key: 'inputTypeTel' },
    { value: 'url', key: 'inputTypeUrl' },
];

const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');

const items = computed(() => props.field.items ?? []);

let itemCounter = 0;

/** A fresh, collision-checked machine name for a newly added item row. */
function nextItemName() {
    const taken = new Set(items.value.map((item) => item.name));
    let name;
    do {
        itemCounter += 1;
        name = `item${itemCounter}`;
    } while (taken.has(name));

    return name;
}

function labelText(item) {
    const lstr = item.label ?? { ar: '', en: null };

    return (contentLocale.value === 'en' ? lstr.en : lstr.ar) ?? '';
}

function onLabelInput(index, value) {
    const next = [...items.value];
    const lstr = { ...(next[index].label ?? { ar: '', en: null }) };
    if (contentLocale.value === 'en') {
        lstr.en = value === '' ? null : value;
    } else {
        lstr.ar = value;
    }
    next[index] = { ...next[index], label: lstr };
    setItems(props.field.name, next);
}

function onNameInput(index, value) {
    const next = [...items.value];
    next[index] = { ...next[index], name: value };
    setItems(props.field.name, next);
}

function onInputTypeChange(index, value) {
    const next = [...items.value];
    next[index] = { ...next[index], inputType: value === 'text' ? null : value };
    setItems(props.field.name, next);
}

function removeItem(index) {
    const next = items.value.filter((_, i) => i !== index);
    setItems(props.field.name, next);
}

function addItem() {
    const next = [...items.value, makeItem(nextItemName(), '')];
    setItems(props.field.name, next);
}

function onReorder() {
    // vuedraggable mutates field.items in place; persist via setItems to keep
    // the dirty flag honest.
    setItems(props.field.name, [...items.value]);
}
</script>

<template>
    <div class="fb-items">
        <span class="fb-field-label">{{ t('itemsLabel') }}</span>

        <p v-if="items.length === 0" class="fb-items-empty">{{ t('emptyItems') }}</p>

        <draggable
            v-else
            :list="props.field.items"
            item-key="_uid"
            handle=".fb-item-handle"
            class="fb-item-list"
            ghost-class="fb-ghost"
            :animation="150"
            @end="onReorder"
        >
            <template #item="{ element, index }">
                <div class="fb-item-row">
                    <button
                        type="button"
                        class="fb-item-handle"
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

                    <div class="fb-item-fields">
                        <input
                            :value="labelText(element)"
                            type="text"
                            class="fb-input fb-focus fb-item-input"
                            :placeholder="t('labelField')"
                            @input="onLabelInput(index, $event.target.value)"
                        />
                        <input
                            :value="element.name"
                            type="text"
                            class="fb-input fb-focus fb-item-input fb-mono"
                            dir="ltr"
                            spellcheck="false"
                            :placeholder="t('itemNameLabel')"
                            @input="onNameInput(index, $event.target.value)"
                        />
                        <select
                            class="fb-input fb-focus fb-item-select"
                            :value="element.inputType ?? 'text'"
                            @change="onInputTypeChange(index, $event.target.value)"
                        >
                            <option v-for="it in INPUT_TYPES" :key="it.value" :value="it.value">{{ t(it.key) }}</option>
                        </select>
                    </div>

                    <button
                        type="button"
                        class="fb-item-remove fb-focus"
                        :title="t('removeItem')"
                        :aria-label="t('removeItem')"
                        @click="removeItem(index)"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </template>
        </draggable>

        <button type="button" class="fb-item-add fb-focus" @click="addItem">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>{{ t('addItem') }}</span>
        </button>
    </div>
</template>

<style scoped>
.fb-items {
    display: flex;
    flex-direction: column;
    gap: 0.4375rem;
}

.fb-field-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--fb-text);
}

.fb-items-empty {
    font-size: 0.75rem;
    color: var(--fb-text-muted);
    margin: 0.25rem 0;
}

.fb-item-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.fb-item-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

.fb-item-handle {
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

.fb-item-handle:hover {
    color: var(--fb-text-muted);
}

.fb-item-handle:active {
    cursor: grabbing;
}

.fb-item-handle svg {
    width: 0.9375rem;
    height: 0.9375rem;
}

.fb-item-fields {
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

.fb-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
}

.fb-item-input {
    flex: 1 1 0;
    min-width: 0;
}

.fb-item-select {
    flex: 0 0 auto;
    width: auto;
}

.fb-item-remove {
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

.fb-item-remove:hover {
    background: #fef2f2;
    color: #dc2626;
}

.fb-item-remove svg {
    width: 0.875rem;
    height: 0.875rem;
}

.fb-item-add {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    align-self: flex-start;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.1875rem 0.375rem;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: color 0.15s, background-color 0.15s;
}

.fb-item-add:hover {
    color: var(--fb-brand-600);
    background: var(--fb-brand-50);
}

.fb-item-add svg {
    width: 0.9375rem;
    height: 0.9375rem;
}
</style>
