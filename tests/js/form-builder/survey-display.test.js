import { afterEach, describe, expect, it } from 'vitest';
import {
    createDisplayModel,
    displayModelConfig,
    STORAGE_DEFAULT_LOCALE,
} from '../../../resources/js/form-builder/survey-runtime.js';

/**
 * A minimal survey-core global stand-in for the read-only viewer tests. Mirrors
 * the shape used in survey-runtime.test.js: `defaultLocale` starts at `'en'`
 * (survey-core's real default) and `Model` records the locale / data / mode the
 * viewer assigns so we can assert the display-mode wiring.
 */
function fakeSurveyGlobal() {
    const surveyLocalization = { locales: {}, defaultLocale: 'en' };

    return {
        Survey: {
            surveyLocalization,
            Model: class {
                constructor(json) {
                    this.json = json;
                    this.locale = '';
                    this.data = null;
                    this.mode = 'edit';
                }
            },
        },
    };
}

afterEach(() => {
    delete globalThis.window;
});

describe('displayModelConfig (pure read-only model shape)', () => {
    it('always pins display mode', () => {
        expect(displayModelConfig().mode).toBe('display');
        expect(displayModelConfig({ locale: 'en', data: { a: 1 } }).mode).toBe('display');
    });

    it('falls back to the storage default locale when none is given', () => {
        expect(displayModelConfig().locale).toBe(STORAGE_DEFAULT_LOCALE);
        expect(displayModelConfig({ defaultLocale: 'en' }).locale).toBe('en');
    });

    it('honours an explicit locale code', () => {
        expect(displayModelConfig({ locale: 'ar' }).locale).toBe('ar');
        expect(displayModelConfig({ locale: 'en' }).locale).toBe('en');
    });

    it('carries the submitted answers as data, tolerating nullish input', () => {
        expect(displayModelConfig({ data: { q1: 'yes' } }).data).toEqual({ q1: 'yes' });
        expect(displayModelConfig({ data: null }).data).toEqual({});
        expect(displayModelConfig().data).toEqual({});
    });
});

describe('createDisplayModel (renders a stored submission read-only)', () => {
    it('returns null when the renderer global is absent', () => {
        expect(createDisplayModel({ pages: [] }, { data: {} })).toBeNull();
    });

    it('builds a display-mode model wired with the submitted answers and locale', () => {
        globalThis.window = fakeSurveyGlobal();

        const answers = { full_name: 'Sara', rating: 5 };
        const model = createDisplayModel({ pages: [] }, { locale: 'en', data: answers });

        expect(model.mode).toBe('display');
        expect(model.locale).toBe('en');
        expect(model.data).toEqual(answers);
    });

    it('renders the storage default locale when no locale is supplied', () => {
        globalThis.window = fakeSurveyGlobal();

        const model = createDisplayModel({ pages: [] }, { data: {} });

        expect(model.locale).toBe(STORAGE_DEFAULT_LOCALE);
        expect(model.mode).toBe('display');
    });

    it("aligns survey-core's default locale with the storage default before building the model", () => {
        globalThis.window = fakeSurveyGlobal();
        expect(globalThis.window.Survey.surveyLocalization.defaultLocale).toBe('en');

        createDisplayModel({ pages: [] }, { data: {} });

        expect(globalThis.window.Survey.surveyLocalization.defaultLocale).toBe(STORAGE_DEFAULT_LOCALE);
    });
});
