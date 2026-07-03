<script setup>
import { computed } from 'vue';
import { t } from '../i18n.js';
import { store, updateTypeProp } from '../store.js';
import { makeMatrixColumn, MATRIX_CELL_TYPES, MATRIX_CHOICE_CELL_TYPES } from '../ui-helpers.js';
import ChoicesEditor from './ChoicesEditor.vue';

const props = defineProps({
    field: { type: Object, required: true },
});

const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');

const isMatrix = computed(() => props.field.type === 'matrix');
const isMatrixDropdown = computed(() => props.field.type === 'matrixdropdown');
const isMatrixDynamic = computed(() => props.field.type === 'matrixdynamic');

/** matrix/matrixdropdown have an authored row list; matrixdynamic rows are generated at fill time. */
const hasFixedRows = computed(() => isMatrix.value || isMatrixDropdown.value);

const rows = computed(() => props.field.typeProps?.rows ?? []);
const columns = computed(() => props.field.typeProps?.columns ?? []);

function setRows(next) {
    updateTypeProp(props.field.name, 'rows', next);
}

function setColumns(next) {
    updateTypeProp(props.field.name, 'columns', next);
}

const rowCountValue = computed({
    get: () => props.field.typeProps?.rowCount ?? 2,
    set(value) {
        const n = Math.floor(Number(value));
        updateTypeProp(props.field.name, 'rowCount', Number.isFinite(n) && n > 0 ? n : 1);
    },
});

/* --------------------------------- cell-definition columns (dropdown/dynamic) */

function columnTitle(column) {
    const lstr = column.title ?? { ar: '', en: null };

    return (contentLocale.value === 'en' ? lstr.en : lstr.ar) ?? '';
}

function setColumnTitle(index, value) {
    const next = [...columns.value];
    const column = { ...next[index] };
    const lstr = { ...(column.title ?? { ar: '', en: null }) };
    if (contentLocale.value === 'en') {
        lstr.en = value === '' ? null : value;
    } else {
        lstr.ar = value;
    }
    column.title = lstr;
    next[index] = column;
    setColumns(next);
}

function setColumnCellType(index, value) {
    const next = [...columns.value];
    const column = { ...next[index], cellType: value };
    if (!MATRIX_CHOICE_CELL_TYPES.includes(value)) {
        column.choices = null;
    } else if (!Array.isArray(column.choices)) {
        column.choices = [];
    }
    next[index] = column;
    setColumns(next);
}

function setColumnChoices(index, choicesNext) {
    const next = [...columns.value];
    next[index] = { ...next[index], choices: choicesNext };
    setColumns(next);
}

function removeColumn(index) {
    setColumns(columns.value.filter((_, i) => i !== index));
}

function addColumn() {
    const existingNames = columns.value.map((column) => column.name);
    setColumns([...columns.value, makeMatrixColumn('', existingNames)]);
}

function cellTypeLabel(cellType) {
    return t(`matrixCellType_${cellType}`);
}
</script>

<template>
    <div class="fb-matrix">
        <ChoicesEditor
            v-if="hasFixedRows"
            :items="rows"
            :on-update="setRows"
            :label="t('matrixRowsLabel')"
        />

        <label v-if="isMatrixDynamic" class="fb-field">
            <span class="fb-field-label">{{ t('matrixRowCount') }}</span>
            <input v-model.number="rowCountValue" type="number" min="1" class="fb-input fb-focus" />
            <span class="fb-hint">{{ t('matrixRowCountHint') }}</span>
        </label>

        <ChoicesEditor
            v-if="isMatrix"
            :items="columns"
            :on-update="setColumns"
            :label="t('matrixColumnsLabel')"
        />

        <div v-else class="fb-matrix-columns">
            <span class="fb-field-label">{{ t('matrixColumnsLabel') }}</span>

            <div v-for="(column, index) in columns" :key="column._uid" class="fb-matrix-column">
                <div class="fb-row">
                    <input
                        type="text"
                        class="fb-input fb-focus"
                        :value="columnTitle(column)"
                        :placeholder="t('matrixColumnTitlePlaceholder')"
                        @input="setColumnTitle(index, $event.target.value)"
                    />
                    <select
                        class="fb-input fb-focus fb-matrix-celltype"
                        :value="column.cellType ?? 'text'"
                        @change="setColumnCellType(index, $event.target.value)"
                    >
                        <option v-for="ct in MATRIX_CELL_TYPES" :key="ct" :value="ct">{{ cellTypeLabel(ct) }}</option>
                    </select>
                    <button
                        type="button"
                        class="fb-matrix-column-remove fb-focus"
                        :title="t('removeChoice')"
                        :aria-label="t('removeChoice')"
                        @click="removeColumn(index)"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <ChoicesEditor
                    v-if="MATRIX_CHOICE_CELL_TYPES.includes(column.cellType)"
                    :items="column.choices ?? []"
                    :on-update="(next) => setColumnChoices(index, next)"
                />
            </div>

            <button type="button" class="fb-matrix-add-column fb-focus" @click="addColumn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>{{ t('matrixAddColumn') }}</span>
            </button>
        </div>
    </div>
</template>

<style scoped>
.fb-matrix {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
}

.fb-field {
    display: flex;
    flex-direction: column;
    gap: 0.3125rem;
}

.fb-field-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--fb-text);
}

.fb-input {
    width: 100%;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.4375rem 0.625rem;
    font-size: 0.8125rem;
    color: var(--fb-text);
    background: var(--fb-surface);
    font-family: inherit;
}

.fb-hint {
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    margin: 0;
    line-height: 1.4;
}

.fb-matrix-columns {
    display: flex;
    flex-direction: column;
    gap: 0.4375rem;
}

.fb-matrix-column {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.5rem;
    border: 1px solid var(--fb-border);
    border-radius: 0.5rem;
    background: var(--fb-canvas);
}

.fb-row {
    display: flex;
    gap: 0.375rem;
    align-items: center;
}

.fb-matrix-celltype {
    flex: 0 0 auto;
    width: auto;
}

.fb-matrix-column-remove {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    border-radius: 0.4375rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

.fb-matrix-column-remove:hover {
    background: #fef2f2;
    color: #dc2626;
}

.fb-matrix-column-remove svg {
    width: 0.875rem;
    height: 0.875rem;
}

.fb-matrix-add-column {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
    align-self: flex-start;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.3125rem 0.5rem;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: color 0.15s, background-color 0.15s;
}

.fb-matrix-add-column:hover {
    color: var(--fb-brand-600);
    background: var(--fb-brand-50);
}

.fb-matrix-add-column svg {
    width: 0.875rem;
    height: 0.875rem;
}
</style>
