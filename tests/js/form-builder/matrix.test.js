import { describe, it, expect } from 'vitest';
import {
    fromSurveyJson,
    toSurveyJson,
} from '../../../resources/js/form-builder/model/serialize.js';
import { builderTypeForElement, ADVANCED_TYPE } from '../../../resources/js/form-builder/model/fieldTypes.js';

/** Round-trip a single element through the model with no runtime keys. */
function roundTripElement(element, options = { runtimeContextKeys: [] }) {
    const json = { pages: [{ name: 'p1', elements: [element] }] };

    return toSurveyJson(fromSurveyJson(json), options).pages[0].elements[0];
}

/** Parse a single element into its builder Field. */
function parseElement(element) {
    const state = fromSurveyJson({ pages: [{ name: 'p1', elements: [element] }] });

    return state.pages[0].fields[0];
}

describe('serialize — matrix (single choice per row)', () => {
    const MATRIX_ELEMENT = {
        type: 'matrix',
        name: 'q_matrix',
        title: { default: 'مصفوفة', en: 'Matrix' },
        columns: [
            { value: 1, text: 'سيئ' },
            { value: 2, text: { default: 'جيد', en: 'Good' } },
        ],
        rows: [
            { value: 'a', text: 'الجودة' },
            { value: 'b', text: 'السعر' },
        ],
        isRequired: true,
    };

    it('classifies matrix as a first-class builder type, not advanced passthrough', () => {
        expect(builderTypeForElement(MATRIX_ELEMENT)).toBe('matrix');

        const field = parseElement(MATRIX_ELEMENT);
        expect(field.type).toBe('matrix');
        expect(field.type).not.toBe(ADVANCED_TYPE);
    });

    it('parses rows/columns into typeProps as choice-shaped items', () => {
        const field = parseElement(MATRIX_ELEMENT);

        expect(field.typeProps.rows).toHaveLength(2);
        expect(field.typeProps.rows[0]).toMatchObject({ value: 'a', label: { ar: 'الجودة', en: null } });
        expect(field.typeProps.columns).toHaveLength(2);
        expect(field.typeProps.columns[1]).toMatchObject({ value: 2, label: { ar: 'جيد', en: 'Good' } });
        // Every row/column gets a stable non-serialized _uid for keyed list rendering.
        expect(field.typeProps.rows[0]._uid).toBeTruthy();
    });

    it('round-trips rows/columns losslessly', () => {
        expect(roundTripElement(MATRIX_ELEMENT)).toEqual(MATRIX_ELEMENT);
    });

    it('preserves unknown per-element props in raw alongside rows/columns', () => {
        const withExtra = { ...MATRIX_ELEMENT, alternateRows: true, customProp: 'keep-me' };
        expect(roundTripElement(withExtra)).toEqual(withExtra);
    });
});

describe('serialize — matrixdropdown (multi-column cells)', () => {
    const MATRIXDROPDOWN_ELEMENT = {
        type: 'matrixdropdown',
        name: 'q_grid',
        title: 'شبكة',
        rows: ['صف 1', 'صف 2'],
        columns: [
            { name: 'comment', title: 'ملاحظة', cellType: 'text' },
            {
                name: 'satisfaction',
                title: { default: 'الرضا', en: 'Satisfaction' },
                cellType: 'dropdown',
                choices: ['راضٍ', 'غير راضٍ'],
                isRequired: true,
            },
        ],
    };

    it('classifies matrixdropdown as a first-class builder type', () => {
        expect(builderTypeForElement(MATRIXDROPDOWN_ELEMENT)).toBe('matrixdropdown');
    });

    it('parses cell-definition columns with cellType and nested choices', () => {
        const field = parseElement(MATRIXDROPDOWN_ELEMENT);

        expect(field.typeProps.rows).toHaveLength(2);
        expect(field.typeProps.columns).toHaveLength(2);

        const [commentCol, satisfactionCol] = field.typeProps.columns;
        expect(commentCol).toMatchObject({ name: 'comment', cellType: 'text', choices: null });
        expect(satisfactionCol).toMatchObject({ name: 'satisfaction', cellType: 'dropdown', isRequired: true });
        expect(satisfactionCol.title).toEqual({ ar: 'الرضا', en: 'Satisfaction' });
        expect(satisfactionCol.choices).toHaveLength(2);
        expect(satisfactionCol.choices[0]).toMatchObject({ value: 'راضٍ' });
    });

    it('round-trips rows + cell-definition columns losslessly', () => {
        expect(roundTripElement(MATRIXDROPDOWN_ELEMENT)).toEqual(MATRIXDROPDOWN_ELEMENT);
    });

    it('preserves unknown per-column props in the column raw', () => {
        const withExtraColumnProp = {
            ...MATRIXDROPDOWN_ELEMENT,
            columns: [
                { name: 'comment', title: 'ملاحظة', cellType: 'text', colCount: 2 },
                MATRIXDROPDOWN_ELEMENT.columns[1],
            ],
        };
        expect(roundTripElement(withExtraColumnProp)).toEqual(withExtraColumnProp);
    });
});

describe('serialize — matrixdynamic (repeatable rows)', () => {
    const MATRIXDYNAMIC_ELEMENT = {
        type: 'matrixdynamic',
        name: 'q_family',
        title: 'أفراد الأسرة',
        rowCount: 2,
        columns: [
            { name: 'member_name', title: 'الاسم', cellType: 'text' },
            {
                name: 'relation',
                title: 'صلة القرابة',
                cellType: 'dropdown',
                choices: ['أب', 'أم', 'ابن', 'ابنة'],
            },
        ],
    };

    it('classifies matrixdynamic as a first-class builder type', () => {
        expect(builderTypeForElement(MATRIXDYNAMIC_ELEMENT)).toBe('matrixdynamic');
    });

    it('parses rowCount as a plain prop and columns as cell definitions (no rows)', () => {
        const field = parseElement(MATRIXDYNAMIC_ELEMENT);

        expect(field.typeProps.rowCount).toBe(2);
        expect(field.typeProps.rows).toBeUndefined();
        expect(field.typeProps.columns).toHaveLength(2);
        expect(field.typeProps.columns[1].choices.map((c) => c.value)).toEqual(['أب', 'أم', 'ابن', 'ابنة']);
    });

    it('round-trips rowCount + columns losslessly, recursing into each column', () => {
        expect(roundTripElement(MATRIXDYNAMIC_ELEMENT)).toEqual(MATRIXDYNAMIC_ELEMENT);
    });

    it('supports editing a column (e.g. renaming a choice) and re-emitting correctly', () => {
        const field = parseElement(MATRIXDYNAMIC_ELEMENT);
        field.typeProps.columns[1].choices[0].label = { ar: 'الأب', en: null };
        field.typeProps.columns[1].choices[0].value = 'الأب';

        const out = toSurveyJson({ pages: [{ name: 'p1', fields: [field] }] }, { runtimeContextKeys: [] });
        const emitted = out.pages[0].elements[0];
        expect(emitted.columns[1].choices[0]).toBe('الأب');
    });
});
