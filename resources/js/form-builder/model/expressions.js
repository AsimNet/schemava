/**
 * Logic rules <-> SurveyJS expression strings.
 *
 * Canonical grammar (the only form `parseLogic` recognises; anything else
 * round-trips through `{ advanced: rawExpression }`):
 *
 *   rule:     ({fieldName} op operand)
 *   op:       =  <>  >  <  >=  <=  contains  notcontains  empty  notempty  anyof
 *   operand:  'single-quoted string' | bareNumber | true | false | [a, b]  (anyof only)
 *   combine:  ` and ` (match=all) / ` or ` (match=any), each rule parenthesised
 *
 *   action=show -> visibleIf = expr
 *   action=hide -> De Morgan inversion of every rule + flipped connective; an
 *                  `anyof [..]` expands to an or-of-`=` first, then inverts to
 *                  an and-of-`<>`. `parseLogic` recognises that inverted form
 *                  and reports it back as action=hide.
 */

export const OPERATORS = [
    '=', '<>', '>', '<', '>=', '<=', 'contains', 'notcontains', 'empty', 'notempty', 'anyof',
];

/** Operators that take no operand. */
const NULLARY_OPERATORS = ['empty', 'notempty'];

/** De Morgan inversion of each binary operator. */
export const INVERSE_OPERATOR = {
    '=': '<>',
    '<>': '=',
    '>': '<=',
    '<=': '>',
    '<': '>=',
    '>=': '<',
    contains: 'notcontains',
    notcontains: 'contains',
    empty: 'notempty',
    notempty: 'empty',
};

/* ------------------------------------------------------------------ compile */

/**
 * Format a JS value as a SurveyJS operand literal.
 *
 * @param {unknown} value
 * @returns {string}
 */
function formatOperand(value) {
    if (value === true || value === false) {
        return value ? 'true' : 'false';
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    if (value === null || value === undefined) {
        return "''";
    }

    return `'${String(value).replace(/'/g, "\\'")}'`;
}

/**
 * A single rule -> `({field} op operand)`.
 *
 * @param {{field: string, op: string, value?: unknown}} rule
 * @returns {string}
 */
function compileRule(rule) {
    const field = `{${rule.field}}`;

    if (NULLARY_OPERATORS.includes(rule.op)) {
        return `(${field} ${rule.op})`;
    }

    if (rule.op === 'anyof') {
        const items = Array.isArray(rule.value) ? rule.value : [];
        return `(${field} anyof [${items.map(formatOperand).join(', ')}])`;
    }

    return `(${field} ${rule.op} ${formatOperand(rule.value)})`;
}

/**
 * Inverted (action=hide) form of a single rule.
 *
 * @param {{field: string, op: string, value?: unknown}} rule
 * @returns {string}
 */
function compileInvertedRule(rule) {
    const field = `{${rule.field}}`;

    if (rule.op === 'anyof') {
        const items = Array.isArray(rule.value) ? rule.value : [];
        const parts = items.map((item) => `(${field} <> ${formatOperand(item)})`);
        const body = parts.length > 0 ? parts.join(' and ') : `(${field} empty)`;

        return parts.length > 1 ? `(${body})` : body;
    }

    const inverseOp = INVERSE_OPERATOR[rule.op] ?? rule.op;

    if (NULLARY_OPERATORS.includes(inverseOp)) {
        return `(${field} ${inverseOp})`;
    }

    return `(${field} ${inverseOp} ${formatOperand(rule.value)})`;
}

/**
 * Is a rule fully specified enough to take effect? An incomplete rule must NOT
 * compile into a condition, or a half-configured row silently breaks the field
 * (e.g. a freshly-added `{id} = ''` would hide the field for everyone, since the
 * value input defaults to an empty string before the user types anything).
 *
 * - `empty` / `notempty` need no operand → always active.
 * - `anyof` needs a non-empty list.
 * - every other operator needs a real value; `''`/`null`/`undefined` means the
 *   row isn't filled in yet. `false`/`0`/`true` ARE valid values and are kept.
 *   (To test for emptiness, use the `empty` / `notempty` operators.)
 *
 * @param {{field?: string, op?: string, value?: unknown}} rule
 * @returns {boolean}
 */
function isActiveRule(rule) {
    if (!rule || !rule.field || !rule.op) {
        return false;
    }
    if (NULLARY_OPERATORS.includes(rule.op)) {
        return true;
    }
    if (rule.op === 'anyof') {
        return Array.isArray(rule.value) && rule.value.length > 0;
    }

    return rule.value !== '' && rule.value !== null && rule.value !== undefined;
}

/**
 * {action, match, rules} | {advanced} -> SurveyJS expression string.
 *
 * @param {object|null|undefined} logic
 * @returns {string|undefined}
 */
export function compileLogic(logic) {
    if (!logic) {
        return undefined;
    }

    if (typeof logic.advanced === 'string') {
        const trimmed = logic.advanced.trim();
        return trimmed === '' ? undefined : trimmed;
    }

    const rules = Array.isArray(logic.rules) ? logic.rules.filter(isActiveRule) : [];
    if (rules.length === 0) {
        return undefined;
    }

    // `show` keeps every rule as-is; `hide` and `disable` share the same De
    // Morgan inversion of the rule set (they only differ in the target SurveyJS
    // property the serializer routes the result to — visibleIf vs enableIf).
    const inverted = logic.action === 'hide' || logic.action === 'disable';

    if (!inverted) {
        const connective = logic.match === 'any' ? ' or ' : ' and ';
        return rules.map(compileRule).join(connective);
    }

    // hide/disable: De Morgan — invert every rule, flip the connective.
    const connective = logic.match === 'any' ? ' and ' : ' or ';
    return rules.map(compileInvertedRule).join(connective);
}

/* -------------------------------------------------------------------- parse */

/**
 * Split an expression on a top-level ` and `/` or ` keyword, honouring
 * parentheses and single-quoted strings. Returns the segments plus the single
 * connective used, or `null` when the connectives are mixed at this level.
 *
 * @param {string} expr
 * @returns {{connective: 'and'|'or', segments: string[]}|null}
 */
function splitTopLevel(expr) {
    /** @type {string[]} */
    const segments = [];
    let depth = 0;
    let inString = false;
    let buffer = '';
    /** @type {'and'|'or'|null} */
    let connective = null;
    let i = 0;

    while (i < expr.length) {
        const ch = expr[i];

        if (inString) {
            buffer += ch;
            if (ch === '\\' && i + 1 < expr.length) {
                buffer += expr[i + 1];
                i += 2;
                continue;
            }
            if (ch === "'") {
                inString = false;
            }
            i += 1;
            continue;
        }

        if (ch === "'") {
            inString = true;
            buffer += ch;
            i += 1;
            continue;
        }

        if (ch === '(') {
            depth += 1;
            buffer += ch;
            i += 1;
            continue;
        }

        if (ch === ')') {
            depth -= 1;
            buffer += ch;
            i += 1;
            continue;
        }

        if (depth === 0) {
            const ahead5 = expr.slice(i, i + 5).toLowerCase();
            const ahead4 = expr.slice(i, i + 4).toLowerCase();
            const isAnd = ahead5 === ' and ' && /\s/.test(expr[i]) && /\s/.test(expr[i + 4]);
            const isOr = ahead4 === ' or ' && /\s/.test(expr[i]) && /\s/.test(expr[i + 3]);

            if (isAnd) {
                if (connective === 'or') {
                    return null;
                }
                connective = 'and';
                segments.push(buffer.trim());
                buffer = '';
                i += 5;
                continue;
            }

            if (isOr) {
                if (connective === 'and') {
                    return null;
                }
                connective = 'or';
                segments.push(buffer.trim());
                buffer = '';
                i += 4;
                continue;
            }
        }

        buffer += ch;
        i += 1;
    }

    if (depth !== 0 || inString) {
        return null;
    }

    segments.push(buffer.trim());

    return { connective: connective ?? 'and', segments };
}

/**
 * Strip a single layer of balanced outer parentheses, if present.
 *
 * @param {string} expr
 * @returns {string}
 */
function stripOuterParens(expr) {
    let result = expr.trim();

    while (result.startsWith('(') && result.endsWith(')')) {
        let depth = 0;
        let inString = false;
        let wraps = true;

        for (let i = 0; i < result.length; i += 1) {
            const ch = result[i];

            if (inString) {
                if (ch === '\\') {
                    i += 1;
                } else if (ch === "'") {
                    inString = false;
                }
                continue;
            }

            if (ch === "'") {
                inString = true;
            } else if (ch === '(') {
                depth += 1;
            } else if (ch === ')') {
                depth -= 1;
                if (depth === 0 && i !== result.length - 1) {
                    wraps = false;
                    break;
                }
            }
        }

        if (!wraps || depth !== 0) {
            break;
        }

        result = result.slice(1, -1).trim();
    }

    return result;
}

/**
 * Parse a single operand literal.
 *
 * @param {string} token
 * @returns {{ok: boolean, value?: unknown}}
 */
function parseOperand(token) {
    const trimmed = token.trim();

    if (trimmed === '') {
        return { ok: false };
    }

    if (trimmed === 'true') {
        return { ok: true, value: true };
    }
    if (trimmed === 'false') {
        return { ok: true, value: false };
    }

    if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
        const inner = trimmed.slice(1, -1).replace(/\\'/g, "'");
        return { ok: true, value: inner };
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return { ok: true, value: Number(trimmed) };
    }

    return { ok: false };
}

/**
 * Split the contents of an `anyof [..]` bracket on top-level commas.
 *
 * @param {string} inner
 * @returns {string[]}
 */
function splitArrayItems(inner) {
    /** @type {string[]} */
    const items = [];
    let buffer = '';
    let inString = false;

    for (let i = 0; i < inner.length; i += 1) {
        const ch = inner[i];

        if (inString) {
            buffer += ch;
            if (ch === '\\' && i + 1 < inner.length) {
                buffer += inner[i + 1];
                i += 1;
            } else if (ch === "'") {
                inString = false;
            }
            continue;
        }

        if (ch === "'") {
            inString = true;
            buffer += ch;
            continue;
        }

        if (ch === ',') {
            items.push(buffer.trim());
            buffer = '';
            continue;
        }

        buffer += ch;
    }

    if (buffer.trim() !== '') {
        items.push(buffer.trim());
    }

    return items;
}

/**
 * Parse a single atomic rule expression like `{field} op operand`.
 *
 * @param {string} segment
 * @returns {{field: string, op: string, value?: unknown}|null}
 */
function parseAtom(segment) {
    const expr = stripOuterParens(segment);
    const match = expr.match(/^\{([^}]+)\}\s*(.*)$/s);
    if (!match) {
        return null;
    }

    const field = match[1];
    const rest = match[2].trim();

    if (rest === 'empty' || rest === 'notempty') {
        return { field, op: rest };
    }

    const anyofMatch = rest.match(/^anyof\s*\[(.*)\]$/s);
    if (anyofMatch) {
        const items = splitArrayItems(anyofMatch[1]);
        const values = [];
        for (const item of items) {
            const parsed = parseOperand(item);
            if (!parsed.ok) {
                return null;
            }
            values.push(parsed.value);
        }

        return { field, op: 'anyof', value: values };
    }

    const opMatch = rest.match(/^(<>|>=|<=|=|>|<|contains|notcontains)\s+(.*)$/s);
    if (!opMatch) {
        return null;
    }

    const op = opMatch[1];
    const operand = parseOperand(opMatch[2]);
    if (!operand.ok) {
        return null;
    }

    return { field, op, value: operand.value };
}

/**
 * Recursively parse an expression into a boolean AST of comparison atoms.
 * Returns `null` if any leaf is not a recognised atom or connectives are mixed.
 *
 * @param {string} expr
 * @returns {object|null}
 */
function parseAst(expr) {
    const stripped = stripOuterParens(expr);
    const split = splitTopLevel(stripped);

    if (!split) {
        return null;
    }

    if (split.segments.length === 1) {
        return parseAtom(split.segments[0]);
    }

    const children = [];
    for (const segment of split.segments) {
        const child = parseAst(segment);
        if (!child) {
            return null;
        }
        children.push(child);
    }

    return { type: split.connective, children };
}

/**
 * De Morgan inversion of an AST: push NOT to the leaves, inverting each
 * operator and flipping and/or.
 *
 * @param {object} node
 * @returns {object}
 */
function invertAst(node) {
    if (node.type === 'and' || node.type === 'or') {
        return {
            type: node.type === 'and' ? 'or' : 'and',
            children: node.children.map(invertAst),
        };
    }

    if (node.op === 'anyof') {
        // anyof expands to or-of-= ; inverted that is and-of-<>.
        return {
            type: 'and',
            children: (node.value ?? []).map((value) => ({ field: node.field, op: '<>', value })),
        };
    }

    return { field: node.field, op: INVERSE_OPERATOR[node.op] ?? node.op, value: node.value };
}

/**
 * Try to read an AST as a flat list of rules (canonical "show" shape).
 * Collapses a flat `or` of `=` atoms on a single field into one `anyof` rule.
 *
 * @param {object} node
 * @returns {{match: 'all'|'any', rules: Array}|null}
 */
function astToRules(node) {
    // A bare atom = single-rule, match=all.
    if (node.field && node.op) {
        return { match: 'all', rules: [{ ...node }] };
    }

    if (node.type !== 'and' && node.type !== 'or') {
        return null;
    }

    // No nested groups allowed in the canonical flat shape.
    if (node.children.some((child) => child.type === 'and' || child.type === 'or')) {
        return null;
    }

    if (node.type === 'or') {
        const fields = new Set(node.children.map((child) => child.field));
        const allEquals = node.children.every((child) => child.op === '=');
        if (node.children.length > 1 && allEquals && fields.size === 1) {
            return {
                match: 'all',
                rules: [{
                    field: node.children[0].field,
                    op: 'anyof',
                    value: node.children.map((child) => child.value),
                }],
            };
        }
    }

    return {
        match: node.type === 'and' ? 'all' : 'any',
        rules: node.children.map((child) => ({ ...child })),
    };
}

/**
 * "Positive" operators — the form a builder rule is normally expressed in.
 * `<>`, `notcontains` and `empty` are their De Morgan images and read as a
 * negation, so an expression built only from those is preferentially
 * interpreted as an inverted (action=hide) rule set.
 */
const POSITIVE_OPS = new Set(['=', '>', '<', '>=', '<=', 'contains', 'notempty', 'anyof']);

/**
 * @param {Array<{op: string}>} rules
 * @returns {boolean}
 */
function allPositive(rules) {
    return rules.length > 0 && rules.every((rule) => POSITIVE_OPS.has(rule.op));
}

/**
 * Normalise a rule for value-comparison (drops undefined value keys).
 *
 * @param {{field: string, op: string, value?: unknown}} rule
 * @returns {string}
 */
function ruleKey(rule) {
    const value = rule.value === undefined ? null : rule.value;
    return JSON.stringify([rule.field, rule.op, value]);
}

/**
 * Normalise an AST for semantic comparison: expand `anyof [..]` into an
 * or-of-`=`, flatten nested same-type groups, and unwrap single-child groups.
 *
 * @param {object} node
 * @returns {object}
 */
function normalizeAst(node) {
    if (node.type === 'and' || node.type === 'or') {
        /** @type {object[]} */
        const flattened = [];
        for (const child of node.children) {
            const normalizedChild = normalizeAst(child);
            if (normalizedChild.type === node.type) {
                flattened.push(...normalizedChild.children);
            } else {
                flattened.push(normalizedChild);
            }
        }

        if (flattened.length === 1) {
            return flattened[0];
        }

        return { type: node.type, children: flattened };
    }

    if (node.op === 'anyof') {
        const values = node.value ?? [];
        const atoms = values.map((value) => ({ field: node.field, op: '=', value }));
        if (atoms.length === 1) {
            return atoms[0];
        }
        if (atoms.length === 0) {
            return { ...node };
        }
        return { type: 'or', children: atoms };
    }

    return { field: node.field, op: node.op, value: node.value };
}

/**
 * Structural equality of two parsed ASTs after normalisation.
 *
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
function astEqual(a, b) {
    if (!a || !b) {
        return false;
    }

    return astEqualRaw(normalizeAst(a), normalizeAst(b));
}

/**
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
function astEqualRaw(a, b) {
    if ((a.type === 'and' || a.type === 'or') && a.type === b.type) {
        if (a.children.length !== b.children.length) {
            return false;
        }
        return a.children.every((child, index) => astEqualRaw(child, b.children[index]));
    }

    if (a.field && b.field) {
        return ruleKey(a) === ruleKey(b);
    }

    return false;
}

/**
 * Does compiling `candidate` reproduce the same semantic AST as `ast`?
 *
 * @param {object} ast
 * @param {{action: string, match: string, rules: Array}} candidate
 * @returns {boolean}
 */
function semanticMatches(ast, candidate) {
    const compiled = compileLogic(candidate);
    if (!compiled) {
        return false;
    }

    return astEqual(ast, parseAst(compiled));
}

/**
 * SurveyJS expression -> {action, match, rules} | {advanced} | null.
 *
 * Disambiguation between show and hide (compile is many-to-one) uses operator
 * polarity: a fully-positive rule set reads as `show`; an expression whose
 * inverse is fully positive reads as `hide`. Genuinely ambiguous ordered
 * comparisons (e.g. a lone `<=`) default to `show`.
 *
 * @param {string|null|undefined} expression
 * @returns {{action: string, match: string, rules: Array}|{advanced: string}|null}
 */
export function parseLogic(expression) {
    if (expression === null || expression === undefined) {
        return null;
    }

    const trimmed = String(expression).trim();
    if (trimmed === '') {
        return null;
    }

    const ast = parseAst(trimmed);
    if (!ast) {
        return { advanced: trimmed };
    }

    const showRules = astToRules(ast);
    const hideRules = astToRules(invertAst(ast));

    const showCandidate = showRules
        ? { action: 'show', match: showRules.match, rules: showRules.rules }
        : null;
    const hideCandidate = hideRules
        ? { action: 'hide', match: hideRules.match, rules: hideRules.rules }
        : null;

    // 1. Fully-positive show reading wins.
    if (showCandidate && allPositive(showCandidate.rules) && semanticMatches(ast, showCandidate)) {
        return showCandidate;
    }

    // 2. Otherwise, a fully-positive *inverted* reading => hide.
    if (hideCandidate && allPositive(hideCandidate.rules) && semanticMatches(ast, hideCandidate)) {
        return hideCandidate;
    }

    // 3. Mixed/ordered-only: default to show when it reproduces the input.
    if (showCandidate && semanticMatches(ast, showCandidate)) {
        return showCandidate;
    }

    // 4. Last resort: a hide reading that reproduces the input.
    if (hideCandidate && semanticMatches(ast, hideCandidate)) {
        return hideCandidate;
    }

    return { advanced: trimmed };
}

/* ------------------------------------------------------------- enableIf side */

/** Flip a match mode (used when negating a whole rule set). */
function flipMatch(match) {
    return match === 'any' ? 'all' : 'any';
}

/**
 * Negate a single builder rule for the `disable`/`enable` round-trip.
 *
 * `anyof` is the one operator without a single-operator inverse — its negation
 * is "none of", an and-of-`<>` — so it is returned as a structural marker the
 * caller expands. Every other operator flips via `INVERSE_OPERATOR`.
 *
 * @param {{field: string, op: string, value?: unknown}} rule
 * @returns {{field: string, op: string, value?: unknown}|{__expand: 'none', field: string, value: unknown[]}}
 */
function invertRule(rule) {
    if (rule.op === 'anyof') {
        return { __expand: 'none', field: rule.field, value: Array.isArray(rule.value) ? rule.value : [] };
    }

    const op = INVERSE_OPERATOR[rule.op] ?? rule.op;
    if (NULLARY_OPERATORS.includes(op)) {
        return { field: rule.field, op };
    }

    return { field: rule.field, op, value: rule.value };
}

/**
 * Negate a parsed show-shape `{match, rules}` into the disable condition X.
 *
 * X = NOT(E) where E is the enable condition the rules describe. Pushes the
 * negation to the leaves (invert each rule) and flips the connective. Returns
 * `null` when an `anyof` rule prevents a clean single-operator-per-rule result
 * (the caller then falls back to advanced).
 *
 * @param {{match: 'all'|'any', rules: Array}} parsed
 * @returns {{match: 'all'|'any', rules: Array}|null}
 */
function negateRuleSet(parsed) {
    const inverted = parsed.rules.map(invertRule);

    // A lone `anyof` negates cleanly to a single and-of-`<>` rule set.
    if (inverted.length === 1 && inverted[0].__expand === 'none') {
        const items = inverted[0].value;
        if (items.length === 0) {
            return null;
        }
        if (items.length === 1) {
            return { match: 'all', rules: [{ field: inverted[0].field, op: '<>', value: items[0] }] };
        }

        return {
            match: 'all',
            rules: items.map((value) => ({ field: inverted[0].field, op: '<>', value })),
        };
    }

    // Any other `anyof` mixed with sibling rules has no clean builder shape.
    if (inverted.some((rule) => rule.__expand === 'none')) {
        return null;
    }

    return { match: flipMatch(parsed.match), rules: inverted };
}

/**
 * Parse a SurveyJS `enableIf` expression back into a builder disable block.
 *
 * `enableIf` is the *enabled-when* condition E; the builder edits the
 * *disabled-when* condition X = NOT(E). `parseLogic` reads E as either a `show`
 * (E ⟺ rules) or a `hide` (E ⟺ NOT rules) shape — we must not assume which —
 * so we derive X from whichever polarity it reports and verify by recompiling.
 *
 * Returns `{action:'disable', match, rules}` for a canonical expression,
 * `{advanced, target:'enable'}` for a non-canonical one, or `null` for empty.
 *
 * @param {string|null|undefined} expression
 * @returns {{action: 'disable', match: 'all'|'any', rules: Array}|{advanced: string, target: 'enable'}|null}
 */
export function parseEnableExpression(expression) {
    if (expression === null || expression === undefined) {
        return null;
    }

    const trimmed = String(expression).trim();
    if (trimmed === '') {
        return null;
    }

    const parsed = parseLogic(trimmed);

    // Non-canonical (function call etc.) -> advanced, tagged for enableIf.
    if (!parsed || typeof parsed.advanced === 'string') {
        return { advanced: trimmed, target: 'enable' };
    }

    let disable = null;
    if (parsed.action === 'hide') {
        // E ⟺ NOT(rules) -> X = NOT(E) = rules (as-is).
        disable = { action: 'disable', match: parsed.match, rules: parsed.rules.map((rule) => ({ ...rule })) };
    } else {
        // E ⟺ rules -> X = NOT(E) = negation of the rule set.
        const negated = negateRuleSet(parsed);
        if (negated) {
            disable = { action: 'disable', match: negated.match, rules: negated.rules };
        }
    }

    // Verify the disable block recompiles to a semantically-equivalent enableIf.
    if (disable) {
        const recompiled = compileLogic(disable);
        const recompiledAst = recompiled ? parseAst(recompiled) : null;
        const inputAst = parseAst(trimmed);
        if (recompiledAst && inputAst && astEqual(inputAst, recompiledAst)) {
            return disable;
        }
    }

    // Could not reduce to a clean builder shape -> advanced enableIf passthrough.
    return { advanced: trimmed, target: 'enable' };
}
