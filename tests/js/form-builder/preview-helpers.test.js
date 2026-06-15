import { describe, it, expect } from 'vitest';
import {
    previewSampleData,
    PREVIEW_SAMPLE_VALUES,
    quizAnswerMatches,
    scoreQuizPreview,
} from '../../../resources/js/form-builder/ui-helpers.js';

describe('previewSampleData', () => {
    it('returns realistic Arabic sample values for catalogued runtime keys', () => {
        const data = previewSampleData(['full_name', 'greeting', 'user_region.title_ar', 'membership.package.slug']);
        expect(data).toEqual({
            full_name: 'محمد بن عبدالله التويجري',
            greeting: 'ابن العم',
            'user_region.title_ar': 'القصيم',
            'membership.package.slug': 'basic',
        });
    });

    it('covers every documented runtime-context key', () => {
        const keys = [
            'id', 'full_name', 'greeting', 'phone', 'email', 'gender', 'dob',
            'marital_status', 'is_system_admin', 'user_region.title_ar',
            'membership.package.slug', 'membership.expired_at',
        ];
        const data = previewSampleData(keys);
        for (const key of keys) {
            expect(data[key]).toBe(PREVIEW_SAMPLE_VALUES[key]);
            expect(data[key]).not.toBeUndefined();
        }
    });

    it('falls back to a readable placeholder for unknown keys', () => {
        expect(previewSampleData(['custom_thing'])).toEqual({ custom_thing: 'عينة (custom_thing)' });
    });

    it('tolerates nullish / empty input', () => {
        expect(previewSampleData(null)).toEqual({});
        expect(previewSampleData(undefined)).toEqual({});
        expect(previewSampleData([])).toEqual({});
    });
});

describe('quizAnswerMatches (mirrors SurveyScoreCalculator::answersMatch)', () => {
    it('compares scalars as strings', () => {
        expect(quizAnswerMatches('yes', 'yes')).toBe(true);
        expect(quizAnswerMatches(3, '3')).toBe(true);
        expect(quizAnswerMatches('no', 'yes')).toBe(false);
        expect(quizAnswerMatches(true, 'true')).toBe(true);
    });

    it('compares arrays order-insensitively as strings', () => {
        expect(quizAnswerMatches(['a', 'b'], ['b', 'a'])).toBe(true);
        expect(quizAnswerMatches(['1', '2'], [2, 1])).toBe(true);
        expect(quizAnswerMatches(['a'], ['a', 'b'])).toBe(false);
    });

    it('treats a scalar vs single-item array via array coercion', () => {
        expect(quizAnswerMatches(['a'], 'a')).toBe(true);
        expect(quizAnswerMatches('a', ['a'])).toBe(true);
    });

    it('handles nullish answers as empty', () => {
        expect(quizAnswerMatches(undefined, '')).toBe(true);
        expect(quizAnswerMatches(null, 'x')).toBe(false);
    });
});

describe('scoreQuizPreview', () => {
    const survey = {
        pages: [
            {
                name: 'p1',
                elements: [
                    { type: 'radiogroup', name: 'q1', title: 'س1', choices: ['أ', 'ب'], correctAnswer: 'أ' },
                    { type: 'checkbox', name: 'q2', title: { default: 'س2', en: 'Q2' }, choices: ['x', 'y', 'z'], correctAnswer: ['x', 'z'], score: 2 },
                    { type: 'text', name: 'notscored', title: 'بدون تقييم' },
                ],
            },
        ],
    };

    it('scores correct and incorrect answers with per-question points', () => {
        const result = scoreQuizPreview(survey, { q1: 'أ', q2: ['z', 'x'] });
        expect(result.total).toBe(3);
        expect(result.max).toBe(3);
        expect(result.percent).toBe(100);
        expect(result.questions).toHaveLength(2);
    });

    it('gives partial totals and a rounded percent', () => {
        const result = scoreQuizPreview(survey, { q1: 'ب', q2: ['x', 'z'] });
        expect(result.total).toBe(2);
        expect(result.max).toBe(3);
        expect(result.percent).toBe(66.67);
        const q1 = result.questions.find((q) => q.name === 'q1');
        const q2 = result.questions.find((q) => q.name === 'q2');
        expect(q1.correct).toBe(false);
        expect(q2.correct).toBe(true);
    });

    it('localizes the question title (ar/default) for display', () => {
        const result = scoreQuizPreview(survey, {});
        const q2 = result.questions.find((q) => q.name === 'q2');
        expect(q2.title).toBe('س2');
    });

    it('skips questions with a score of zero entirely (not added to max)', () => {
        const zeroScore = {
            pages: [{ name: 'p1', elements: [
                { type: 'radiogroup', name: 'q1', title: 'س', choices: ['أ'], correctAnswer: 'أ', score: 0 },
                { type: 'radiogroup', name: 'q2', title: 'س2', choices: ['أ'], correctAnswer: 'أ' },
            ] }],
        };
        const result = scoreQuizPreview(zeroScore, { q1: 'أ', q2: 'أ' });
        expect(result.max).toBe(1);
        expect(result.questions).toHaveLength(1);
        expect(result.questions[0].name).toBe('q2');
    });

    it('returns an empty breakdown when there are no scored questions', () => {
        const plain = { pages: [{ name: 'p1', elements: [{ type: 'text', name: 'q1', title: 'س' }] }] };
        const result = scoreQuizPreview(plain, {});
        expect(result).toEqual({ total: 0, max: 0, percent: 0, questions: [] });
    });

    it('recurses into panel containers (panel/paneldynamic/flowpanel)', () => {
        const nested = {
            pages: [{ name: 'p1', elements: [
                { type: 'panel', name: 'pnl', elements: [
                    { type: 'radiogroup', name: 'q1', title: 'س', choices: ['أ', 'ب'], correctAnswer: 'أ' },
                ] },
            ] }],
        };
        const result = scoreQuizPreview(nested, { q1: 'أ' });
        expect(result.max).toBe(1);
        expect(result.total).toBe(1);
        expect(result.questions[0].name).toBe('q1');
    });

    it('clamps negative scores like the PHP calculator (skipped)', () => {
        const negative = {
            pages: [{ name: 'p1', elements: [
                { type: 'radiogroup', name: 'q1', title: 'س', choices: ['أ'], correctAnswer: 'أ', score: -5 },
            ] }],
        };
        const result = scoreQuizPreview(negative, { q1: 'أ' });
        expect(result.max).toBe(0);
        expect(result.questions).toHaveLength(0);
    });
});
