import { describe, it, expect, afterEach } from 'vitest';
import {
    applySurveyLocaleOverrides,
    createPreviewModel,
    isRtlLocale,
    unmountPreview,
} from '../../../resources/js/form-builder/survey-runtime.js';

/** A minimal survey-core global stand-in for locale/model tests. */
function fakeSurveyGlobal() {
    return {
        Survey: {
            surveyLocalization: { locales: {} },
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

    it('falls back to defaultLocale (or empty) when no locale is given', () => {
        globalThis.window = fakeSurveyGlobal();

        expect(createPreviewModel({ pages: [] }, {}).locale).toBe('');
        expect(createPreviewModel({ pages: [] }, { defaultLocale: 'ar' }).locale).toBe('ar');
    });

    it('seeds sample data as variables for piping', () => {
        globalThis.window = fakeSurveyGlobal();

        const model = createPreviewModel({ pages: [] }, { locale: 'en', sampleData: { full_name: 'Sara' } });
        expect(model.variables.full_name).toBe('Sara');
    });
});
