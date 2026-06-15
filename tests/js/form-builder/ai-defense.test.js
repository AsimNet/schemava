import { describe, it, expect } from 'vitest';
import { fromSurveyJson, toSurveyJson } from '../../../resources/js/form-builder/model/serialize.js';
import { ADVANCED_TYPE } from '../../../resources/js/form-builder/model/fieldTypes.js';

/**
 * Defense-in-depth: the system prompt steers the AI toward our supported subset,
 * but the real validity guarantee is downstream. If a model IGNORES the type
 * whitelist and returns an unsupported SurveyJS type (here `matrixdynamic`), the
 * serializer must NOT corrupt or silently drop it — it lands in an `advanced`
 * passthrough field and round-trips back out verbatim. Together with the JSON
 * validation + JSON-panel fallback in AiAssistant.vue, this is what actually
 * keeps invalid/unexpected JSON from quietly mangling the saved survey.
 *
 * This mirrors a realistic AI reply: a full survey object mixing supported
 * questions with one unsupported `matrixdynamic` (the thing the prompt forbids).
 */
const AI_SURVEY_WITH_UNSUPPORTED_TYPE = {
    title: 'استبiان من الذكاء الاصطناعي',
    description: 'يحتوي نوعاً غير مدعوم',
    pages: [
        {
            name: 'page1',
            elements: [
                {
                    type: 'text',
                    name: 'q_name',
                    title: 'ما اسمك؟',
                    isRequired: true,
                },
                {
                    // UNSUPPORTED type the whitelist forbids — must survive verbatim.
                    type: 'matrixdynamic',
                    name: 'q_family',
                    title: 'أفراد الأسرة',
                    columns: [
                        { name: 'member_name', title: 'الاسم', cellType: 'text' },
                        {
                            name: 'relation',
                            title: 'صلة القرابة',
                            cellType: 'dropdown',
                            choices: ['أب', 'أم', 'ابن', 'ابنة'],
                        },
                    ],
                    rowCount: 2,
                    minRowCount: 1,
                    addRowText: 'إضافة فرد',
                },
                {
                    type: 'radiogroup',
                    name: 'q_rating',
                    title: 'كيف تقيّم تجربتك؟',
                    choices: ['ممتاز', 'جيد', 'سيئ'],
                },
            ],
        },
    ],
};

describe('AI defense-in-depth — unsupported types cannot corrupt data', () => {
    it('classifies an unsupported AI-emitted type as an advanced passthrough field', () => {
        const state = fromSurveyJson(AI_SURVEY_WITH_UNSUPPORTED_TYPE);
        const fields = state.pages[0].fields;

        const advanced = fields.find((field) => field.name === 'q_family');
        expect(advanced).toBeDefined();
        expect(advanced.type).toBe(ADVANCED_TYPE);
        // The entire unsupported element is held verbatim in `raw`.
        expect(advanced.raw).toEqual(AI_SURVEY_WITH_UNSUPPORTED_TYPE.pages[0].elements[1]);

        // The supported neighbours are still parsed as real builder types.
        expect(fields.find((field) => field.name === 'q_name').type).toBe('short_text');
        expect(fields.find((field) => field.name === 'q_rating').type).toBe('single_choice');
    });

    it('re-emits the unsupported element byte-for-byte on serialize', () => {
        const out = toSurveyJson(fromSurveyJson(AI_SURVEY_WITH_UNSUPPORTED_TYPE), {
            runtimeContextKeys: [],
        });

        const emitted = out.pages[0].elements.find((element) => element.name === 'q_family');
        // No drop, no mutation, no coercion: identical to what the model sent.
        expect(emitted).toEqual(AI_SURVEY_WITH_UNSUPPORTED_TYPE.pages[0].elements[1]);
        // Crucially it is still a matrixdynamic, not silently downgraded.
        expect(emitted.type).toBe('matrixdynamic');
        expect(emitted.columns).toHaveLength(2);
    });

    it('round-trips the whole AI survey losslessly (modulo the documented serializer mutations)', () => {
        const out = toSurveyJson(fromSurveyJson(AI_SURVEY_WITH_UNSUPPORTED_TYPE), {
            runtimeContextKeys: [],
        });

        // The supported questions survive unchanged...
        expect(out.pages[0].elements[0]).toEqual(AI_SURVEY_WITH_UNSUPPORTED_TYPE.pages[0].elements[0]);
        expect(out.pages[0].elements[2]).toEqual(AI_SURVEY_WITH_UNSUPPORTED_TYPE.pages[0].elements[2]);
        // ...and nothing was dropped: same element count, same order.
        expect(out.pages[0].elements.map((element) => element.name)).toEqual([
            'q_name',
            'q_family',
            'q_rating',
        ]);
        // Title/description preserved (Arabic strings pass through verbatim).
        expect(out.title).toBe(AI_SURVEY_WITH_UNSUPPORTED_TYPE.title);
        expect(out.description).toBe(AI_SURVEY_WITH_UNSUPPORTED_TYPE.description);
    });
});
