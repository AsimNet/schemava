import { describe, it, expect } from 'vitest';
import {
    fromSurveyJson,
    toSurveyJson,
} from '../../../resources/js/form-builder/model/serialize.js';

/**
 * A chunky legacy survey exercising the passthrough machinery:
 *  - survey-level title/description as {default, en}
 *  - survey-level triggers + theme + showQuestionNumbers + calculatedValues
 *  - already-present Arabic survey texts (must NOT be re-defaulted)
 *  - a paneldynamic with nested templateElements
 *  - a matrix with rows/columns
 *  - known fields with string + bilingual choices
 *  - a non-canonical visibleIf (function call) preserved as advanced
 *  - file/signature elements (the only fields that get mutated)
 */
const LEGACY_SURVEY = {
    title: { default: 'استبيان شامل', en: 'Comprehensive Survey' },
    description: { default: 'وصف كامل', en: 'Full description' },
    logoPosition: 'right',
    showQuestionNumbers: 'off',
    showProgressBar: 'top',
    completeText: 'إنهاء',
    pageNextText: 'متابعة',
    calculatedValues: [
        { name: 'full_name', expression: '', includeIntoResult: true },
        { name: 'custom_total', expression: '{q_num} * 2' },
    ],
    triggers: [
        { type: 'complete', expression: "({q_choice} = 'no')" },
        { type: 'setvalue', expression: '{q_num} > 5', setToName: 'q_flag', setValue: 'high' },
    ],
    pages: [
        {
            name: 'page1',
            title: { default: 'الصفحة الأولى', en: 'First page' },
            elements: [
                {
                    type: 'radiogroup',
                    name: 'q_choice',
                    title: { default: 'اختر', en: 'Choose' },
                    choices: ['نعم', 'لا', { value: 'maybe', text: { default: 'ربما', en: 'Maybe' } }],
                    isRequired: true,
                },
                {
                    type: 'text',
                    name: 'q_num',
                    title: 'رقم',
                    inputType: 'number',
                    visibleIf: 'age({dob}) > 18',
                },
                {
                    type: 'matrix',
                    name: 'q_matrix',
                    title: { default: 'مصفوفة', en: 'Matrix' },
                    columns: [
                        { value: 1, text: 'سيئ' },
                        { value: 2, text: 'جيد' },
                    ],
                    rows: [
                        { value: 'a', text: 'الجودة' },
                        { value: 'b', text: 'السعر' },
                    ],
                },
            ],
        },
        {
            name: 'page2',
            elements: [
                {
                    type: 'paneldynamic',
                    name: 'q_panel',
                    title: 'لوحة ديناميكية',
                    templateElements: [
                        { type: 'text', name: 'member_name', title: 'الاسم', inputType: 'text' },
                        {
                            type: 'dropdown',
                            name: 'member_role',
                            title: { default: 'الدور', en: 'Role' },
                            choices: ['أب', 'أم', 'ابن'],
                        },
                    ],
                    panelCount: 1,
                    minPanelCount: 1,
                },
                {
                    type: 'file',
                    name: 'q_file',
                    title: 'ارفع ملف',
                    allowMultiple: true,
                    storeDataAsText: true,
                },
                {
                    type: 'signaturepad',
                    name: 'q_sign',
                    title: 'وقّع',
                },
                {
                    type: 'expression',
                    name: 'q_expr',
                    title: 'القيمة المحسوبة',
                    expression: '{q_num} + 10',
                },
            ],
        },
    ],
};

describe('serialize — chunky legacy fixture (lossless modulo the 3 mutations)', () => {
    it('round-trips deep-equal except file/signature forcing, applied defaults & injected calc values', () => {
        const runtimeContextKeys = ['full_name', 'id', 'membership.package.slug'];
        const out = toSurveyJson(fromSurveyJson(LEGACY_SURVEY), { runtimeContextKeys });

        // Build the expected output = original + exactly the three allowed mutations.
        const expected = structuredClone(LEGACY_SURVEY);

        // (a) file/signature forcing.
        const page2 = expected.pages[1].elements;
        const file = page2.find((element) => element.name === 'q_file');
        file.storeDataAsText = false;
        file.waitForUpload = true;
        const sign = page2.find((element) => element.name === 'q_sign');
        sign.storeDataAsText = false;
        sign.waitForUpload = true;

        // (b) Arabic survey-text defaults for those NOT already present.
        // completeText ('إنهاء') and pageNextText ('متابعة') were present -> kept.
        expected.pagePrevText = 'السابق';
        expected.completedHtml = 'شكراً لك على إكمال الاستبيان.';
        expected.completedBeforeHtml = 'لقد قمت بإكمال هذا الاستبيان مسبقاً.';
        expected.loadingHtml = 'جارٍ تحميل الاستبيان...';

        // (c) injected runtime calculatedValues (existing kept, no duplicates).
        expected.calculatedValues = [
            { name: 'full_name', expression: '', includeIntoResult: true },
            { name: 'custom_total', expression: '{q_num} * 2' },
            { name: 'id', expression: '' },
            { name: 'membership.package.slug', expression: '' },
        ];

        expect(out).toEqual(expected);
    });

    it('preserves nested paneldynamic templateElements verbatim', () => {
        const out = toSurveyJson(fromSurveyJson(LEGACY_SURVEY), { runtimeContextKeys: [] });
        const panel = out.pages[1].elements.find((element) => element.name === 'q_panel');
        expect(panel.templateElements).toEqual(LEGACY_SURVEY.pages[1].elements[0].templateElements);
    });

    it('preserves triggers verbatim', () => {
        const out = toSurveyJson(fromSurveyJson(LEGACY_SURVEY), { runtimeContextKeys: [] });
        expect(out.triggers).toEqual(LEGACY_SURVEY.triggers);
    });

    it('keeps the non-canonical visibleIf untouched', () => {
        const out = toSurveyJson(fromSurveyJson(LEGACY_SURVEY), { runtimeContextKeys: [] });
        const qNum = out.pages[0].elements.find((element) => element.name === 'q_num');
        expect(qNum.visibleIf).toBe('age({dob}) > 18');
    });

    it('does not re-default survey texts that were already present', () => {
        const out = toSurveyJson(fromSurveyJson(LEGACY_SURVEY), { runtimeContextKeys: [] });
        expect(out.completeText).toBe('إنهاء');
        expect(out.pageNextText).toBe('متابعة');
    });
});
