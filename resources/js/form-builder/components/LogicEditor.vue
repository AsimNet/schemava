<script setup>
import { computed, ref, watch } from 'vue';
import { t, i18n } from '../i18n.js';
import { store, setLogic, priorFields, findField } from '../store.js';
import { compileLogic, parseLogic, parseEnableExpression } from '../model/expressions.js';
import {
    operatorsForType,
    operatorLabel,
    valueInputKind,
    variableInputKind,
    variableMetaFor,
    variableOptions,
    normalizeLogicAction,
} from '../ui-helpers.js';

const props = defineProps({
    field: { type: Object, required: true },
});

const uiLocale = computed(() => i18n.locale);
const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');

/** Advanced (raw-expression) mode toggle. */
const textMode = ref(false);
const advancedDraft = ref('');
/**
 * Whether the expression currently edited as text compiles to `enableIf`
 * (disable / enable-targeted) rather than `visibleIf`. Captured when entering
 * text mode so re-parsing on commit keeps the same SurveyJS target.
 */
const textTargetsEnable = ref(false);

const isAdvancedLogic = computed(() => Boolean(props.field.logic && typeof props.field.logic.advanced === 'string'));

/** Does a logic block compile to `enableIf` (disable action or enable target)? */
function logicTargetsEnable(logic) {
    return Boolean(logic && (logic.action === 'disable' || logic.target === 'enable'));
}

watch(
    () => props.field?.name,
    () => {
        textMode.value = isAdvancedLogic.value;
        advancedDraft.value = isAdvancedLogic.value ? props.field.logic.advanced : '';
        textTargetsEnable.value = logicTargetsEnable(props.field.logic);
    },
    { immediate: true },
);

/* ------------------------------------------------------------ prior targets */

const priors = computed(() => priorFields(props.field.name));

const variableOpts = computed(() => variableOptions(store.runtimeContextKeys ?? [], contentLocale.value));

function fieldLabel(entry) {
    const lstr = entry.label;
    const text = (contentLocale.value === 'en' ? lstr?.en : lstr?.ar) ?? lstr?.ar ?? '';

    return text || entry.name;
}

/** Builder type of a rule target (null for a predefined variable / unknown). */
function targetType(fieldName) {
    const found = findField(fieldName);

    return found ? found.field.type : null;
}

/**
 * Typed metadata for a rule target when it is a predefined variable (not a form
 * field). `null` for form fields and uncatalogued variables.
 */
function targetVariableMeta(fieldName) {
    if (findField(fieldName)) {
        return null; // a real field — typed by its builder type, not variable meta
    }

    return variableMetaFor(store.variableMeta ?? {}, fieldName);
}

/** Enum options for an enum-typed predefined variable target. */
function variableEnumOptions(fieldName) {
    const meta = targetVariableMeta(fieldName);

    return Array.isArray(meta?.options) ? meta.options : [];
}

/** Whether the rule target is a predefined variable (vs a form field). */
function isVariableTarget(fieldName) {
    return Boolean(fieldName) && !findField(fieldName);
}

/** Choices of a rule target field, for choice-typed value inputs. */
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

/* ----------------------------------------------------------- editable logic */

const action = computed({
    get: () => normalizeLogicAction(props.field.logic?.action),
    set: (value) => patch({ action: normalizeLogicAction(value) }),
});

const match = computed({
    get: () => (props.field.logic && props.field.logic.match === 'any' ? 'any' : 'all'),
    set: (value) => patch({ match: value === 'any' ? 'any' : 'all' }),
});

const rules = computed(() => (props.field.logic && Array.isArray(props.field.logic.rules) ? props.field.logic.rules : []));

/** Current working block with sane defaults. */
function currentBlock() {
    const logic = props.field.logic;
    if (logic && Array.isArray(logic.rules)) {
        return {
            action: normalizeLogicAction(logic.action),
            match: logic.match === 'any' ? 'any' : 'all',
            rules: logic.rules.map((rule) => ({ ...rule })),
        };
    }

    return { action: 'show', match: 'all', rules: [] };
}

function patch(partial) {
    const block = { ...currentBlock(), ...partial };
    setLogic(props.field.name, block);
}

/**
 * A sensible starting value for a freshly chosen operator + target type, so
 * choice/boolean inputs aren't left out of sync with their first option.
 */
function seedValue(op, fieldName) {
    if (isVariableTarget(fieldName)) {
        const kind = variableInputKind(op, targetVariableMeta(fieldName));
        if (kind === 'none') {
            return undefined;
        }
        if (kind === 'boolean') {
            return true;
        }
        if (kind === 'enum') {
            return variableEnumOptions(fieldName)[0]?.value ?? '';
        }

        return '';
    }

    const type = targetType(fieldName);
    const kind = valueInputKind(op, type);
    if (kind === 'none') {
        return undefined;
    }
    if (kind === 'choice-multi') {
        return [];
    }
    if (kind === 'boolean') {
        return true;
    }
    if (kind === 'choice') {
        return targetChoices(fieldName)[0]?.value ?? '';
    }

    return '';
}

function addRule() {
    const block = currentBlock();
    const firstTarget = priors.value[0]?.name ?? (store.runtimeContextKeys ?? [])[0] ?? '';
    const ops = operatorsForType(targetType(firstTarget));
    const op = ops[0] ?? '=';
    block.rules = [...block.rules, { field: firstTarget, op, value: seedValue(op, firstTarget) }];
    setLogic(props.field.name, block);
}

function removeRule(index) {
    const block = currentBlock();
    block.rules = block.rules.filter((_, i) => i !== index);
    setLogic(props.field.name, block.rules.length > 0 ? block : null);
}

function updateRule(index, partial) {
    const block = currentBlock();
    const next = { ...block.rules[index], ...partial };
    block.rules = block.rules.map((rule, i) => (i === index ? next : rule));
    setLogic(props.field.name, block);
}

function onFieldChange(index, fieldName) {
    // Reset operator/value to defaults appropriate for the new target type.
    const ops = operatorsForType(targetType(fieldName));
    const op = ops[0] ?? '=';
    updateRule(index, { field: fieldName, op, value: seedValue(op, fieldName) });
}

function onOperatorChange(index, op) {
    const rule = rules.value[index];
    const variable = isVariableTarget(rule.field);
    const kind = variable
        ? variableInputKind(op, targetVariableMeta(rule.field))
        : valueInputKind(op, targetType(rule.field));
    let value = rule.value;
    if (kind === 'none') {
        value = undefined;
    } else if (kind === 'choice-multi' && !Array.isArray(value)) {
        value = [];
    } else if (kind === 'boolean') {
        value = value === true;
    } else if (kind === 'choice' && (value === '' || value === undefined || Array.isArray(value))) {
        value = targetChoices(rule.field)[0]?.value ?? '';
    } else if (kind === 'enum' && (value === '' || value === undefined || Array.isArray(value))) {
        value = variableEnumOptions(rule.field)[0]?.value ?? '';
    } else if (Array.isArray(value)) {
        value = '';
    }
    updateRule(index, { op, value });
}

function operatorsFor(index) {
    return operatorsForType(targetType(rules.value[index]?.field));
}

function inputKindFor(index) {
    const rule = rules.value[index];
    if (isVariableTarget(rule.field)) {
        return variableInputKind(rule.op, targetVariableMeta(rule.field));
    }

    return valueInputKind(rule.op, targetType(rule.field));
}

function numberValue(index) {
    const v = rules.value[index]?.value;

    return v === null || v === undefined || v === '' ? '' : v;
}

function onNumberInput(index, raw) {
    const num = raw === '' ? '' : Number(raw);
    updateRule(index, { value: Number.isFinite(num) ? num : '' });
}

function multiSelected(index) {
    const v = rules.value[index]?.value;

    return Array.isArray(v) ? v : [];
}

function toggleMulti(index, value) {
    const current = multiSelected(index);
    const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
    updateRule(index, { value: next });
}

/* ------------------------------------------------------------- preview/text */

const preview = computed(() => {
    if (textMode.value) {
        return advancedDraft.value.trim();
    }
    const compiled = compileLogic(props.field.logic);

    return compiled ?? '';
});

/**
 * Which SurveyJS property the previewed expression compiles to: `enableIf` for
 * a disable action (or an advanced block tagged for enable), `visibleIf`
 * otherwise. Labels the preview so it's clear which property is produced.
 */
const previewProp = computed(() => {
    const logic = props.field.logic;
    const targetsEnable = logic
        && (logic.action === 'disable' || logic.target === 'enable');

    return targetsEnable ? t('logicEnableIfLabel') : t('logicVisibleIfLabel');
});

function enterTextMode() {
    textTargetsEnable.value = logicTargetsEnable(props.field.logic);
    advancedDraft.value = compileLogic(props.field.logic) ?? advancedDraft.value ?? '';
    textMode.value = true;
}

function commitAdvanced() {
    const trimmed = advancedDraft.value.trim();
    if (trimmed === '') {
        setLogic(props.field.name, null);

        return;
    }
    // Re-parse into the visual model, keeping the original SurveyJS target: an
    // enable-targeted expression (disable / advanced enable) round-trips through
    // the enableIf parser; everything else through the visibleIf parser. A
    // brand-new advanced expression typed by the user defaults to visibleIf.
    if (textTargetsEnable.value) {
        const parsed = parseEnableExpression(trimmed);
        setLogic(props.field.name, parsed ?? { advanced: trimmed, target: 'enable' });

        return;
    }
    const parsed = parseLogic(trimmed);
    setLogic(props.field.name, parsed ?? { advanced: trimmed });
}

function exitTextMode() {
    commitAdvanced();
    if (!isAdvancedLogic.value) {
        textMode.value = false;
    }
}

const canEditVisually = computed(() => priors.value.length > 0 || (store.runtimeContextKeys ?? []).length > 0);
</script>

<template>
    <div class="fb-logic">
        <!-- Advanced / raw-text editing -->
        <template v-if="textMode">
            <p class="fb-logic-advnote">{{ t('logicAdvancedNote') }}</p>
            <textarea
                v-model="advancedDraft"
                class="fb-input fb-mono fb-logic-textarea fb-focus"
                dir="ltr"
                spellcheck="false"
                rows="3"
                @blur="commitAdvanced"
            ></textarea>
            <button type="button" class="fb-logic-link fb-focus" @click="exitTextMode">
                {{ t('logicEditVisually') }}
            </button>
        </template>

        <template v-else>
            <p v-if="!canEditVisually" class="fb-hint">{{ t('logicNoPriorFields') }}</p>

            <template v-else>
                <div class="fb-logic-head">
                    <div class="fb-segment-inline" role="group" :aria-label="t('logicActionLabel')">
                        <button
                            type="button"
                            class="fb-seg-btn"
                            :class="{ 'fb-seg-btn--active': action === 'show' }"
                            @click="action = 'show'"
                        >{{ t('logicActionShow') }}</button>
                        <button
                            type="button"
                            class="fb-seg-btn"
                            :class="{ 'fb-seg-btn--active': action === 'hide' }"
                            @click="action = 'hide'"
                        >{{ t('logicActionHide') }}</button>
                        <button
                            type="button"
                            class="fb-seg-btn"
                            :class="{ 'fb-seg-btn--active': action === 'disable' }"
                            @click="action = 'disable'"
                        >{{ t('logicActionDisable') }}</button>
                    </div>
                    <span class="fb-logic-when">{{ t('logicWhenPrefix') }}</span>
                </div>

                <template v-for="(rule, index) in rules" :key="index">
                <!-- Tally-style connector: rules read as one sentence; the
                     و/أو pill between rows toggles all/any for the block. -->
                <button
                    v-if="index > 0"
                    type="button"
                    class="fb-rule-connector fb-focus"
                    :title="t('logicConnectorHint')"
                    :aria-label="t('logicConnectorHint')"
                    @click="match = match === 'all' ? 'any' : 'all'"
                >{{ match === 'all' ? t('logicAnd') : t('logicOr') }}</button>
                <div class="fb-rule">
                    <select
                        class="fb-input fb-focus fb-rule-field"
                        :value="rule.field"
                        @change="onFieldChange(index, $event.target.value)"
                    >
                        <option value="" disabled>{{ t('logicFieldPlaceholder') }}</option>
                        <optgroup :label="t('logicFieldsGroup')">
                            <option v-for="entry in priors" :key="entry.name" :value="entry.name">
                                {{ fieldLabel(entry) }}
                            </option>
                        </optgroup>
                        <optgroup v-if="variableOpts.length" :label="t('logicVariablesGroup')">
                            <option v-for="opt in variableOpts" :key="opt.key" :value="opt.key">
                                {{ opt.label }}
                            </option>
                        </optgroup>
                    </select>

                    <select
                        class="fb-input fb-focus fb-rule-op"
                        :value="rule.op"
                        @change="onOperatorChange(index, $event.target.value)"
                    >
                        <option v-for="op in operatorsFor(index)" :key="op" :value="op">
                            {{ operatorLabel(op, uiLocale) }}
                        </option>
                    </select>

                    <!-- Value input typed by target -->
                    <template v-if="inputKindFor(index) === 'none'"></template>

                    <select
                        v-else-if="inputKindFor(index) === 'choice'"
                        class="fb-input fb-focus fb-rule-value"
                        :value="rule.value"
                        @change="updateRule(index, { value: $event.target.value })"
                    >
                        <option v-for="choice in targetChoices(rule.field)" :key="String(choice.value)" :value="choice.value">
                            {{ choice.label }}
                        </option>
                    </select>

                    <select
                        v-else-if="inputKindFor(index) === 'enum'"
                        class="fb-input fb-focus fb-rule-value"
                        :value="rule.value"
                        @change="updateRule(index, { value: $event.target.value })"
                    >
                        <option v-for="opt in variableEnumOptions(rule.field)" :key="String(opt.value)" :value="opt.value">
                            {{ opt.label }}
                        </option>
                    </select>

                    <div v-else-if="inputKindFor(index) === 'choice-multi'" class="fb-rule-chips">
                        <button
                            v-for="choice in targetChoices(rule.field)"
                            :key="String(choice.value)"
                            type="button"
                            class="fb-chip"
                            :class="{ 'fb-chip--active': multiSelected(index).includes(choice.value) }"
                            @click="toggleMulti(index, choice.value)"
                        >{{ choice.label }}</button>
                    </div>

                    <div v-else-if="inputKindFor(index) === 'boolean'" class="fb-segment-inline fb-rule-value">
                        <button
                            type="button"
                            class="fb-seg-btn"
                            :class="{ 'fb-seg-btn--active': rule.value === true }"
                            @click="updateRule(index, { value: true })"
                        >{{ t('logicTrue') }}</button>
                        <button
                            type="button"
                            class="fb-seg-btn"
                            :class="{ 'fb-seg-btn--active': rule.value === false }"
                            @click="updateRule(index, { value: false })"
                        >{{ t('logicFalse') }}</button>
                    </div>

                    <input
                        v-else-if="inputKindFor(index) === 'number'"
                        type="number"
                        class="fb-input fb-focus fb-rule-value"
                        :value="numberValue(index)"
                        :placeholder="t('logicValuePlaceholder')"
                        @input="onNumberInput(index, $event.target.value)"
                    />

                    <input
                        v-else-if="inputKindFor(index) === 'date'"
                        type="date"
                        class="fb-input fb-focus fb-rule-value"
                        :value="rule.value"
                        @input="updateRule(index, { value: $event.target.value })"
                    />

                    <input
                        v-else
                        type="text"
                        class="fb-input fb-focus fb-rule-value"
                        :value="rule.value"
                        :placeholder="t('logicValuePlaceholder')"
                        @input="updateRule(index, { value: $event.target.value })"
                    />

                    <button
                        type="button"
                        class="fb-rule-remove fb-focus"
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

                <p v-if="rules.length === 0" class="fb-hint">{{ t('logicNoRules') }}</p>

                <div class="fb-logic-actions">
                    <button type="button" class="fb-logic-add fb-focus" @click="addRule">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        <span>{{ t('logicAddRule') }}</span>
                    </button>
                    <button type="button" class="fb-logic-link fb-focus" @click="enterTextMode">
                        {{ t('logicEditAsText') }}
                    </button>
                </div>
            </template>
        </template>

        <div v-if="preview" class="fb-logic-preview">
            <span class="fb-logic-preview-label">{{ t('logicPreview') }}</span>
            <code class="fb-logic-preview-code" dir="ltr">{{ previewProp }} = {{ preview }}</code>
        </div>
    </div>
</template>

<style scoped>
.fb-logic {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
}

.fb-logic-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
}

.fb-logic-when {
    font-size: 0.8125rem;
    color: var(--fb-text);
}

.fb-segment-inline {
    display: inline-flex;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    overflow: hidden;
    flex: 0 0 auto;
}

.fb-segment-inline--match {
    align-self: flex-start;
}

.fb-seg-btn {
    border: none;
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.3125rem 0.625rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

.fb-seg-btn--active {
    background: var(--fb-brand);
    color: #fff;
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
    margin-block: -0.125rem;
    transition: border-color 0.15s, background-color 0.15s;
}

.fb-rule-connector:hover {
    border-color: var(--fb-brand);
    background: var(--fb-brand-50);
}

.fb-rule {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
    background: var(--fb-canvas);
    border: 1px solid var(--fb-border);
    border-radius: 0.5rem;
    padding: 0.4375rem;
}

.fb-input {
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.375rem 0.5rem;
    font-size: 0.8125rem;
    color: var(--fb-text);
    background: var(--fb-surface);
    font-family: inherit;
}

.fb-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
}

.fb-rule-field {
    flex: 1 1 8rem;
    min-width: 0;
}

.fb-rule-op {
    flex: 1 1 6rem;
    min-width: 0;
}

.fb-rule-value {
    flex: 1 1 6rem;
    min-width: 0;
}

.fb-rule-chips {
    flex: 1 1 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
}

.fb-chip {
    border: 1px solid var(--fb-border-strong);
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    font-size: 0.75rem;
    padding: 0.1875rem 0.5rem;
    border-radius: 9999px;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.fb-chip--active {
    background: var(--fb-brand);
    color: #fff;
    border-color: var(--fb-brand);
}

.fb-rule-remove {
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

.fb-rule-remove:hover {
    background: #fef2f2;
    color: #dc2626;
}

.fb-rule-remove svg {
    width: 0.875rem;
    height: 0.875rem;
}

.fb-logic-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
}

.fb-logic-add {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
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

.fb-logic-add:hover {
    border-color: var(--fb-brand);
    color: var(--fb-brand-600);
}

.fb-logic-add svg {
    width: 0.875rem;
    height: 0.875rem;
}

.fb-logic-link {
    border: none;
    background: transparent;
    color: var(--fb-brand-600);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0.25rem;
    text-decoration: underline;
    text-underline-offset: 2px;
}

.fb-logic-advnote {
    font-size: 0.75rem;
    color: var(--fb-text-muted);
    margin: 0;
}

.fb-logic-textarea {
    width: 100%;
    resize: vertical;
    min-height: 3rem;
}

.fb-logic-preview {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: #0f172a;
    border-radius: 0.5rem;
    padding: 0.5rem 0.625rem;
}

.fb-logic-preview-label {
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #94a3b8;
}

.fb-logic-preview-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
    color: #e2e8f0;
    word-break: break-all;
    white-space: pre-wrap;
}

.fb-hint {
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    margin: 0;
    line-height: 1.4;
}
</style>
