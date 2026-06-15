import { describe, it, expect, afterEach } from 'vitest';
import {
    applySurveyLocaleOverrides,
    createPreviewModel,
    isRtlLocale,
    STORAGE_DEFAULT_LOCALE,
    unmountPreview,
} from '../../../resources/js/form-builder/survey-runtime.js';

/**
 * A minimal survey-core global stand-in for locale/model tests.
 *
 * `surveyLocalization.defaultLocale` starts at `'en'` to mirror survey-core's
 * real out-of-the-box default, and `Model` reproduces survey-core's localizable
 * string resolution: the `default` slot holds the text for the *default* locale,
 * and an explicit locale key is preferred only when it differs from that
 * default. This is exactly the mechanism `createPreviewModel`'s default-locale
 * alignment relies on, so resolving a `title` here exercises the real fix.
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
                    this.variables = {};
                }

                setVariable(key, value) {
                    this.variables[key] = value;
                }

                mergeData() {}

                /** Resolve a SurveyJS localizable value for the model's active locale. */
                localize(value) {
                    if (value === null || value === undefined) {
                        return '';
                    }
                    if (typeof value === 'string') {
                        return value;
                    }

                    const fallback = surveyLocalization.defaultLocale || 'en';
                    const locale = this.locale || fallback;

                    return locale === fallback
                        ? (value.default ?? value[fallback] ?? '')
                        : (value[locale] ?? value.default ?? '');
                }

                get title() {
                    return this.localize(this.json?.title);
                }
            },
        },
    };
}

/** A minimal stand-in for a DOM node that tracks cleanup calls. */
function fakeNode() {
    return {
        children: ['stale'],
        innerHTML: '<survey/>',
        replaceChildren() {
            this.children = [];
            this.replaceChildrenCalled = true;
        },
    };
}

afterEach(() => {
    delete globalThis.window;
});

describe('unmountPreview (fix 3 — preview re-entry cleanup)', () => {
    it('tolerates a nullish element', () => {
        expect(() => unmountPreview(null)).not.toThrow();
        expect(() => unmountPreview(undefined)).not.toThrow();
    });

    it('clears the node children even when no renderer global is present', () => {
        const node = fakeNode();
        unmountPreview(node);
        expect(node.replaceChildrenCalled).toBe(true);
        expect(node.children).toEqual([]);
    });

    it('invokes the renderer unmount hook when SurveyUI exposes one', () => {
        let unmountedWith = null;
        globalThis.window = {
            SurveyUI: {
                unmountSurveyFromElement(el) {
                    unmountedWith = el;
                },
            },
        };
        const node = fakeNode();
        unmountPreview(node);
        expect(unmountedWith).toBe(node);
        expect(node.children).toEqual([]);
    });

    it('still clears the node when the renderer unmount hook throws', () => {
        globalThis.window = {
            SurveyUI: {
                unmount() {
                    throw new Error('boom');
                },
            },
        };
        const node = fakeNode();
        expect(() => unmountPreview(node)).not.toThrow();
        expect(node.children).toEqual([]);
    });

    it('falls back to innerHTML when replaceChildren is unavailable', () => {
        const node = { innerHTML: '<survey/>' };
        unmountPreview(node);
        expect(node.innerHTML).toBe('');
    });
});

describe('isRtlLocale (SurveyJS-aligned RTL detection)', () => {
    it('flags RTL locales, tolerating case and region suffixes', () => {
        for (const code of ['ar', 'ar-SA', 'AR', 'fa', 'he', 'ur', 'ps']) {
            expect(isRtlLocale(code)).toBe(true);
        }
    });

    it('treats LTR / empty / invalid values as LTR', () => {
        for (const code of ['en', 'en-US', 'de', 'fr', 'tr', '', null, undefined, 42]) {
            expect(isRtlLocale(code)).toBe(false);
        }
    });
});

describe('applySurveyLocaleOverrides (generic, any-locale string patching)', () => {
    it('is a no-op when the renderer global is absent', () => {
        expect(() => applySurveyLocaleOverrides({ ar: { set: { requiredError: 'x' } } })).not.toThrow();
    });

    it('fills gaps only, but sets overrides unconditionally — for any locale', () => {
        globalThis.window = { Survey: { surveyLocalization: { locales: { de: { pageNextText: 'Weiter' } } } } };

        applySurveyLocaleOverrides({
            de: {
                fill: { pageNextText: 'IGNORED', pagePrevText: 'Zurück' },
                set: { requiredError: 'Pflichtfeld' },
            },
        });

        const de = globalThis.window.Survey.surveyLocalization.locales.de;
        expect(de.pageNextText).toBe('Weiter'); // existing bundle value kept (fill)
        expect(de.pagePrevText).toBe('Zurück'); // missing key filled
        expect(de.requiredError).toBe('Pflichtfeld'); // set always wins
    });

    it('creates the locale dictionary when it does not exist', () => {
        globalThis.window = { Survey: { surveyLocalization: { locales: {} } } };

        applySurveyLocaleOverrides({ he: { set: { completeText: 'שלח' } } });

        expect(globalThis.window.Survey.surveyLocalization.locales.he.completeText).toBe('שלח');
    });
});

describe('createPreviewModel (locale-code-driven preview)', () => {
    it('returns null when the renderer global is absent', () => {
        expect(createPreviewModel({ pages: [] })).toBeNull();
    });

    it('sets model.locale to any SurveyJS locale code', () => {
        globalThis.window = fakeSurveyGlobal();

        expect(createPreviewModel({ pages: [] }, { locale: 'de' }).locale).toBe('de');
        expect(createPreviewModel({ pages: [] }, { locale: 'ar' }).locale).toBe('ar');
    });

    it('falls back to the storage default locale when no locale is given', () => {
        globalThis.window = fakeSurveyGlobal();

        expect(createPreviewModel({ pages: [] }, {}).locale).toBe(STORAGE_DEFAULT_LOCALE);
        expect(createPreviewModel({ pages: [] }, { defaultLocale: 'en' }).locale).toBe('en');
    });

    it('seeds sample data as variables for piping', () => {
        globalThis.window = fakeSurveyGlobal();

        const model = createPreviewModel({ pages: [] }, { locale: 'en', sampleData: { full_name: 'Sara' } });
        expect(model.variables.full_name).toBe('Sara');
    });
});

describe('createPreviewModel (locale resolution — English no longer renders Arabic)', () => {
    /** Title carrying Arabic in the `default` slot and English under `en` — the package's storage shape. */
    const bilingualSchema = () => ({
        title: { default: 'نص عربي', en: 'English text' },
        pages: [],
    });

    it("aligns survey-core's default locale with the storage default before building the model", () => {
        globalThis.window = fakeSurveyGlobal();
        expect(globalThis.window.Survey.surveyLocalization.defaultLocale).toBe('en'); // survey-core's real default

        createPreviewModel(bilingualSchema());

        expect(globalThis.window.Survey.surveyLocalization.defaultLocale).toBe(STORAGE_DEFAULT_LOCALE);
    });

    it('renders the English slot at locale "en" and the Arabic default at locale "ar"', () => {
        globalThis.window = fakeSurveyGlobal();

        expect(createPreviewModel(bilingualSchema(), { locale: 'en' }).title).toBe('English text');
        expect(createPreviewModel(bilingualSchema(), { locale: 'ar' }).title).toBe('نص عربي');
    });

    it('honours a custom storage default locale via options.defaultLocale', () => {
        globalThis.window = fakeSurveyGlobal();

        // A host whose schemas keep English in `default` and Arabic under `ar`
        // configures the alignment via options.defaultLocale — not hardcoded.
        const enDefaultSchema = { title: { default: 'English text', ar: 'نص عربي' }, pages: [] };

        expect(createPreviewModel(enDefaultSchema, { locale: 'en', defaultLocale: 'en' }).title).toBe('English text');
        expect(createPreviewModel(enDefaultSchema, { locale: 'ar', defaultLocale: 'en' }).title).toBe('نص عربي');
        expect(globalThis.window.Survey.surveyLocalization.defaultLocale).toBe('en');
    });

    it("reproduces the bug when the default locale is left at survey-core's \"en\" (guards the fix)", () => {
        globalThis.window = fakeSurveyGlobal();

        // No createPreviewModel call → defaultLocale stays 'en'. An 'en' render
        // resolves the `default` slot, which holds Arabic — the original bug.
        const model = new globalThis.window.Survey.Model(bilingualSchema());
        model.locale = 'en';

        expect(model.title).toBe('نص عربي');
    });
});
