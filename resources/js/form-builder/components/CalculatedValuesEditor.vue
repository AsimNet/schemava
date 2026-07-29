<script setup>
import { computed, reactive } from 'vue';
import { t } from '../i18n.js';
import {
    store,
    addCalculatedValue,
    updateCalculatedValue,
    removeCalculatedValue,
    renameCalculatedValue,
    allFieldEntries,
} from '../store.js';
import { fieldReferenceOptions, calculatedValueOptions, insertVariableAt } from '../ui-helpers.js';
import VariableMenu from './VariableMenu.vue';

const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');
const items = computed(() => store.state?.calculatedValues ?? []);

const fieldOptions = computed(() => fieldReferenceOptions(allFieldEntries(), contentLocale.value));

/** Other calculated values (excluding the row itself) offered as formula references. */
function calcOptionsExcluding(index) {
    return calculatedValueOptions(items.value.filter((_, i) => i !== index));
}

/* ------------------------------------------------------------- name editing */

const nameDrafts = reactive({});
const nameErrors = reactive({});

function nameDraft(index) {
    return Object.prototype.hasOwnProperty.call(nameDrafts, index) ? nameDrafts[index] : (items.value[index]?.name ?? '');
}

function onNameInput(index, value) {
    nameDrafts[index] = value;
}

function commitName(index) {
    if (!Object.prototype.hasOwnProperty.call(nameDrafts, index)) {
        return;
    }
    const error = renameCalculatedValue(index, nameDrafts[index]);
    nameErrors[index] = error;
    delete nameDrafts[index];
}

/* ------------------------------------------------------- expression editing */

const caretPositions = reactive({});
const inputRefs = reactive({});

function registerRef(index, el) {
    inputRefs[index] = el;
}

function rememberCaret(index, event) {
    const el = event?.target;
    if (el && typeof el.selectionStart === 'number') {
        caretPositions[index] = el.selectionStart;
    }
}

function insertToken(index, key) {
    const current = items.value[index]?.expression ?? '';
    const caret = caretPositions[index] ?? current.length;
    const { text, caret: nextCaret } = insertVariableAt(current, caret, key);
    updateCalculatedValue(index, { expression: text });
    caretPositions[index] = nextCaret;
    const el = inputRefs[index];
    if (el) {
        requestAnimationFrame(() => {
            el.focus();
            try {
                el.setSelectionRange(nextCaret, nextCaret);
            } catch {
                /* non-text inputs */
            }
        });
    }
}

/* ------------------------------------------------------------------ actions */

function onAdd() {
    addCalculatedValue();
}

function onRemove(index) {
    removeCalculatedValue(index);
    delete nameDrafts[index];
    delete nameErrors[index];
}

function onToggleInclude(index, checked) {
    updateCalculatedValue(index, { includeIntoResult: checked });
}
</script>

<template>
    <div class="fb-calcvalues">
        <p class="fb-settings-hint">{{ t('calculatedValuesHint') }}</p>

        <p v-if="items.length === 0" class="fb-calcvalues-empty">{{ t('calculatedValuesEmpty') }}</p>

        <div v-for="(item, index) in items" :key="index" class="fb-calcvalue-row">
            <div class="fb-calcvalue-head">
                <input
                    :value="nameDraft(index)"
                    type="text"
                    class="fb-settings-input fb-mono fb-focus"
                    :class="{ 'fb-input--error': nameErrors[index] }"
                    dir="ltr"
                    spellcheck="false"
                    autocomplete="off"
                    :placeholder="t('calculatedValueNamePlaceholder')"
                    @input="onNameInput(index, $event.target.value)"
                    @blur="commitName(index)"
                    @keydown.enter.prevent="commitName(index)"
                />
                <button
                    type="button"
                    class="fb-calcvalue-remove fb-focus"
                    :title="t('calculatedValueRemove')"
                    :aria-label="t('calculatedValueRemove')"
                    @click="onRemove(index)"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <p v-if="nameErrors[index]" class="fb-error">{{ t(nameErrors[index]) }}</p>

            <div class="fb-calcvalue-field-head">
                <span class="fb-settings-label">{{ t('expressionFormula') }}</span>
                <VariableMenu
                    :fields="fieldOptions"
                    :calculated-values="calcOptionsExcluding(index)"
                    @insert="(k) => insertToken(index, k)"
                />
            </div>
            <input
                :ref="(el) => registerRef(index, el)"
                :value="item.expression"
                type="text"
                class="fb-settings-input fb-mono fb-focus"
                dir="ltr"
                spellcheck="false"
                :placeholder="t('expressionFormulaPlaceholder')"
                @input="updateCalculatedValue(index, { expression: $event.target.value })"
                @keyup="rememberCaret(index, $event)"
                @click="rememberCaret(index, $event)"
                @blur="rememberCaret(index, $event)"
            />

            <label class="fb-calcvalue-toggle">
                <input
                    type="checkbox"
                    class="fb-checkbox"
                    :checked="item.includeIntoResult"
                    @change="onToggleInclude(index, $event.target.checked)"
                />
                <span>{{ t('calculatedValueIncludeIntoResult') }}</span>
            </label>
        </div>

        <button type="button" class="fb-calcvalue-add fb-focus" @click="onAdd">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>{{ t('calculatedValueAdd') }}</span>
        </button>
    </div>
</template>

<style scoped>
.fb-calcvalues {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.fb-calcvalues-empty {
    font-size: 0.75rem;
    color: var(--fb-text-muted);
    margin: 0;
}

.fb-calcvalue-row {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    background: var(--fb-canvas);
    border: 1px solid var(--fb-border);
    border-radius: 0.625rem;
    padding: 0.625rem 0.75rem;
}

.fb-calcvalue-head {
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

.fb-calcvalue-head .fb-settings-input {
    flex: 1 1 auto;
    min-width: 0;
}

.fb-calcvalue-field-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
}

.fb-calcvalue-remove {
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

.fb-calcvalue-remove:hover {
    background: #fef2f2;
    color: #dc2626;
}

.fb-calcvalue-remove svg {
    width: 0.875rem;
    height: 0.875rem;
}

.fb-calcvalue-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--fb-text);
    cursor: pointer;
}

.fb-checkbox {
    width: 1rem;
    height: 1rem;
    accent-color: var(--fb-brand);
    cursor: pointer;
}

.fb-calcvalue-add {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    align-self: flex-start;
    border: 1px dashed var(--fb-border-strong);
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.375rem 0.75rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
}

.fb-calcvalue-add:hover {
    border-color: var(--fb-brand);
    color: var(--fb-brand-600);
}

.fb-calcvalue-add svg {
    width: 0.875rem;
    height: 0.875rem;
}

.fb-settings-hint {
    margin: 0 0 0.25rem;
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    line-height: 1.45;
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

.fb-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
}

.fb-input--error {
    border-color: #dc2626;
}

.fb-error {
    font-size: 0.6875rem;
    color: #dc2626;
    margin: 0;
}
</style>
