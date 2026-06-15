import { describe, it, expect } from 'vitest';
import {
    emptyLStr,
    parseLStr,
    serializeLStr,
    isEmptyLStr,
    lstrText,
} from '../../../resources/js/form-builder/model/localized.js';

describe('localized.emptyLStr', () => {
    it('is ar empty / en null', () => {
        expect(emptyLStr()).toEqual({ ar: '', en: null });
    });
});

describe('localized.parseLStr', () => {
    it('null / undefined -> empty', () => {
        expect(parseLStr(null)).toEqual({ ar: '', en: null });
        expect(parseLStr(undefined)).toEqual({ ar: '', en: null });
    });

    it('plain string -> ar with null en', () => {
        expect(parseLStr('مرحبا')).toEqual({ ar: 'مرحبا', en: null });
    });

    it('object {ar, en}', () => {
        expect(parseLStr({ ar: 'نعم', en: 'Yes' })).toEqual({ ar: 'نعم', en: 'Yes' });
    });

    it('object {default, en} -> default becomes ar', () => {
        expect(parseLStr({ default: 'نعم', en: 'Yes' })).toEqual({ ar: 'نعم', en: 'Yes' });
    });

    it('object {default} only -> en null', () => {
        expect(parseLStr({ default: 'نص' })).toEqual({ ar: 'نص', en: null });
    });

    it('ar takes precedence over default', () => {
        expect(parseLStr({ ar: 'عربي', default: 'افتراضي', en: 'English' }))
            .toEqual({ ar: 'عربي', en: 'English' });
    });

    it('other-locale-only object falls back to first non-en value for ar', () => {
        expect(parseLStr({ fr: 'Bonjour' })).toEqual({ ar: 'Bonjour', en: null });
    });

    it('en-only object uses en as the ar fallback but keeps en', () => {
        expect(parseLStr({ en: 'Hello' })).toEqual({ ar: 'Hello', en: 'Hello' });
    });

    it('empty object -> empty ar, null en', () => {
        expect(parseLStr({})).toEqual({ ar: '', en: null });
    });

    it('number coerces to string', () => {
        expect(parseLStr(42)).toEqual({ ar: '42', en: null });
    });
});

describe('localized.serializeLStr', () => {
    it('null/undefined -> undefined', () => {
        expect(serializeLStr(null)).toBeUndefined();
        expect(serializeLStr(undefined)).toBeUndefined();
    });

    it('empty -> undefined', () => {
        expect(serializeLStr({ ar: '', en: null })).toBeUndefined();
        expect(serializeLStr({ ar: '   ', en: '  ' })).toBeUndefined();
    });

    it('ar only -> plain string', () => {
        expect(serializeLStr({ ar: 'مرحبا', en: null })).toBe('مرحبا');
        expect(serializeLStr({ ar: 'مرحبا', en: '' })).toBe('مرحبا');
    });

    it('trims the returned ar-only plain string', () => {
        expect(serializeLStr({ ar: '  مرحبا  ', en: null })).toBe('مرحبا');
    });

    it('whitespace-only en is treated as empty -> plain ar string', () => {
        expect(serializeLStr({ ar: 'مرحبا', en: '   ' })).toBe('مرحبا');
    });

    it('ar + en -> {default, en}', () => {
        expect(serializeLStr({ ar: 'نعم', en: 'Yes' })).toEqual({ default: 'نعم', en: 'Yes' });
    });

    it('trims both sides of the returned {default, en}', () => {
        expect(serializeLStr({ ar: '  نعم  ', en: '  Yes  ' })).toEqual({ default: 'نعم', en: 'Yes' });
    });

    it('en only (no ar) -> {default:"", en}', () => {
        expect(serializeLStr({ ar: '', en: 'Yes' })).toEqual({ default: '', en: 'Yes' });
    });
});

describe('localized.isEmptyLStr', () => {
    it('detects empty', () => {
        expect(isEmptyLStr(null)).toBe(true);
        expect(isEmptyLStr({ ar: '', en: null })).toBe(true);
        expect(isEmptyLStr({ ar: '  ', en: '  ' })).toBe(true);
    });

    it('detects non-empty', () => {
        expect(isEmptyLStr({ ar: 'x', en: null })).toBe(false);
        expect(isEmptyLStr({ ar: '', en: 'y' })).toBe(false);
    });
});

describe('localized.lstrText', () => {
    it('ar locale returns ar', () => {
        expect(lstrText({ ar: 'عربي', en: 'English' }, 'ar')).toBe('عربي');
    });

    it('en locale returns en, falling back to ar', () => {
        expect(lstrText({ ar: 'عربي', en: 'English' }, 'en')).toBe('English');
        expect(lstrText({ ar: 'عربي', en: null }, 'en')).toBe('عربي');
    });

    it('null lstr -> empty string', () => {
        expect(lstrText(null, 'ar')).toBe('');
    });
});
