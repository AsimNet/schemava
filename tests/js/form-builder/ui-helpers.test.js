import { describe, it, expect } from 'vitest';
import {
    variableLabel,
    variableOptions,
    containsVariable,
    insertVariableAt,
    bytesToMb,
    mbToBytes,
    operatorLabel,
    operatorsForType,
    valueInputKind,
    renameChoiceLabel,
    makeChoice,
    splitBulkLines,
    choiceValueDiverged,
    variableMetaFor,
    variableInputKind,
    NULLARY_OPERATORS,
} from '../../../resources/js/form-builder/ui-helpers.js';

describe('variable labels', () => {
    it('resolves catalogued labels per locale', () => {
        expect(variableLabel('full_name', 'ar')).toBe('الاسم الكامل');
        expect(variableLabel('full_name', 'en')).toBe('Full name');
        expect(variableLabel('user_region.title_ar', 'ar')).toBe('المنطقة');
        expect(variableLabel('is_active_member', 'ar')).toBe('عضو نشط');
        expect(variableLabel('is_active_member', 'en')).toBe('Active member');
    });

    it('falls back to the raw key when uncatalogued', () => {
        expect(variableLabel('totally_unknown', 'ar')).toBe('totally_unknown');
        expect(variableLabel('totally_unknown', 'en')).toBe('totally_unknown');
    });

    it('builds option lists and tolerates nullish input', () => {
        expect(variableOptions(['id', 'phone'], 'en')).toEqual([
            { key: 'id', label: 'ID' },
            { key: 'phone', label: 'Phone' },
        ]);
        expect(variableOptions(null, 'ar')).toEqual([]);
    });
});

describe('piping', () => {
    it('detects variable tokens', () => {
        expect(containsVariable('مرحباً {full_name}')).toBe(true);
        expect(containsVariable('plain text')).toBe(false);
        expect(containsVariable('{ spaced }')).toBe(false);
        expect(containsVariable(null)).toBe(false);
    });

    it('inserts a token at the caret and returns the new caret', () => {
        const result = insertVariableAt('Hi , welcome', 3, 'full_name');
        expect(result.text).toBe('Hi {full_name}, welcome');
        expect(result.caret).toBe(3 + '{full_name}'.length);
    });

    it('appends when the caret is out of range', () => {
        expect(insertVariableAt('Hi', 99, 'id').text).toBe('Hi{id}');
        expect(insertVariableAt('Hi', -1, 'id').text).toBe('Hi{id}');
        expect(insertVariableAt(undefined, 0, 'id').text).toBe('{id}');
    });
});

describe('maxSize MB <-> bytes', () => {
    it('converts bytes to MB', () => {
        expect(bytesToMb(1024 * 1024)).toBe(1);
        expect(bytesToMb(5 * 1024 * 1024)).toBe(5);
        expect(bytesToMb(0)).toBeNull();
        expect(bytesToMb(null)).toBeNull();
        expect(bytesToMb('not a number')).toBeNull();
    });

    it('converts MB to bytes', () => {
        expect(mbToBytes(1)).toBe(1024 * 1024);
        expect(mbToBytes(2.5)).toBe(Math.round(2.5 * 1024 * 1024));
        expect(mbToBytes(0)).toBeNull();
        expect(mbToBytes('')).toBeNull();
    });

    it('round-trips a whole-MB value', () => {
        expect(bytesToMb(mbToBytes(10))).toBe(10);
    });
});

describe('operators', () => {
    it('labels operators bilingually', () => {
        expect(operatorLabel('=', 'ar')).toBe('يساوي');
        expect(operatorLabel('contains', 'en')).toBe('contains');
        expect(operatorLabel('anyof', 'ar')).toBe('أيٌّ من');
    });

    it('filters operators by field type', () => {
        expect(operatorsForType('yes_no')).toEqual(['=', '<>']);
        expect(operatorsForType('number')).toContain('>=');
        expect(operatorsForType('multi_choice')).toContain('contains');
        expect(operatorsForType('single_choice')).toContain('anyof');
        expect(operatorsForType('short_text')).toContain('notcontains');
        // Unknown / predefined variable: everything except anyof.
        expect(operatorsForType(null)).not.toContain('anyof');
        expect(operatorsForType(null)).toContain('=');
    });

    it('maps operator + type to a value-input kind', () => {
        expect(valueInputKind('empty', 'short_text')).toBe('none');
        expect(NULLARY_OPERATORS).toContain('empty');
        expect(valueInputKind('=', 'single_choice')).toBe('choice');
        expect(valueInputKind('anyof', 'multi_choice')).toBe('choice-multi');
        expect(valueInputKind('anyof', null)).toBe('text');
        expect(valueInputKind('=', 'yes_no')).toBe('boolean');
        expect(valueInputKind('>', 'number')).toBe('number');
        expect(valueInputKind('=', 'date')).toBe('date');
        expect(valueInputKind('contains', 'long_text')).toBe('text');
    });
});

describe('predefined variable meta (fix 4)', () => {
    const META = {
        gender: { kind: 'enum', options: [{ value: 'MALE', label: 'ذكر' }, { value: 'FEMALE', label: 'أنثى' }] },
        marital_status: { kind: 'enum', options: [{ value: 'SINGLE', label: 'أعزب/عزباء' }] },
        is_system_admin: { kind: 'boolean' },
        dob: { kind: 'date' },
        'membership.expired_at': { kind: 'date' },
        id: { kind: 'number' },
    };

    it('looks up typed meta by key and tolerates nullish maps', () => {
        expect(variableMetaFor(META, 'gender')).toEqual(META.gender);
        expect(variableMetaFor(META, 'is_system_admin')).toEqual({ kind: 'boolean' });
        expect(variableMetaFor(META, 'phone')).toBeNull();
        expect(variableMetaFor(null, 'gender')).toBeNull();
        expect(variableMetaFor({}, 'gender')).toBeNull();
    });

    it('ignores malformed meta entries (missing kind)', () => {
        expect(variableMetaFor({ x: {} }, 'x')).toBeNull();
        expect(variableMetaFor({ x: { kind: 123 } }, 'x')).toBeNull();
    });

    it('maps an enum variable to an enum select input', () => {
        expect(variableInputKind('=', META.gender)).toBe('enum');
        expect(variableInputKind('<>', META.marital_status)).toBe('enum');
    });

    it('maps boolean / date / number variables to their typed inputs', () => {
        expect(variableInputKind('=', META.is_system_admin)).toBe('boolean');
        expect(variableInputKind('=', META.dob)).toBe('date');
        expect(variableInputKind('>=', META['membership.expired_at'])).toBe('date');
        expect(variableInputKind('=', META.id)).toBe('number');
    });

    it('renders no value input for nullary operators regardless of kind', () => {
        expect(variableInputKind('empty', META.gender)).toBe('none');
        expect(variableInputKind('notempty', META.is_system_admin)).toBe('none');
    });

    it('falls back to free text for uncatalogued variables', () => {
        expect(variableInputKind('=', null)).toBe('text');
        expect(variableInputKind('contains', undefined)).toBe('text');
    });
});

describe('choices', () => {
    it('mirrors value when renaming the arabic label that the value tracked', () => {
        const choice = { value: 'نعم', label: { ar: 'نعم', en: null } };
        const next = renameChoiceLabel(choice, 'ar', 'موافق');
        expect(next.value).toBe('موافق');
        expect(next.label.ar).toBe('موافق');
    });

    it('keeps a diverged value when renaming the arabic label', () => {
        const choice = { value: 'yes', label: { ar: 'نعم', en: null } };
        const next = renameChoiceLabel(choice, 'ar', 'موافق');
        expect(next.value).toBe('yes');
        expect(next.label.ar).toBe('موافق');
    });

    it('only touches the english label when editing english', () => {
        const choice = { value: 'نعم', label: { ar: 'نعم', en: null } };
        const next = renameChoiceLabel(choice, 'en', 'Yes');
        expect(next.value).toBe('نعم');
        expect(next.label.en).toBe('Yes');
        expect(next.label.ar).toBe('نعم');
    });

    it('clears the english label when emptied', () => {
        const choice = { value: 'نعم', label: { ar: 'نعم', en: 'Yes' } };
        const next = renameChoiceLabel(choice, 'en', '');
        expect(next.label.en).toBeNull();
    });

    it('builds a choice whose value mirrors the arabic text', () => {
        const choice = makeChoice('  خيار  ');
        expect(choice).toMatchObject({ value: 'خيار', label: { ar: 'خيار', en: null }, raw: {} });
        // Carries a non-serialized stable uid for keyed list rendering (fix 6).
        expect(typeof choice._uid).toBe('string');
        expect(choice._uid).not.toBe('');
    });

    it('gives each created choice a unique _uid (fix 6 — blank choices do not collide)', () => {
        const a = makeChoice('');
        const b = makeChoice('');
        expect(a.value).toBe('');
        expect(b.value).toBe('');
        // Same (blank) value, but distinct stable keys.
        expect(a._uid).not.toBe(b._uid);
    });

    it('preserves _uid when renaming a choice label', () => {
        const choice = makeChoice('نعم');
        const next = renameChoiceLabel(choice, 'ar', 'موافق');
        expect(next._uid).toBe(choice._uid);
    });

    it('splits bulk pasted lines, trimming blanks', () => {
        expect(splitBulkLines('a\n b \n\nc\r\n')).toEqual(['a', 'b', 'c']);
        expect(splitBulkLines('')).toEqual([]);
    });

    it('detects a diverged value for display', () => {
        expect(choiceValueDiverged({ value: 'yes', label: { ar: 'نعم', en: null } })).toBe(true);
        expect(choiceValueDiverged({ value: 'نعم', label: { ar: 'نعم', en: null } })).toBe(false);
        expect(choiceValueDiverged({ value: '', label: { ar: '', en: null } })).toBe(false);
    });
});
