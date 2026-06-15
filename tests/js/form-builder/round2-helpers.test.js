import { describe, it, expect } from 'vitest';
import {
    normalizeRateMax,
    ratingPreviewItems,
    SMILEY_PROGRESSION,
    formatRuleValue,
    formatLogicRule,
    buildLogicMap,
    normalizeLogicAction,
    LOGIC_ACTIONS,
} from '../../../resources/js/form-builder/ui-helpers.js';

/* --------------------------------------------------- rating preview (fix 3) */

describe('ratingPreviewItems', () => {
    it('clamps rateMax into the 3..10 range, defaulting to 5', () => {
        expect(normalizeRateMax(undefined)).toBe(5);
        expect(normalizeRateMax(null)).toBe(5);
        expect(normalizeRateMax('nope')).toBe(5);
        expect(normalizeRateMax(1)).toBe(3);
        expect(normalizeRateMax(99)).toBe(10);
        expect(normalizeRateMax(7)).toBe(7);
        expect(normalizeRateMax('4')).toBe(4);
    });

    it('defaults to a star row sized to rateMax', () => {
        const preview = ratingPreviewItems({ rateMax: 5 });
        expect(preview.type).toBe('stars');
        expect(preview.max).toBe(5);
        expect(preview.items).toHaveLength(5);
        expect(preview.items).toEqual([1, 2, 3, 4, 5]);
    });

    it('falls back to stars for an unknown rateType', () => {
        expect(ratingPreviewItems({ rateType: 'mystery', rateMax: 4 }).type).toBe('stars');
    });

    it('renders numbered pills 1..rateMax for labels (أرقام)', () => {
        const preview = ratingPreviewItems({ rateType: 'labels', rateMax: 4 });
        expect(preview.type).toBe('labels');
        expect(preview.items).toEqual([1, 2, 3, 4]);
    });

    it('renders a smiley row drawn from the standard progression, runs worst→best', () => {
        const five = ratingPreviewItems({ rateType: 'smileys', rateMax: 5 });
        expect(five.type).toBe('smileys');
        expect(five.items).toEqual(SMILEY_PROGRESSION);

        // Endpoints are always worst (first) and best (last) regardless of rateMax.
        const ten = ratingPreviewItems({ rateType: 'smileys', rateMax: 10 });
        expect(ten.items).toHaveLength(10);
        expect(ten.items[0]).toBe(SMILEY_PROGRESSION[0]);
        expect(ten.items[ten.items.length - 1]).toBe(SMILEY_PROGRESSION[SMILEY_PROGRESSION.length - 1]);
        for (const emoji of ten.items) {
            expect(SMILEY_PROGRESSION).toContain(emoji);
        }
    });
});

/* ----------------------------------------------------- logic map (fix 9) */

describe('formatRuleValue', () => {
    it('renders booleans, arrays, and scalars per locale', () => {
        expect(formatRuleValue(true, '=', 'ar')).toBe('نعم');
        expect(formatRuleValue(false, '=', 'en')).toBe('No');
        expect(formatRuleValue(['a', 'b'], 'anyof', 'en')).toBe('a, b');
        expect(formatRuleValue(['a', 'b'], 'anyof', 'ar')).toBe('a، b');
        expect(formatRuleValue('hi', '=', 'ar')).toBe('hi');
        expect(formatRuleValue(5, '>', 'ar')).toBe('5');
    });

    it('returns an empty string for nullary operators', () => {
        expect(formatRuleValue('ignored', 'empty', 'ar')).toBe('');
        expect(formatRuleValue(undefined, 'notempty', 'en')).toBe('');
    });
});

describe('formatLogicRule', () => {
    const labelOf = (name) => ({ q1: 'اللون', gender: 'الجنس' }[name] ?? name);

    it('joins label + operator + value', () => {
        expect(formatLogicRule({ field: 'q1', op: '=', value: 'أحمر' }, labelOf, 'ar')).toBe('اللون يساوي أحمر');
    });

    it('omits the value for nullary operators', () => {
        expect(formatLogicRule({ field: 'q1', op: 'empty' }, labelOf, 'ar')).toBe('اللون فارغ');
    });
});

describe('buildLogicMap', () => {
    /** A minimal builder State with three fields wired with logic + a quiz. */
    function makeState() {
        return {
            pages: [
                {
                    name: 'p1',
                    fields: [
                        { name: 'q1', type: 'single_choice', label: { ar: 'اللون', en: 'Color' }, logic: null, quiz: null,
                            choices: [{ value: 'red', label: { ar: 'أحمر', en: null } }] },
                        {
                            name: 'q2',
                            type: 'short_text',
                            label: { ar: 'التفاصيل', en: 'Details' },
                            logic: { action: 'show', match: 'all', rules: [{ field: 'q1', op: '=', value: 'red' }] },
                            quiz: null,
                        },
                        {
                            name: 'q3',
                            type: 'single_choice',
                            label: { ar: 'العاصمة', en: 'Capital' },
                            logic: null,
                            quiz: { correct: 'riyadh', score: 2 },
                            choices: [],
                        },
                    ],
                },
            ],
        };
    }

    it('lists fields that HAVE logic with humanized rules', () => {
        const map = buildLogicMap(makeState(), ['gender'], 'ar');
        const q2 = map.entries.find((entry) => entry.name === 'q2');
        expect(q2).toBeTruthy();
        expect(q2.action).toBe('show');
        expect(q2.match).toBe('all');
        expect(q2.rules).toEqual(['اللون يساوي أحمر']);
    });

    it('lists fields REFERENCED by other logic, with the referrer label', () => {
        const map = buildLogicMap(makeState(), [], 'ar');
        const q1 = map.entries.find((entry) => entry.name === 'q1');
        expect(q1).toBeTruthy();
        expect(q1.referencedBy).toEqual(['التفاصيل']);
    });

    it('collects quiz points with a total', () => {
        const map = buildLogicMap(makeState(), [], 'ar');
        expect(map.quiz.questions).toEqual([{ name: 'q3', label: 'العاصمة', points: 2 }]);
        expect(map.quiz.total).toBe(2);
    });

    it('reports empty when there is no logic and no quiz', () => {
        const empty = buildLogicMap(
            { pages: [{ name: 'p1', fields: [{ name: 'q1', type: 'short_text', label: { ar: 'س', en: null }, logic: null, quiz: null }] }] },
            [],
            'ar',
        );
        expect(empty.isEmpty).toBe(true);
        expect(empty.entries).toEqual([]);
    });

    it('formats an advanced (raw) logic expression', () => {
        const state = {
            pages: [{ name: 'p1', fields: [
                { name: 'q1', type: 'short_text', label: { ar: 'س', en: null }, logic: { advanced: 'age({dob}) > 18' }, quiz: null },
            ] }],
        };
        const map = buildLogicMap(state, [], 'ar');
        expect(map.entries[0].advanced).toBe('age({dob}) > 18');
        expect(map.entries[0].action).toBeNull();
    });

    it('resolves a predefined-variable rule target to its friendly label', () => {
        const state = {
            pages: [{ name: 'p1', fields: [
                {
                    name: 'q1',
                    type: 'short_text',
                    label: { ar: 'س', en: null },
                    logic: { action: 'hide', match: 'any', rules: [{ field: 'gender', op: '=', value: 'MALE' }] },
                    quiz: null,
                },
            ] }],
        };
        const map = buildLogicMap(state, ['gender'], 'ar');
        expect(map.entries[0].action).toBe('hide');
        expect(map.entries[0].rules).toEqual(['الجنس يساوي MALE']);
    });

    it('preserves a disable action in the map entry', () => {
        const state = {
            pages: [{ name: 'p1', fields: [
                {
                    name: 'q1',
                    type: 'short_text',
                    label: { ar: 'س', en: null },
                    logic: { action: 'disable', match: 'all', rules: [{ field: 'gender', op: '=', value: 'MALE' }] },
                    quiz: null,
                },
            ] }],
        };
        const map = buildLogicMap(state, ['gender'], 'ar');
        expect(map.entries[0].action).toBe('disable');
        expect(map.entries[0].rules).toEqual(['الجنس يساوي MALE']);
    });
});

describe('normalizeLogicAction', () => {
    it('exposes the three supported actions', () => {
        expect(LOGIC_ACTIONS).toEqual(['show', 'hide', 'disable']);
    });

    it('passes through supported actions', () => {
        expect(normalizeLogicAction('show')).toBe('show');
        expect(normalizeLogicAction('hide')).toBe('hide');
        expect(normalizeLogicAction('disable')).toBe('disable');
    });

    it('defaults anything unknown to show', () => {
        expect(normalizeLogicAction(undefined)).toBe('show');
        expect(normalizeLogicAction(null)).toBe('show');
        expect(normalizeLogicAction('toggle')).toBe('show');
    });
});
