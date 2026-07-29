<script setup>
import { computed } from 'vue';
import { t, i18n } from '../i18n.js';
import { store, setPageLogic, priorFieldsForPage, findField } from '../store.js';
import { operatorsForType, operatorLabel, valueInputKind } from '../ui-helpers.js';

/**
 * Show/hide logic for a PAGE — the same sentence grammar as the field editor
 * (action segment, typed rules, و/أو connector), scoped to questions on
 * EARLIER pages. Serialized as the page's SurveyJS visibleIf.
 */
const props = defineProps({
    pageIndex: { type: Number, required: true },
});

const uiLocale = computed(() => i18n.locale);
const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');

const page = computed(() => store.state?.pages[props.pageIndex] ?? null);
const logic = computed(() => page.value?.logic ?? null);
const priors = computed(() => priorFieldsForPage(props.pageIndex));

const rules = computed(() => (logic.value && Array.isArray(logic.value.rules) ? logic.value.rules : []));
const action = computed(() => (logic.value?.action === 'hide' ? 'hide' : 'show'));
const match = computed(() => (logic.value?.match === 'any' ? 'any' : 'all'));

/** Raw-expression page logic (imported) is shown read-only here. */
const isAdvanced = computed(() => Boolean(logic.value && typeof logic.value.advanced === 'string'));

function fieldLabel(entry) {
    const lstr = entry.label;
    const text = (contentLocale.value === 'en' ? lstr?.en : lstr?.ar) ?? lstr?.ar ?? '';

    return text || entry.name;
}

function targetType(fieldName) {
    return findField(fieldName)?.field.type ?? null;
}

function targetChoices(fieldName) {
    const found = findField(fieldName);
    if (!found || !Array.isArray(found.field.choices)) {
        return [];
    }

    return found.field.choices.map((choice) => ({
        value: choice.value,
        label: (contentLocale.value === 'en' ? choice.label?.en : choice.label?.ar) ?? choice.label?.ar ?? String(choice.value),
    }));
}

function operatorsFor(index) {
    return operatorsForType(targetType(rules.value[index]?.field));
}

function inputKindFor(index) {
    const rule = rules.value[index];

    return valueInputKind(rule?.op, targetType(rule?.field));
}

function currentBlock() {
    return {
        action: action.value,
        match: match.value,
        rules: rules.value.map((rule) => ({ ...rule })),
    };
}

function commit(block) {
    const hasRules = block.rules.some((rule) => rule && rule.field);
    setPageLogic(props.pageIndex, hasRules ? block : null);
}

function patch(partial) {
    commit({ ...currentBlock(), ...partial });
}

function setAction(value) {
    patch({ action: value === 'hide' ? 'hide' : 'show' });
}

function toggleMatch() {
    patch({ match: match.value === 'all' ? 'any' : 'all' });
}

function addRule() {
    const block = currentBlock();
    const first = priors.value[0];
    block.rules.push({ field: first?.name ?? '', op: '=', value: '' });
    // Commit even when empty-target so the row renders for editing.
    setPageLogic(props.pageIndex, block);
}

function removeRule(index) {
    const block = currentBlock();
    block.rules.splice(index, 1);
    commit(block);
}

function updateRule(index, partial) {
    const block = currentBlock();
    block.rules[index] = { ...block.rules[index], ...partial };
    setPageLogic(props.pageIndex, block);
}

function onFieldChange(index, fieldName) {
    const ops = operatorsForType(targetType(fieldName));
    updateRule(index, { field: fieldName, op: ops[0] ?? '=', value: '' });
}

function onOperatorChange(index, op) {
    const rule = rules.value[index];
    const kind = valueInputKind(op, targetType(rule?.field));
    updateRule(index, { op, value: kind === 'none' ? undefined : rule?.value });
}
</script>

<template>
    <div class="fb-plogic" @click.stop>
        <p v-if="isAdvanced" class="fb-plogic-adv" dir="ltr">{{ logic.advanced }}</p>
        <p v-else-if="priors.length === 0" class="fb-plogic-empty">{{ t('pageLogicNoPriors') }}</p>

        <template v-else>
            <div class="fb-plogic-head">
                <div class="fb-segment-inline" role="group" :aria-label="t('logicActionLabel')">
                    <button
                        type="button"
                        class="fb-seg-btn"
                        :class="{ 'fb-seg-btn--active': action === 'show' }"
                        @click="setAction('show')"
                    >{{ t('logicActionShow') }}</button>
                    <button
                        type="button"
                        class="fb-seg-btn"
                        :class="{ 'fb-seg-btn--active': action === 'hide' }"
                        @click="setAction('hide')"
                    >{{ t('logicActionHide') }}</button>
                </div>
                <span class="fb-plogic-when">{{ t('pageLogicWhen') }}</span>
            </div>

            <template v-for="(rule, index) in rules" :key="index">
                <button
                    v-if="index > 0"
                    type="button"
                    class="fb-rule-connector fb-focus"
                    :title="t('logicConnectorHint')"
                    @click="toggleMatch"
                >{{ match === 'all' ? t('logicAnd') : t('logicOr') }}</button>

                <div class="fb-plogic-rule">
                    <select
                        class="fb-input fb-focus"
                        :value="rule.field"
                        @change="onFieldChange(index, $event.target.value)"
                    >
                        <option value="" disabled>{{ t('logicFieldPlaceholder') }}</option>
                        <option v-for="entry in priors" :key="entry.name" :value="entry.name">
                            {{ fieldLabel(entry) }}
                        </option>
                    </select>

                    <select
                        class="fb-input fb-focus fb-plogic-op"
                        :value="rule.op"
                        @change="onOperatorChange(index, $event.target.value)"
                    >
                        <option v-for="op in operatorsFor(index)" :key="op" :value="op">
                            {{ operatorLabel(op, uiLocale) }}
                        </option>
                    </select>

                    <template v-if="inputKindFor(index) === 'none'"></template>
                    <select
                        v-else-if="['choice', 'choice-multi'].includes(inputKindFor(index))"
                        class="fb-input fb-focus"
                        :value="Array.isArray(rule.value) ? rule.value[0] : rule.value"
                        @change="updateRule(index, { value: inputKindFor(index) === 'choice-multi' ? [$event.target.value] : $event.target.value })"
                    >
                        <option v-for="choice in targetChoices(rule.field)" :key="String(choice.value)" :value="choice.value">
                            {{ choice.label }}
                        </option>
                    </select>
                    <select
                        v-else-if="inputKindFor(index) === 'boolean'"
                        class="fb-input fb-focus"
                        :value="String(rule.value)"
                        @change="updateRule(index, { value: $event.target.value === 'true' })"
                    >
                        <option value="true">{{ contentLocale === 'en' ? 'Yes' : 'نعم' }}</option>
                        <option value="false">{{ contentLocale === 'en' ? 'No' : 'لا' }}</option>
                    </select>
                    <input
                        v-else
                        :type="inputKindFor(index) === 'number' ? 'number' : (inputKindFor(index) === 'date' ? 'date' : 'text')"
                        class="fb-input fb-focus"
                        :value="rule.value ?? ''"
                        @input="updateRule(index, { value: inputKindFor(index) === 'number' ? Number($event.target.value) : $event.target.value })"
                    />

                    <button
                        type="button"
                        class="fb-plogic-remove fb-focus"
                        :title="t('logicRemoveRule')"
                        :aria-label="t('logicRemoveRule')"
                        @click="removeRule(index)"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </template>

            <button type="button" class="fb-plogic-add fb-focus" @click="addRule">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>{{ t('logicAddRule') }}</span>
            </button>
        </template>
    </div>
</template>

<style scoped>
.fb-plogic {
    display: flex;
    flex-direction: column;
    gap: 0.4375rem;
    border: 1px solid var(--fb-border);
    border-radius: 0.625rem;
    background: var(--fb-surface);
    padding: 0.625rem;
    cursor: default;
}

/* segment control (scoped copy — LogicEditor's styles are scoped to it) */
.fb-segment-inline {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    background: var(--fb-surface);
    padding: 0.09375rem;
}

.fb-seg-btn {
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.1875rem 0.5rem;
    border-radius: 0.375rem;
    cursor: pointer;
}

.fb-seg-btn--active {
    background: var(--fb-brand);
    color: #fff;
}

.fb-plogic-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.fb-plogic-when {
    font-size: 0.75rem;
    color: var(--fb-text-muted);
}

.fb-plogic-empty,
.fb-plogic-adv {
    margin: 0;
    font-size: 0.75rem;
    color: var(--fb-text-muted);
}

.fb-plogic-adv {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.fb-plogic-rule {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
}

.fb-plogic-rule .fb-input {
    flex: 1 1 8rem;
    min-width: 0;
    width: auto;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.375rem 0.5rem;
    font-size: 0.8125rem;
    background: var(--fb-surface);
    color: var(--fb-text);
    font-family: inherit;
}

.fb-plogic-op {
    flex: 0 1 7rem;
}

.fb-rule-connector {
    align-self: flex-start;
    border: 1px solid var(--fb-border-strong);
    background: var(--fb-surface);
    color: var(--fb-brand-600);
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.125rem 0.625rem;
    border-radius: 999px;
    cursor: pointer;
}

.fb-rule-connector:hover {
    border-color: var(--fb-brand);
    background: var(--fb-brand-50);
}

.fb-plogic-remove {
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
}

.fb-plogic-remove:hover {
    background: #fef2f2;
    color: #dc2626;
}

.fb-plogic-remove svg {
    width: 0.8125rem;
    height: 0.8125rem;
}

.fb-plogic-add {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
    align-self: flex-start;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.375rem;
    border-radius: 0.375rem;
    cursor: pointer;
}

.fb-plogic-add:hover {
    color: var(--fb-brand-600);
    background: var(--fb-brand-50);
}

.fb-plogic-add svg {
    width: 0.75rem;
    height: 0.75rem;
}
</style>
