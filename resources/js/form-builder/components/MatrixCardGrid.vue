<script setup>
import { computed, nextTick, ref } from 'vue';
import { store, updateTypeProp } from '../store.js';
import { t } from '../i18n.js';
import { makeChoice, makeMatrixColumn, renameChoiceLabel, MATRIX_CHOICE_CELL_TYPES } from '../ui-helpers.js';

/**
 * Interactive matrix grid rendered ON the canvas card — the same canvas-first
 * standard as repeating panels: rows and columns are edited in place (add,
 * rename, remove), while deeper column config (cell types, per-column choices)
 * stays in the settings drawer. Works for the whole family:
 *
 *  - matrix          rows × columns are plain choice items; cells preview radios
 *  - matrixdropdown  rows are choice items; columns are cell definitions
 *  - matrixdynamic   columns are cell definitions; rows are respondent-added,
 *                    so the grid previews `rowCount` ghost rows + the add-row
 *                    affordance respondents will see
 *
 * All writes go through updateTypeProp — nested-aware, so a matrix inside a
 * repeating panel is just as editable.
 */
const props = defineProps({
    field: { type: Object, required: true },
});

const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');

const isMatrix = computed(() => props.field.type === 'matrix');
const isMatrixDynamic = computed(() => props.field.type === 'matrixdynamic');

/** matrix/matrixdropdown author fixed rows; matrixdynamic rows are fill-time. */
const hasFixedRows = computed(() => !isMatrixDynamic.value);

/** matrix columns are choice items; matrixdropdown/matrixdynamic columns are cell defs. */
const hasCellColumns = computed(() => !isMatrix.value);

const rows = computed(() => props.field.typeProps?.rows ?? []);
const columns = computed(() => props.field.typeProps?.columns ?? []);

const rowCount = computed(() => {
    const n = Number(props.field.typeProps?.rowCount);

    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2;
});

/** Ghost rows previewed for matrixdynamic (respondent-added at fill time). */
const ghostRows = computed(() => Math.min(rowCount.value, 3));

function setRows(next) {
    updateTypeProp(props.field.name, 'rows', next);
}

function setColumns(next) {
    updateTypeProp(props.field.name, 'columns', next);
}

/* ----------------------------------------------------- localized cell text */

function itemText(item) {
    const lstr = item?.label ?? item?.title ?? { ar: '', en: null };

    return (contentLocale.value === 'en' ? lstr.en : lstr.ar) ?? '';
}

/* ------------------------------------------------------------------- rows */

const rowInputs = ref([]);

function setRowInputRef(el, index) {
    if (el) {
        rowInputs.value[index] = el;
    }
}

function onRowInput(index, value) {
    const next = [...rows.value];
    next[index] = renameChoiceLabel(next[index], contentLocale.value, value);
    setRows(next);
}

function removeRow(index) {
    setRows(rows.value.filter((_, i) => i !== index));
}

function addRow() {
    const next = [...rows.value, makeChoice('')];
    setRows(next);
    nextTick(() => rowInputs.value[next.length - 1]?.focus());
}

/** Enter on the last row spawns the next one (same affordance as choices). */
function onRowKeydown(index, event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        if (index === rows.value.length - 1) {
            addRow();
        } else {
            rowInputs.value[index + 1]?.focus();
        }
    } else if (event.key === 'Escape') {
        event.preventDefault();
        event.target.blur();
    }
}

/* ---------------------------------------------------------------- columns */

const columnInputs = ref([]);

function setColumnInputRef(el, index) {
    if (el) {
        columnInputs.value[index] = el;
    }
}

function onColumnInput(index, value) {
    const next = [...columns.value];
    if (hasCellColumns.value) {
        const column = { ...next[index] };
        const lstr = { ...(column.title ?? { ar: '', en: null }) };
        if (contentLocale.value === 'en') {
            lstr.en = value === '' ? null : value;
        } else {
            lstr.ar = value;
        }
        column.title = lstr;
        next[index] = column;
    } else {
        next[index] = renameChoiceLabel(next[index], contentLocale.value, value);
    }
    setColumns(next);
}

function removeColumn(index) {
    setColumns(columns.value.filter((_, i) => i !== index));
}

function addColumn() {
    const next = hasCellColumns.value
        ? [...columns.value, makeMatrixColumn('', columns.value.map((c) => c.name))]
        : [...columns.value, makeChoice('')];
    setColumns(next);
    nextTick(() => columnInputs.value[next.length - 1]?.focus());
}

function onColumnKeydown(index, event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        if (index === columns.value.length - 1) {
            addColumn();
        } else {
            columnInputs.value[index + 1]?.focus();
        }
    } else if (event.key === 'Escape') {
        event.preventDefault();
        event.target.blur();
    }
}

/* ------------------------------------------------------------ cell glyphs */

/** The mock control drawn in a body cell for a given column. */
function cellGlyph(column) {
    if (!hasCellColumns.value) {
        return 'radio';
    }
    const cellType = column?.cellType ?? 'text';
    if (cellType === 'radiogroup') {
        return 'radio';
    }
    if (cellType === 'checkbox') {
        return 'checkbox';
    }
    if (cellType === 'dropdown') {
        return 'dropdown';
    }
    if (cellType === 'boolean') {
        return 'toggle';
    }
    if (cellType === 'rating') {
        return 'star';
    }

    return 'text';
}

/** Column has drawer-only config worth signalling (choice list on a cell). */
function columnHasChoices(column) {
    return hasCellColumns.value && MATRIX_CHOICE_CELL_TYPES.includes(column?.cellType ?? '');
}
</script>

<template>
    <div class="fb-mgrid-wrap" @click.stop>
        <div class="fb-mgrid-scroll fb-scroll">
            <div class="fb-mgrid" role="grid">
                <!-- header: corner + editable column titles + add-column -->
                <div class="fb-mgrid-row fb-mgrid-row--head">
                    <span class="fb-mgrid-corner" aria-hidden="true"></span>
                    <div v-for="(column, index) in columns" :key="column._uid ?? index" class="fb-mgrid-head">
                        <input
                            :ref="(el) => setColumnInputRef(el, index)"
                            :value="itemText(column)"
                            type="text"
                            size="1"
                            dir="auto"
                            class="fb-mgrid-input fb-mgrid-input--head fb-focus"
                            :placeholder="t('matrixColumnTitlePlaceholder')"
                            :aria-label="t('matrixColumnsLabel')"
                            :title="columnHasChoices(column) ? t('matrixColumnChoicesHint') : undefined"
                            @input="onColumnInput(index, $event.target.value)"
                            @keydown="onColumnKeydown(index, $event)"
                        />
                        <button
                            type="button"
                            class="fb-mgrid-remove fb-focus"
                            :title="t('matrixRemoveColumn')"
                            :aria-label="t('matrixRemoveColumn')"
                            @click="removeColumn(index)"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <button
                        type="button"
                        class="fb-mgrid-add fb-focus"
                        :title="t('matrixAddColumn')"
                        :aria-label="t('matrixAddColumn')"
                        @click="addColumn"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                    </button>
                </div>

                <!-- fixed rows (matrix / matrixdropdown): editable label + mock cells -->
                <template v-if="hasFixedRows">
                    <div v-for="(row, rIndex) in rows" :key="row._uid ?? rIndex" class="fb-mgrid-row">
                        <div class="fb-mgrid-rowhead">
                            <input
                                :ref="(el) => setRowInputRef(el, rIndex)"
                                :value="itemText(row)"
                                type="text"
                                size="1"
                                dir="auto"
                                class="fb-mgrid-input fb-focus"
                                :placeholder="t('matrixRowTitlePlaceholder')"
                                :aria-label="t('matrixRowsLabel')"
                                @input="onRowInput(rIndex, $event.target.value)"
                                @keydown="onRowKeydown(rIndex, $event)"
                            />
                            <button
                                type="button"
                                class="fb-mgrid-remove fb-focus"
                                :title="t('matrixRemoveRow')"
                                :aria-label="t('matrixRemoveRow')"
                                @click="removeRow(rIndex)"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <span
                            v-for="(column, cIndex) in columns"
                            :key="column._uid ?? cIndex"
                            class="fb-mgrid-cell"
                            aria-hidden="true"
                        >
                            <span class="fb-mgrid-glyph" :class="`fb-mgrid-glyph--${cellGlyph(column)}`"></span>
                        </span>
                        <span class="fb-mgrid-spacer" aria-hidden="true"></span>
                    </div>
                </template>

                <!-- ghost rows (matrixdynamic): what respondents will add -->
                <template v-else>
                    <div v-for="g in ghostRows" :key="`ghost_${g}`" class="fb-mgrid-row fb-mgrid-row--ghost">
                        <span class="fb-mgrid-rowhead fb-mgrid-rowhead--ghost">{{ g }}</span>
                        <span
                            v-for="(column, cIndex) in columns"
                            :key="column._uid ?? cIndex"
                            class="fb-mgrid-cell"
                            aria-hidden="true"
                        >
                            <span class="fb-mgrid-glyph" :class="`fb-mgrid-glyph--${cellGlyph(column)}`"></span>
                        </span>
                        <span class="fb-mgrid-spacer" aria-hidden="true"></span>
                    </div>
                </template>
            </div>
        </div>

        <div class="fb-mgrid-foot">
            <button v-if="hasFixedRows" type="button" class="fb-mgrid-addrow fb-focus" @click="addRow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>{{ t('matrixAddRow') }}</span>
            </button>
            <span v-else class="fb-mgrid-dynamic-hint" :title="t('matrixRowCountHint')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span>{{ t('matrixDynamicRowsBadge') }}</span>
                <span class="fb-mgrid-dynamic-count">×{{ rowCount }}</span>
            </span>
        </div>
    </div>
</template>

<style scoped>
.fb-mgrid-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    cursor: default;
}

.fb-mgrid-scroll {
    overflow-x: auto;
    padding-bottom: 0.125rem;
}

.fb-mgrid {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    /* Rows shrink members down to their min-widths; past that the row overflows
       into .fb-mgrid-scroll's horizontal scrollbar (many-column grids). */
}

.fb-mgrid-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.fb-mgrid-corner,
.fb-mgrid-rowhead {
    flex: 0 0 9.5rem;
    display: flex;
    align-items: center;
    gap: 0.125rem;
    min-width: 0;
}

.fb-mgrid-head {
    flex: 1 1 5.5rem;
    min-width: 5.5rem;
    display: flex;
    align-items: center;
    gap: 0.125rem;
}

.fb-mgrid-cell {
    flex: 1 1 5.5rem;
    min-width: 5.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.3125rem 0;
    border-radius: 0.375rem;
    background: var(--fb-canvas);
}

.fb-mgrid-row--ghost .fb-mgrid-cell {
    opacity: 0.55;
}

.fb-mgrid-rowhead--ghost {
    justify-content: flex-end;
    padding-inline-end: 0.5rem;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--fb-text-muted);
    opacity: 0.7;
}

/* trailing spacer keeps body rows aligned under the add-column button */
.fb-mgrid-spacer {
    flex: 0 0 1.5rem;
}

.fb-mgrid-input {
    /* flex-basis 0 keeps the input's intrinsic width (~20ch) out of the grid's
       min-content, so 2–4 column grids fit the card without a scrollbar. */
    flex: 1 1 0;
    min-width: 0;
    border: 1px solid transparent;
    background: transparent;
    font-size: 0.8125rem;
    color: var(--fb-text);
    padding: 0.25rem 0.375rem;
    border-radius: 0.375rem;
    font-family: inherit;
    transition: border-color 0.15s, background-color 0.15s;
}

.fb-mgrid-input--head {
    font-weight: 600;
    text-align: center;
}

.fb-mgrid-input:hover {
    border-color: var(--fb-border);
}

.fb-mgrid-input:focus {
    border-color: var(--fb-border-strong);
    background: var(--fb-surface);
}

.fb-mgrid-input::placeholder {
    color: #b6bac2;
    font-weight: 400;
}

/* row/column removers appear on hover of their head cell */
.fb-mgrid-remove {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.125rem;
    height: 1.125rem;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    border-radius: 0.3125rem;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background-color 0.15s, color 0.15s;
}

.fb-mgrid-head:hover .fb-mgrid-remove,
.fb-mgrid-rowhead:hover .fb-mgrid-remove,
.fb-mgrid-remove:focus-visible {
    opacity: 1;
}

.fb-mgrid-remove:hover {
    background: #fef2f2;
    color: #dc2626;
}

.fb-mgrid-remove svg {
    width: 0.625rem;
    height: 0.625rem;
}

.fb-mgrid-add {
    flex: 0 0 1.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: 1px dashed var(--fb-border-strong);
    background: transparent;
    color: var(--fb-text-muted);
    border-radius: 0.4375rem;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
}

.fb-mgrid-add:hover {
    border-color: var(--fb-brand);
    color: var(--fb-brand-600);
}

.fb-mgrid-add svg {
    width: 0.75rem;
    height: 0.75rem;
}

.fb-mgrid-foot {
    display: flex;
    align-items: center;
}

.fb-mgrid-addrow {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
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

.fb-mgrid-addrow:hover {
    color: var(--fb-brand-600);
    background: var(--fb-brand-50);
}

.fb-mgrid-addrow svg {
    width: 0.75rem;
    height: 0.75rem;
}

/* matrixdynamic: preview of the respondent's add-row affordance */
.fb-mgrid-dynamic-hint {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.71875rem;
    font-weight: 600;
    color: var(--fb-text-muted);
    border: 1px dashed var(--fb-border-strong);
    border-radius: 999px;
    padding: 0.25rem 0.625rem;
}

.fb-mgrid-dynamic-hint svg {
    width: 0.6875rem;
    height: 0.6875rem;
}

.fb-mgrid-dynamic-count {
    color: var(--fb-brand-600);
    font-weight: 700;
}

/* ------------------------------------------------------------ cell glyphs */

.fb-mgrid-glyph {
    display: inline-block;
}

.fb-mgrid-glyph--radio {
    width: 0.875rem;
    height: 0.875rem;
    border: 1.5px solid var(--fb-border-strong);
    border-radius: 999px;
}

.fb-mgrid-glyph--checkbox {
    width: 0.875rem;
    height: 0.875rem;
    border: 1.5px solid var(--fb-border-strong);
    border-radius: 0.25rem;
}

.fb-mgrid-glyph--dropdown {
    width: 2.25rem;
    height: 0.875rem;
    border: 1.5px solid var(--fb-border-strong);
    border-radius: 0.3125rem;
    position: relative;
}

.fb-mgrid-glyph--dropdown::after {
    content: '';
    position: absolute;
    inset-inline-end: 0.25rem;
    top: 50%;
    transform: translateY(-70%) rotate(45deg);
    width: 0.28125rem;
    height: 0.28125rem;
    border-inline-end: 1.5px solid var(--fb-border-strong);
    border-bottom: 1.5px solid var(--fb-border-strong);
}

.fb-mgrid-glyph--text {
    width: 2.25rem;
    height: 0;
    border-bottom: 1.5px solid var(--fb-border-strong);
}

.fb-mgrid-glyph--toggle {
    width: 1.5rem;
    height: 0.875rem;
    border: 1.5px solid var(--fb-border-strong);
    border-radius: 999px;
    position: relative;
}

.fb-mgrid-glyph--toggle::after {
    content: '';
    position: absolute;
    inset-inline-start: 0.09375rem;
    top: 50%;
    transform: translateY(-50%);
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: var(--fb-border-strong);
}

.fb-mgrid-glyph--star {
    width: 0.9375rem;
    height: 0.9375rem;
    background: var(--fb-border-strong);
    clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
}
</style>
