import { describe, it, expect } from 'vitest';
import {
    OPERATORS,
    INVERSE_OPERATOR,
    compileLogic,
    parseLogic,
    parseEnableExpression,
} from '../../../resources/js/form-builder/model/expressions.js';

describe('expressions.OPERATORS', () => {
    it('exposes the canonical operator set', () => {
        expect(OPERATORS).toEqual([
            '=', '<>', '>', '<', '>=', '<=', 'contains', 'notcontains', 'empty', 'notempty', 'anyof',
        ]);
    });
});

describe('expressions.compileLogic — show', () => {
    it('compiles a single equality rule', () => {
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'age', op: '=', value: 18 }] }))
            .toBe('({age} = 18)');
    });

    it('quotes and escapes string operands', () => {
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'name', op: '=', value: "O'Brien" }] }))
            .toBe("({name} = 'O\\'Brien')");
    });

    it('compiles booleans', () => {
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'agree', op: '=', value: true }] }))
            .toBe('({agree} = true)');
    });

    it('joins ALL rules with and', () => {
        expect(compileLogic({
            action: 'show',
            match: 'all',
            rules: [
                { field: 'a', op: '=', value: 1 },
                { field: 'b', op: 'contains', value: 'x' },
            ],
        })).toBe("({a} = 1) and ({b} contains 'x')");
    });

    it('joins ANY rules with or', () => {
        expect(compileLogic({
            action: 'show',
            match: 'any',
            rules: [
                { field: 'a', op: '=', value: 1 },
                { field: 'b', op: '=', value: 2 },
            ],
        })).toBe('({a} = 1) or ({b} = 2)');
    });

    it('compiles empty / notempty without operand', () => {
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'a', op: 'empty' }] }))
            .toBe('({a} empty)');
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'a', op: 'notempty' }] }))
            .toBe('({a} notempty)');
    });

    it('compiles anyof arrays', () => {
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'c', op: 'anyof', value: ['x', 'y'] }] }))
            .toBe("({c} anyof ['x', 'y'])");
    });
});

describe('expressions.compileLogic — advanced & empty', () => {
    it('passes advanced expression through', () => {
        expect(compileLogic({ advanced: '{a} = 1 or ({b} = 2 and {c} = 3)' }))
            .toBe('{a} = 1 or ({b} = 2 and {c} = 3)');
    });

    it('null / no rules -> undefined', () => {
        expect(compileLogic(null)).toBeUndefined();
        expect(compileLogic({ action: 'show', match: 'all', rules: [] })).toBeUndefined();
        expect(compileLogic({ advanced: '   ' })).toBeUndefined();
    });
});

describe('expressions round-trip — show (positive-polarity operators)', () => {
    // Positive operators read back as `show` directly.
    const cases = {
        '=': { value: 5 },
        '>': { value: 5 },
        '<': { value: 5 },
        '>=': { value: 5 },
        '<=': { value: 5 },
        contains: { value: 'foo' },
        notempty: {},
    };

    for (const [op, extra] of Object.entries(cases)) {
        it(`round-trips show + ${op}`, () => {
            const logic = { action: 'show', match: 'all', rules: [{ field: 'q1', op, ...extra }] };
            const compiled = compileLogic(logic);
            const parsed = parseLogic(compiled);
            expect(parsed).toEqual(logic);
        });
    }

    it('round-trips show + anyof', () => {
        const logic = { action: 'show', match: 'all', rules: [{ field: 'q1', op: 'anyof', value: ['a', 'b', 'c'] }] };
        expect(parseLogic(compileLogic(logic))).toEqual(logic);
    });
});

describe('expressions canonicalization — show with a negative operator becomes hide', () => {
    // `<>`, `notcontains`, `empty` are the De Morgan images of positive ops, so
    // a `show` rule using them is equivalent to (and parses as) a `hide` rule
    // using the positive operator — the string is identical either way.
    const equivalents = [
        ['show + <>', { action: 'show', match: 'all', rules: [{ field: 'q1', op: '<>', value: 5 }] },
            { action: 'hide', match: 'all', rules: [{ field: 'q1', op: '=', value: 5 }] }],
        ['show + notcontains', { action: 'show', match: 'all', rules: [{ field: 'q1', op: 'notcontains', value: 'foo' }] },
            { action: 'hide', match: 'all', rules: [{ field: 'q1', op: 'contains', value: 'foo' }] }],
        ['show + empty', { action: 'show', match: 'all', rules: [{ field: 'q1', op: 'empty' }] },
            { action: 'hide', match: 'all', rules: [{ field: 'q1', op: 'notempty' }] }],
    ];

    for (const [name, compiledFrom, canonical] of equivalents) {
        it(`${name} canonicalizes to its hide form`, () => {
            expect(parseLogic(compileLogic(compiledFrom))).toEqual(canonical);
        });
    }
});

describe('expressions round-trip — hide (De Morgan, polar operators)', () => {
    // Operators with a clear positive/negative polarity round-trip to `hide`.
    const polarCases = {
        '=': { value: 5 },
        contains: { value: 'foo' },
        notempty: {},
    };

    for (const [op, extra] of Object.entries(polarCases)) {
        it(`round-trips hide + ${op}`, () => {
            const logic = { action: 'hide', match: 'all', rules: [{ field: 'q1', op, ...extra }] };
            const parsed = parseLogic(compileLogic(logic));
            expect(parsed).toEqual(logic);
        });
    }

    it('hide single = compiles to <>', () => {
        expect(compileLogic({ action: 'hide', match: 'all', rules: [{ field: 'a', op: '=', value: 1 }] }))
            .toBe('({a} <> 1)');
    });

    it('hide + anyof expands to and-of-<> and round-trips', () => {
        const logic = { action: 'hide', match: 'all', rules: [{ field: 'c', op: 'anyof', value: ['x', 'y'] }] };
        expect(compileLogic(logic)).toBe("(({c} <> 'x') and ({c} <> 'y'))");
        expect(parseLogic(compileLogic(logic))).toEqual(logic);
    });
});

describe('expressions canonicalization — ambiguous single rules default to show', () => {
    // compileLogic is many-to-one; these inputs are genuinely ambiguous and
    // resolve to the equivalent positive `show` rule (documented behavior).
    const equivalents = [
        ['hide + <>', { action: 'hide', match: 'all', rules: [{ field: 'a', op: '<>', value: 1 }] },
            { action: 'show', match: 'all', rules: [{ field: 'a', op: '=', value: 1 }] }],
        ['hide + >', { action: 'hide', match: 'all', rules: [{ field: 'a', op: '>', value: 1 }] },
            { action: 'show', match: 'all', rules: [{ field: 'a', op: '<=', value: 1 }] }],
        ['hide + <=', { action: 'hide', match: 'all', rules: [{ field: 'a', op: '<=', value: 1 }] },
            { action: 'show', match: 'all', rules: [{ field: 'a', op: '>', value: 1 }] }],
        ['hide + notcontains', { action: 'hide', match: 'all', rules: [{ field: 'a', op: 'notcontains', value: 'x' }] },
            { action: 'show', match: 'all', rules: [{ field: 'a', op: 'contains', value: 'x' }] }],
        ['hide + empty', { action: 'hide', match: 'all', rules: [{ field: 'a', op: 'empty' }] },
            { action: 'show', match: 'all', rules: [{ field: 'a', op: 'notempty' }] }],
    ];

    for (const [name, compiledFrom, canonical] of equivalents) {
        it(`${name} canonicalizes to its positive show form`, () => {
            expect(parseLogic(compileLogic(compiledFrom))).toEqual(canonical);
        });
    }
});

describe('expressions round-trip — all/any with hide inversion', () => {
    it('hide + ALL flips connective to or', () => {
        const logic = {
            action: 'hide',
            match: 'all',
            rules: [
                { field: 'a', op: '=', value: 1 },
                { field: 'b', op: '=', value: 2 },
            ],
        };
        expect(compileLogic(logic)).toBe('({a} <> 1) or ({b} <> 2)');
        expect(parseLogic(compileLogic(logic))).toEqual(logic);
    });

    it('hide + ANY flips connective to and', () => {
        const logic = {
            action: 'hide',
            match: 'any',
            rules: [
                { field: 'a', op: '>', value: 1 },
                { field: 'b', op: 'contains', value: 'z' },
            ],
        };
        expect(compileLogic(logic)).toBe("({a} <= 1) and ({b} notcontains 'z')");
        expect(parseLogic(compileLogic(logic))).toEqual(logic);
    });

    it('show + ANY round-trips', () => {
        const logic = {
            action: 'show',
            match: 'any',
            rules: [
                { field: 'a', op: '=', value: 'foo' },
                { field: 'b', op: 'notempty' },
            ],
        };
        expect(parseLogic(compileLogic(logic))).toEqual(logic);
    });
});

describe('expressions.parseLogic — direct parsing', () => {
    it('null / empty -> null', () => {
        expect(parseLogic(null)).toBeNull();
        expect(parseLogic(undefined)).toBeNull();
        expect(parseLogic('')).toBeNull();
        expect(parseLogic('   ')).toBeNull();
    });

    it('parses a single quoted-string equality', () => {
        expect(parseLogic("({status} = 'active')")).toEqual({
            action: 'show',
            match: 'all',
            rules: [{ field: 'status', op: '=', value: 'active' }],
        });
    });

    it('parses an unparenthesised single rule', () => {
        expect(parseLogic('{age} >= 18')).toEqual({
            action: 'show',
            match: 'all',
            rules: [{ field: 'age', op: '>=', value: 18 }],
        });
    });

    it('parses or-of-= on the same field as anyof', () => {
        expect(parseLogic("({c} = 'x') or ({c} = 'y')")).toEqual({
            action: 'show',
            match: 'all',
            rules: [{ field: 'c', op: 'anyof', value: ['x', 'y'] }],
        });
    });
});

describe('expressions.parseLogic — advanced fallback', () => {
    it('mixed and/or at top level -> advanced', () => {
        const expr = '{a} = 1 or ({b} = 2 and {c} = 3)';
        expect(parseLogic(expr)).toEqual({ advanced: expr });
    });

    it('function calls -> advanced', () => {
        const expr = 'age({dob}) > 18';
        expect(parseLogic(expr)).toEqual({ advanced: expr });
    });

    it('unknown operator -> advanced', () => {
        const expr = '{a} between 1 and 5';
        expect(parseLogic(expr)).toEqual({ advanced: expr });
    });

    it('advanced survives compile -> parse', () => {
        const expr = '{a} = 1 or ({b} = 2 and {c} = 3)';
        expect(parseLogic(compileLogic({ advanced: expr }))).toEqual({ advanced: expr });
    });
});

describe('expressions.compileLogic — disable (enableIf body)', () => {
    it('"disable when g=MALE" compiles to NOT(g=MALE) i.e. (g <> MALE)', () => {
        expect(compileLogic({
            action: 'disable',
            match: 'all',
            rules: [{ field: 'g', op: '=', value: 'MALE' }],
        })).toBe("({g} <> 'MALE')");
    });

    it('shares the De Morgan body with hide (only the target differs)', () => {
        const rules = [{ field: 'g', op: '=', value: 'MALE' }];
        const disable = compileLogic({ action: 'disable', match: 'all', rules });
        const hide = compileLogic({ action: 'hide', match: 'all', rules });
        expect(disable).toBe(hide);
    });

    it('disable + ALL flips the connective to or (enabled-when)', () => {
        expect(compileLogic({
            action: 'disable',
            match: 'all',
            rules: [
                { field: 'a', op: '=', value: 1 },
                { field: 'b', op: '=', value: 2 },
            ],
        })).toBe('({a} <> 1) or ({b} <> 2)');
    });

    it('disable + anyof expands to and-of-<>', () => {
        expect(compileLogic({
            action: 'disable',
            match: 'all',
            rules: [{ field: 'c', op: 'anyof', value: ['x', 'y'] }],
        })).toBe("(({c} <> 'x') and ({c} <> 'y'))");
    });
});

describe('expressions.parseEnableExpression — disable round-trip, EVERY operator', () => {
    // The critical guarantee: a "Disable when X" block survives
    // compile -> enableIf string -> parse for every operator and both match
    // modes. parseLogic's show/hide polarity heuristic can flip ordered
    // comparisons, so we recompile the parsed result and compare to dodge that
    // ambiguity — the disable rule set must be *semantically* the original X.
    const opSamples = {
        '=': { value: 'MALE' },
        '<>': { value: 'MALE' },
        '>': { value: 5 },
        '<': { value: 5 },
        '>=': { value: 5 },
        '<=': { value: 5 },
        contains: { value: 'foo' },
        notcontains: { value: 'foo' },
        empty: {},
        notempty: {},
        anyof: { value: ['x', 'y'] },
    };

    // Covers the whole canonical operator set.
    expect(Object.keys(opSamples).sort()).toEqual([...OPERATORS].sort());

    for (const match of ['all', 'any']) {
        for (const [op, extra] of Object.entries(opSamples)) {
            it(`round-trips disable + ${op} (match=${match})`, () => {
                const original = {
                    action: 'disable',
                    match,
                    rules: [{ field: 'g', op, ...extra }],
                };
                const enableIf = compileLogic(original);
                expect(typeof enableIf).toBe('string');

                const parsed = parseEnableExpression(enableIf);
                expect(parsed.action).toBe('disable');

                // Recompile-and-compare: the parsed disable block must produce
                // the identical enableIf string (i.e. the same X condition).
                expect(compileLogic(parsed)).toBe(enableIf);
            });
        }
    }

    it('round-trips a multi-rule disable block (both match modes)', () => {
        for (const match of ['all', 'any']) {
            const original = {
                action: 'disable',
                match,
                rules: [
                    { field: 'a', op: '=', value: 1 },
                    { field: 'b', op: 'contains', value: 'z' },
                ],
            };
            const enableIf = compileLogic(original);
            const parsed = parseEnableExpression(enableIf);
            expect(parsed.action).toBe('disable');
            expect(compileLogic(parsed)).toBe(enableIf);
        }
    });

    it('keeps the disable rules as the DISABLE condition (not the enable condition)', () => {
        // enableIf = (g <> MALE) means "enabled while g != MALE" => disabled when g == MALE.
        const parsed = parseEnableExpression("({g} <> 'MALE')");
        expect(parsed).toEqual({
            action: 'disable',
            match: 'all',
            rules: [{ field: 'g', op: '=', value: 'MALE' }],
        });
    });

    it('exposes INVERSE_OPERATOR with full coverage of binary operators', () => {
        for (const op of OPERATORS) {
            if (op === 'anyof') {
                continue; // anyof has no single-operator inverse (expands to and-of-<>)
            }
            expect(INVERSE_OPERATOR[op]).toBeDefined();
            // Inversion is an involution.
            expect(INVERSE_OPERATOR[INVERSE_OPERATOR[op]]).toBe(op);
        }
    });
});

describe('expressions.parseEnableExpression — non-canonical & empty', () => {
    it('null / empty -> null', () => {
        expect(parseEnableExpression(null)).toBeNull();
        expect(parseEnableExpression(undefined)).toBeNull();
        expect(parseEnableExpression('')).toBeNull();
        expect(parseEnableExpression('   ')).toBeNull();
    });

    it('function-call expression -> advanced tagged for enable', () => {
        const expr = 'age({dob}) > 18';
        expect(parseEnableExpression(expr)).toEqual({ advanced: expr, target: 'enable' });
    });

    it('mixed and/or expression -> advanced tagged for enable', () => {
        const expr = '{a} = 1 or ({b} = 2 and {c} = 3)';
        expect(parseEnableExpression(expr)).toEqual({ advanced: expr, target: 'enable' });
    });
});

describe('expressions.compileLogic — advanced target routing', () => {
    it('an advanced block tagged target:enable still returns the raw expression', () => {
        // compileLogic returns the body either way; the serializer routes it to
        // enableIf vs visibleIf based on the target.
        const expr = 'age({dob}) > 18';
        expect(compileLogic({ advanced: expr, target: 'enable' })).toBe(expr);
        expect(compileLogic({ advanced: expr })).toBe(expr);
    });
});

describe('expressions.compileLogic — incomplete rules are ignored', () => {
    it('drops a value-operator rule whose value is empty (the {id} = "" trap)', () => {
        // A freshly-added condition seeds value:'' before the user types — it must
        // NOT compile into a field-hiding visibleIf.
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'id', op: '=', value: '' }] }))
            .toBeUndefined();
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'q1', op: 'contains', value: null }] }))
            .toBeUndefined();
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'q1', op: '>', value: undefined }] }))
            .toBeUndefined();
    });

    it('keeps only the complete rules when some are incomplete', () => {
        const expr = compileLogic({
            action: 'show',
            match: 'all',
            rules: [
                { field: 'a', op: '=', value: '' },        // incomplete -> dropped
                { field: 'b', op: '=', value: 'x' },        // complete -> kept
            ],
        });
        expect(expr).toBe("({b} = 'x')");
    });

    it('treats empty/notempty as always active (no value needed)', () => {
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'a', op: 'notempty' }] }))
            .toBe('({a} notempty)');
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'a', op: 'empty', value: '' }] }))
            .toBe('({a} empty)');
    });

    it('keeps falsy-but-valid values (false / 0)', () => {
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'flag', op: '=', value: false }] }))
            .toBe('({flag} = false)');
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'n', op: '=', value: 0 }] }))
            .toBe('({n} = 0)');
    });

    it('drops an anyof rule with an empty list, keeps it with items', () => {
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'c', op: 'anyof', value: [] }] }))
            .toBeUndefined();
        expect(compileLogic({ action: 'show', match: 'all', rules: [{ field: 'c', op: 'anyof', value: ['x', 'y'] }] }))
            .toBe("({c} anyof ['x', 'y'])");
    });
});
