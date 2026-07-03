import { describe, it, expect } from 'vitest';
import {
    fromSurveyJson,
    toSurveyJson,
    nextFieldName,
} from '../../../resources/js/form-builder/model/serialize.js';
import { FIELD_TYPES } from '../../../resources/js/form-builder/model/fieldTypes.js';

/** Round-trip a survey JSON through the model with no runtime keys. */
function roundTrip(json, options = { runtimeContextKeys: [] }) {
    return toSurveyJson(fromSurveyJson(json), options);
}

/** First (and only) element of the first page after a round-trip. */
function roundTripElement(element, options) {
    const json = { pages: [{ name: 'p1', elements: [element] }] };
    return roundTrip(json, options).pages[0].elements[0];
}

/** Survey-text defaults stripped from a serialized survey for focused asserts. */
function stripDefaults(survey) {
    const copy = { ...survey };
    for (const key of [
        'completeText', 'completedHtml', 'completedBeforeHtml',
        'loadingHtml', 'pagePrevText', 'pageNextText',
    ]) {
        delete copy[key];
    }
    return copy;
}

describe('serialize.nextFieldName', () => {
    it('produces a q_-prefixed name', () => {
        expect(nextFieldName()).toMatch(/^q_[a-z0-9]+$/);
    });

    it('avoids collisions with the provided set', () => {
        const taken = new Set();
        for (let i = 0; i < 50; i += 1) {
            const name = nextFieldName(taken);
            expect(taken.has(name)).toBe(false);
            taken.add(name);
        }
        expect(taken.size).toBe(50);
    });

    it('accepts an array of existing names', () => {
        const name = nextFieldName(['q_1', 'q_2']);
        expect(['q_1', 'q_2']).not.toContain(name);
    });
});

describe('serialize — base round-trip per builder type (ar-only)', () => {
    const samples = {
        short_text: { type: 'text', name: 'q1', title: 'نص', inputType: 'text' },
        number: { type: 'text', name: 'q1', title: 'رقم', inputType: 'number', min: 0, max: 10 },
        date: { type: 'text', name: 'q1', title: 'تاريخ', inputType: 'date' },
        long_text: { type: 'comment', name: 'q1', title: 'تعليق', rows: 6 },
        single_choice: { type: 'radiogroup', name: 'q1', title: 'اختيار', choices: ['أ', 'ب'], showOtherItem: true },
        multi_choice: { type: 'checkbox', name: 'q1', title: 'متعدد', choices: ['أ', 'ب'], showSelectAllItem: true, showOtherItem: false },
        dropdown: { type: 'dropdown', name: 'q1', title: 'منسدلة', choices: ['أ', 'ب'] },
        ranking: { type: 'ranking', name: 'q1', title: 'ترتيب', choices: ['أ', 'ب'], selectToRankEnabled: true },
        tagbox: { type: 'tagbox', name: 'q1', title: 'اختيار', choices: ['أ', 'ب'], showOtherItem: true },
        imagepicker: {
            type: 'imagepicker', name: 'q1', title: 'صور',
            choices: [{ value: 'a', text: 'أ', imageLink: 'https://x/a.png' }],
            multiSelect: true, showLabel: false,
        },
        multipletext: {
            type: 'multipletext', name: 'q1', title: 'حقول',
            items: [
                { name: 'first', title: 'الاسم الأول' },
                { name: 'last', title: 'الاسم الأخير', inputType: 'email' },
            ],
            colCount: 2,
        },
        yes_no: { type: 'boolean', name: 'q1', title: 'نعم/لا' },
        rating: { type: 'rating', name: 'q1', title: 'تقييم', rateMax: 7, rateType: 'smileys' },
        image: { type: 'image', name: 'q1', imageLink: 'https://x/y.png' },
        statement: { type: 'html', name: 'q1', html: '<p>نص</p>' },
        hidden_value: { type: 'text', name: 'q1', visible: false, defaultValueExpression: '{full_name}' },
    };

    for (const [builderType, element] of Object.entries(samples)) {
        it(`round-trips ${builderType} losslessly`, () => {
            expect(roundTripElement(element)).toEqual(element);
        });
    }

    it('round-trips file with forced upload props', () => {
        const out = roundTripElement({ type: 'file', name: 'q1', title: 'ملف', allowMultiple: true, acceptedTypes: '.pdf', maxSize: 1000 });
        expect(out).toEqual({
            type: 'file', name: 'q1', title: 'ملف', allowMultiple: true, acceptedTypes: '.pdf', maxSize: 1000,
            storeDataAsText: false, waitForUpload: true,
        });
    });

    it('round-trips signature with forced upload props', () => {
        expect(roundTripElement({ type: 'signaturepad', name: 'q1', title: 'توقيع' }))
            .toEqual({ type: 'signaturepad', name: 'q1', title: 'توقيع', storeDataAsText: false, waitForUpload: true });
    });

    it('covers every catalog field type', () => {
        const tested = new Set([...Object.keys(samples), 'file', 'signature']);
        expect(tested).toEqual(new Set(Object.keys(FIELD_TYPES)));
    });
});

describe('serialize — bilingual (ar + en) content', () => {
    it('round-trips a localized title as {default, en}', () => {
        const element = { type: 'text', name: 'q1', title: { default: 'الاسم', en: 'Name' }, inputType: 'text' };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('round-trips localized description and placeholder', () => {
        const element = {
            type: 'comment', name: 'q1',
            title: { default: 'سؤال', en: 'Question' },
            description: { default: 'وصف', en: 'Description' },
            placeholder: { default: 'اكتب', en: 'Type' },
            rows: 4,
        };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('round-trips localized yes_no labels', () => {
        const element = {
            type: 'boolean', name: 'q1', title: 'موافق؟',
            labelTrue: { default: 'نعم', en: 'Yes' },
            labelFalse: { default: 'لا', en: 'No' },
        };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('round-trips localized statement html', () => {
        const element = { type: 'html', name: 'q1', html: { default: '<p>مرحبا</p>', en: '<p>Hi</p>' } };
        expect(roundTripElement(element)).toEqual(element);
    });
});

describe('serialize — title omission (no synthesized titles)', () => {
    it('does not emit a title when the source had none', () => {
        const out = roundTripElement({ type: 'text', name: 'q1', inputType: 'text' });
        expect(out).toEqual({ type: 'text', name: 'q1', inputType: 'text' });
        expect(out.title).toBeUndefined();
    });
});

describe('serialize — quiz', () => {
    it('omits score when it equals 1', () => {
        const out = roundTripElement({ type: 'radiogroup', name: 'q1', title: 'س', choices: ['أ', 'ب'], correctAnswer: 'أ', score: 1 });
        expect(out.correctAnswer).toBe('أ');
        expect('score' in out).toBe(false);
    });

    it('keeps a non-default score', () => {
        const out = roundTripElement({ type: 'radiogroup', name: 'q1', title: 'س', choices: ['أ', 'ب'], correctAnswer: 'أ', score: 3 });
        expect(out.score).toBe(3);
    });

    it('defaults missing score to 1 (and therefore omits it)', () => {
        const out = roundTripElement({ type: 'radiogroup', name: 'q1', title: 'س', choices: ['أ', 'ب'], correctAnswer: 'أ' });
        expect(out.correctAnswer).toBe('أ');
        expect('score' in out).toBe(false);
    });

    it('supports array correctAnswer for multi_choice', () => {
        const out = roundTripElement({ type: 'checkbox', name: 'q1', title: 'س', choices: ['أ', 'ب', 'ج'], correctAnswer: ['أ', 'ج'], score: 2 });
        expect(out.correctAnswer).toEqual(['أ', 'ج']);
        expect(out.score).toBe(2);
    });
});

describe('serialize — choices localization', () => {
    it('string item -> plain string item (ar-only, value === text)', () => {
        const out = roundTripElement({ type: 'radiogroup', name: 'q1', title: 'س', choices: ['أحمر', 'أزرق'] });
        expect(out.choices).toEqual(['أحمر', 'أزرق']);
    });

    it('bilingual item -> {value, text:{default, en}}', () => {
        const element = {
            type: 'radiogroup', name: 'q1', title: 'س',
            choices: [{ value: 'r', text: { default: 'أحمر', en: 'Red' } }],
        };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('object item whose value differs from text stays an object', () => {
        const element = { type: 'dropdown', name: 'q1', title: 'س', choices: [{ value: '1', text: 'واحد' }] };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('preserves unknown choice-item props', () => {
        const element = {
            type: 'radiogroup', name: 'q1', title: 'س',
            choices: [{ value: 'a', text: 'أ', imageLink: 'https://x/a.png' }],
        };
        expect(roundTripElement(element)).toEqual(element);
    });
});

describe('serialize — multipletext items', () => {
    it('string item -> plain string item (ar-only, name === title)', () => {
        const out = roundTripElement({ type: 'multipletext', name: 'q1', title: 'س', items: ['first', 'last'] });
        expect(out.items).toEqual(['first', 'last']);
    });

    it('name/title pair round-trips as {name, title}', () => {
        const element = {
            type: 'multipletext', name: 'q1', title: 'س',
            items: [{ name: 'first', title: 'الاسم الأول' }],
        };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('bilingual item title -> {name, title:{default, en}}', () => {
        const element = {
            type: 'multipletext', name: 'q1', title: 'س',
            items: [{ name: 'first', title: { default: 'الاسم الأول', en: 'First name' } }],
        };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('keeps a non-default inputType', () => {
        const element = {
            type: 'multipletext', name: 'q1', title: 'س',
            items: [{ name: 'email', title: 'البريد', inputType: 'email' }],
        };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('preserves unknown item props', () => {
        const element = {
            type: 'multipletext', name: 'q1', title: 'س',
            items: [{ name: 'first', title: 'الاسم', isRequired: true }],
        };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('a name without a title falls back to the name as the label (no title emitted on serialize)', () => {
        const state = fromSurveyJson({
            pages: [{ name: 'p1', elements: [{ type: 'multipletext', name: 'q1', title: 'س', items: ['first'] }] }],
        });
        const item = state.pages[0].fields[0].items[0];
        expect(item.name).toBe('first');
        expect(item.label).toEqual({ ar: 'first', en: null });

        const out = toSurveyJson(state, { runtimeContextKeys: [] }).pages[0].elements[0];
        expect(out.items).toEqual(['first']);
    });

    it('assigns a unique _uid to every parsed item and strips it on output', () => {
        const state = fromSurveyJson({
            pages: [{ name: 'p1', elements: [{ type: 'multipletext', name: 'q1', title: 'س', items: ['a', 'b'] }] }],
        });
        const items = state.pages[0].fields[0].items;
        const uids = items.map((item) => item._uid);
        expect(uids.every((uid) => typeof uid === 'string' && uid !== '')).toBe(true);
        expect(new Set(uids).size).toBe(2);

        const out = toSurveyJson(state, { runtimeContextKeys: [] }).pages[0].elements[0];
        expect(JSON.stringify(out)).not.toContain('_uid');
    });
});

describe('serialize — choice uids (fix 6)', () => {
    it('assigns a unique _uid to every parsed choice (including blanks)', () => {
        const state = fromSurveyJson({
            pages: [{ name: 'p1', elements: [{
                type: 'radiogroup', name: 'q1', title: 'س',
                choices: [{ value: '', text: '' }, { value: '', text: '' }, 'أحمر'],
            }] }],
        });
        const choices = state.pages[0].fields[0].choices;
        expect(choices).toHaveLength(3);
        const uids = choices.map((choice) => choice._uid);
        expect(uids.every((uid) => typeof uid === 'string' && uid !== '')).toBe(true);
        // Two blank choices must still get distinct uids.
        expect(new Set(uids).size).toBe(3);
    });

    it('strips _uid from the serialized output', () => {
        const state = fromSurveyJson({
            pages: [{ name: 'p1', elements: [{
                type: 'dropdown', name: 'q1', title: 'س',
                choices: [{ value: '1', text: 'واحد' }],
            }] }],
        });
        const element = toSurveyJson(state, { runtimeContextKeys: [] }).pages[0].elements[0];
        expect(element.choices).toEqual([{ value: '1', text: 'واحد' }]);
        expect(JSON.stringify(element)).not.toContain('_uid');
    });
});

describe('serialize — logic (visibleIf)', () => {
    it('round-trips a canonical show visibleIf', () => {
        const element = { type: 'text', name: 'q2', title: 'س', inputType: 'text', visibleIf: "({q1} = 'yes')" };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('preserves a non-canonical visibleIf as advanced', () => {
        const element = {
            type: 'text', name: 'q2', title: 'س', inputType: 'text',
            visibleIf: 'age({dob}) > 18',
        };
        expect(roundTripElement(element)).toEqual(element);
    });
});

describe('serialize — advanced passthrough', () => {
    it('keeps unknown element types verbatim', () => {
        const element = {
            type: 'matrix', name: 'm1', title: 'مصفوفة',
            columns: ['a', 'b'], rows: ['x', 'y'], custom: { nested: true },
        };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('keeps unknown props on known element types', () => {
        const element = {
            type: 'text', name: 'q1', title: 'س', inputType: 'text',
            myCustomProp: 'keep-me', anotherOne: [1, 2, 3],
        };
        expect(roundTripElement(element)).toEqual(element);
    });
});

describe('serialize — survey-text defaults', () => {
    it('applies all Arabic defaults when missing', () => {
        const survey = roundTrip({ pages: [{ name: 'p1', elements: [] }] });
        expect(survey.pagePrevText).toBe('السابق');
        expect(survey.pageNextText).toBe('التالي');
        expect(survey.completeText).toBe('أرسل');
        expect(survey.completedHtml).toBe('شكراً لك على إكمال الاستبيان.');
        expect(survey.completedBeforeHtml).toBe('لقد قمت بإكمال هذا الاستبيان مسبقاً.');
        expect(survey.loadingHtml).toBe('جارٍ تحميل الاستبيان...');
    });

    it('does not override an existing survey text', () => {
        const survey = roundTrip({ pages: [{ name: 'p1', elements: [] }], completeText: 'تم' });
        expect(survey.completeText).toBe('تم');
    });

    it('round-trips a bilingual survey text', () => {
        const survey = roundTrip({
            pages: [{ name: 'p1', elements: [] }],
            completeText: { default: 'أرسل الآن', en: 'Submit now' },
        });
        expect(survey.completeText).toEqual({ default: 'أرسل الآن', en: 'Submit now' });
    });
});

describe('serialize — calculatedValues injection', () => {
    const keys = ['id', 'full_name', 'membership.package.slug'];

    it('injects missing runtime keys as name + empty expression', () => {
        const survey = roundTrip({ pages: [{ name: 'p1', elements: [] }] }, { runtimeContextKeys: keys });
        expect(survey.calculatedValues).toEqual([
            { name: 'id', expression: '' },
            { name: 'full_name', expression: '' },
            { name: 'membership.package.slug', expression: '' },
        ]);
    });

    it('leaves existing calculatedValues untouched and avoids duplicates', () => {
        const survey = roundTrip(
            {
                pages: [{ name: 'p1', elements: [] }],
                calculatedValues: [
                    { name: 'id', expression: '{user.id}', includeIntoResult: true },
                    { name: 'custom', expression: '1 + 1' },
                ],
            },
            { runtimeContextKeys: keys },
        );

        expect(survey.calculatedValues).toEqual([
            { name: 'id', expression: '{user.id}', includeIntoResult: true },
            { name: 'custom', expression: '1 + 1' },
            { name: 'full_name', expression: '' },
            { name: 'membership.package.slug', expression: '' },
        ]);
    });

    it('does not add a calculatedValues key when none requested and none present', () => {
        const survey = roundTrip({ pages: [{ name: 'p1', elements: [] }] }, { runtimeContextKeys: [] });
        expect('calculatedValues' in survey).toBe(false);
    });
});

describe('serialize — survey meta + pages', () => {
    it('syncs title/description to top level', () => {
        const survey = roundTrip({
            title: { default: 'استبياني', en: 'My Survey' },
            description: 'وصف',
            pages: [{ name: 'p1', elements: [] }],
        });
        expect(survey.title).toEqual({ default: 'استبياني', en: 'My Survey' });
        expect(survey.description).toBe('وصف');
    });

    it('preserves page titles and raw page props', () => {
        const survey = stripDefaults(roundTrip({
            pages: [{ name: 'p1', title: 'الصفحة', description: 'وصف الصفحة', elements: [] }],
        }));
        expect(survey.pages[0]).toEqual({ name: 'p1', title: 'الصفحة', description: 'وصف الصفحة', elements: [] });
    });

    it('defaults to a single page when none provided', () => {
        const survey = roundTrip({});
        expect(survey.pages).toHaveLength(1);
        expect(survey.pages[0].name).toBe('page1');
        expect(survey.pages[0].elements).toEqual([]);
    });
});

describe('serialize — required / hidden', () => {
    it('round-trips isRequired', () => {
        const out = roundTripElement({ type: 'text', name: 'q1', title: 'س', inputType: 'text', isRequired: true });
        expect(out.isRequired).toBe(true);
    });

    it('hidden_value is visible:false with a default expression', () => {
        const out = roundTripElement({ type: 'text', name: 'h1', visible: false, defaultValueExpression: '{greeting}' });
        expect(out.visible).toBe(false);
        expect(out.defaultValueExpression).toBe('{greeting}');
    });
});

describe('serialize — hidden number/date keep their builder type (fix 4)', () => {
    it('classifies a hidden number element as number (not hidden_value)', () => {
        const state = fromSurveyJson({
            pages: [{ name: 'p1', elements: [{ type: 'text', name: 'n1', title: 'رقم', visible: false, inputType: 'number' }] }],
        });
        const field = state.pages[0].fields[0];
        expect(field.type).toBe('number');
        expect(field.hidden).toBe(true);
        // inputType is a managed type-prop, not raw passthrough.
        expect(field.typeProps.inputType).toBe('number');
        expect('inputType' in field.raw).toBe(false);
    });

    it('classifies a hidden date element as date (not hidden_value)', () => {
        const state = fromSurveyJson({
            pages: [{ name: 'p1', elements: [{ type: 'text', name: 'd1', title: 'تاريخ', visible: false, inputType: 'date' }] }],
        });
        const field = state.pages[0].fields[0];
        expect(field.type).toBe('date');
        expect(field.hidden).toBe(true);
        expect(field.typeProps.inputType).toBe('date');
    });

    it('round-trips a hidden number losslessly including inputType + visible', () => {
        const element = { type: 'text', name: 'n1', title: 'رقم', visible: false, inputType: 'number', min: 0, max: 9 };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('round-trips a hidden date losslessly including inputType + visible', () => {
        const element = { type: 'text', name: 'd1', title: 'تاريخ', visible: false, inputType: 'date' };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('still classifies a plain-text hidden element as hidden_value', () => {
        const state = fromSurveyJson({
            pages: [{ name: 'p1', elements: [{ type: 'text', name: 'h1', visible: false, defaultValueExpression: '{greeting}' }] }],
        });
        expect(state.pages[0].fields[0].type).toBe('hidden_value');
    });

    it('classifies an explicit inputType:text hidden element as hidden_value', () => {
        const state = fromSurveyJson({
            pages: [{ name: 'p1', elements: [{ type: 'text', name: 'h1', visible: false, inputType: 'text' }] }],
        });
        expect(state.pages[0].fields[0].type).toBe('hidden_value');
    });
});

describe('serialize — requiredErrorText (fix 7)', () => {
    it('round-trips an Arabic-only requiredErrorText as a plain string', () => {
        const element = {
            type: 'text', name: 'q1', title: 'س', inputType: 'text',
            isRequired: true, requiredErrorText: 'هذا الحقل مطلوب',
        };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('round-trips a bilingual requiredErrorText as {default, en}', () => {
        const element = {
            type: 'text', name: 'q1', title: 'س', inputType: 'text',
            isRequired: true, requiredErrorText: { default: 'مطلوب', en: 'Required' },
        };
        expect(roundTripElement(element)).toEqual(element);
    });

    it('parses requiredErrorText into the field model (not raw)', () => {
        const state = fromSurveyJson({
            pages: [{ name: 'p1', elements: [{ type: 'text', name: 'q1', title: 'س', inputType: 'text', requiredErrorText: 'مطلوب' }] }],
        });
        const field = state.pages[0].fields[0];
        expect(field.requiredErrorText).toEqual({ ar: 'مطلوب', en: null });
        expect('requiredErrorText' in field.raw).toBe(false);
    });

    it('omits requiredErrorText when unset', () => {
        const out = roundTripElement({ type: 'text', name: 'q1', title: 'س', inputType: 'text' });
        expect('requiredErrorText' in out).toBe(false);
    });

    it('preserves a requiredErrorText with extra locales verbatim via raw', () => {
        const element = {
            type: 'text', name: 'q1', title: 'س', inputType: 'text',
            requiredErrorText: { default: 'مطلوب', fr: 'Requis' },
        };
        expect(roundTripElement(element)).toEqual(element);
    });
});

describe('serialize — statement html binding (fix 4)', () => {
    it('serializes typeProps.html into the element html (multiline survives)', () => {
        // Mirrors how the card/drawer edit the statement: set the html LStr on the
        // field's typeProps; the serializer must emit it as the element `html`.
        const state = fromSurveyJson({ pages: [{ name: 'p1', elements: [{ type: 'html', name: 'q1' }] }] });
        const field = state.pages[0].fields[0];
        field.typeProps = { ...field.typeProps, html: { ar: '<p>سطر 1</p>\n<p>سطر 2</p>', en: null } };

        const out = toSurveyJson(state, { runtimeContextKeys: [] }).pages[0].elements[0];
        expect(out.type).toBe('html');
        expect(out.html).toBe('<p>سطر 1</p>\n<p>سطر 2</p>');
        // The label must NOT leak into a title for an html element edited this way.
        expect(out.title).toBeUndefined();
    });

    it('round-trips a bilingual statement html edited via typeProps', () => {
        const element = { type: 'html', name: 'q1', html: { default: '<p>مرحبا</p>', en: '<p>Hi</p>' } };
        const state = fromSurveyJson({ pages: [{ name: 'p1', elements: [element] }] });
        // Simulate editing the en content on the card.
        const field = state.pages[0].fields[0];
        expect(field.typeProps.html).toEqual({ ar: '<p>مرحبا</p>', en: '<p>Hi</p>' });
    });

    it('preserves inline rich-text tags (bold, link) through a round-trip', () => {
        // The rich editor produces inline markup; the serializer must round-trip it
        // unchanged on the (Arabic-only) html LStr <-> element.html mapping.
        const html = '<p>مرحبا <b>بك</b> في <a href="https://example.com">الموقع</a></p>';
        const element = { type: 'html', name: 'q1', html };

        const state = fromSurveyJson({ pages: [{ name: 'p1', elements: [element] }] });
        const field = state.pages[0].fields[0];
        expect(field.typeProps.html).toEqual({ ar: html, en: null });

        const out = toSurveyJson(state, { runtimeContextKeys: [] }).pages[0].elements[0];
        expect(out.type).toBe('html');
        expect(out.html).toBe(html);
        expect(out.title).toBeUndefined();
    });

    it('round-trips bilingual html carrying inline tags on both locales', () => {
        const html = {
            default: '<h2>عنوان</h2><ul><li>عنصر</li></ul>',
            en: '<h2>Heading</h2><ul><li>Item</li></ul>',
        };
        const element = { type: 'html', name: 'q1', html };

        const state = fromSurveyJson({ pages: [{ name: 'p1', elements: [element] }] });
        const out = toSurveyJson(state, { runtimeContextKeys: [] }).pages[0].elements[0];

        expect(out.html).toEqual(html);
    });
});

describe('serialize — readOnly (SurveyJS readOnly: true)', () => {
    it('parses readOnly:true into field.readOnly and re-emits it', () => {
        const element = { type: 'text', name: 'q1', title: 'س', inputType: 'text', readOnly: true };
        const state = fromSurveyJson({ pages: [{ name: 'p1', elements: [element] }] });
        expect(state.pages[0].fields[0].readOnly).toBe(true);
        expect(roundTripElement(element)).toEqual(element);
    });

    it('omits readOnly when the field is not read-only', () => {
        const element = { type: 'text', name: 'q1', title: 'س', inputType: 'text' };
        const state = fromSurveyJson({ pages: [{ name: 'p1', elements: [element] }] });
        expect(state.pages[0].fields[0].readOnly).toBe(false);
        expect('readOnly' in roundTripElement(element)).toBe(false);
    });

    it('does not double-emit readOnly via raw (managed common prop)', () => {
        const out = roundTripElement({ type: 'radiogroup', name: 'q1', title: 'خ', choices: ['أ', 'ب'], readOnly: true });
        // Exactly one readOnly key, with the right value.
        expect(out.readOnly).toBe(true);
        expect(Object.keys(out).filter((k) => k === 'readOnly')).toHaveLength(1);
    });
});

describe('serialize — disable logic (SurveyJS enableIf)', () => {
    it('a field with enableIf only -> logic.action=disable, re-emits enableIf (no visibleIf)', () => {
        const element = { type: 'text', name: 'q1', title: 'س', inputType: 'text', enableIf: "({g} <> 'MALE')" };
        const state = fromSurveyJson({ pages: [{ name: 'p1', elements: [element] }] });
        const field = state.pages[0].fields[0];
        expect(field.logic).toEqual({
            action: 'disable',
            match: 'all',
            rules: [{ field: 'g', op: '=', value: 'MALE' }],
        });

        const out = toSurveyJson(state, { runtimeContextKeys: [] }).pages[0].elements[0];
        expect(out.enableIf).toBe("({g} <> 'MALE')");
        expect(out.visibleIf).toBeUndefined();
    });

    it('consumes enableIf-only out of raw (not re-emitted twice)', () => {
        const out = roundTripElement({ type: 'text', name: 'q1', title: 'س', inputType: 'text', enableIf: "({g} <> 'MALE')" });
        expect(Object.keys(out).filter((k) => k === 'enableIf')).toHaveLength(1);
    });

    it('a disable-advanced (advanced + target:enable) emits enableIf', () => {
        const element = { type: 'text', name: 'q1', title: 'س', inputType: 'text', enableIf: 'age({dob}) > 18' };
        const state = fromSurveyJson({ pages: [{ name: 'p1', elements: [element] }] });
        const field = state.pages[0].fields[0];
        expect(field.logic).toEqual({ advanced: 'age({dob}) > 18', target: 'enable' });

        const out = toSurveyJson(state, { runtimeContextKeys: [] }).pages[0].elements[0];
        expect(out.enableIf).toBe('age({dob}) > 18');
        expect(out.visibleIf).toBeUndefined();
    });

    it('disable logic round-trips losslessly for a known type', () => {
        const element = { type: 'radiogroup', name: 'q1', title: 'خ', choices: ['أ', 'ب'], enableIf: "({g} <> 'MALE')" };
        expect(roundTripElement(element)).toEqual(element);
    });
});

describe('serialize — both visibleIf AND enableIf present (lossless)', () => {
    it('keeps the visibility logic editable AND preserves enableIf verbatim', () => {
        const element = {
            type: 'text',
            name: 'q1',
            title: 'س',
            inputType: 'text',
            visibleIf: "({a} = 'x')",
            enableIf: "({g} <> 'MALE')",
        };
        const state = fromSurveyJson({ pages: [{ name: 'p1', elements: [element] }] });
        const field = state.pages[0].fields[0];

        // The editable logic is the visibility side (show).
        expect(field.logic).toEqual({
            action: 'show',
            match: 'all',
            rules: [{ field: 'a', op: '=', value: 'x' }],
        });
        // enableIf is preserved verbatim in raw (not consumed).
        expect(field.raw.enableIf).toBe("({g} <> 'MALE')");

        const out = toSurveyJson(state, { runtimeContextKeys: [] }).pages[0].elements[0];
        expect(out.visibleIf).toBe("({a} = 'x')");
        expect(out.enableIf).toBe("({g} <> 'MALE')");
    });

    it('round-trips the both-present case byte-for-byte', () => {
        const element = {
            type: 'text',
            name: 'q1',
            title: 'س',
            inputType: 'text',
            visibleIf: "({a} = 'x')",
            enableIf: "({g} <> 'MALE')",
        };
        expect(roundTripElement(element)).toEqual(element);
    });
});
