/**
 * Pure UI helpers shared across the settings editors (Options / Logic / Quiz /
 * Choices / VariableMenu / prefill). Kept framework-free so they can be unit
 * tested in isolation — see tests/js/form-builder/ui-helpers.*.test.js.
 *
 * Nothing here mutates store state or touches the DOM; components own that.
 */

import { OPERATORS, compileLogic } from './model/expressions.js';

/* ----------------------------------------------------- predefined variables */

/**
 * Friendly bilingual labels for the predefined runtime-context variables.
 * Falls back to the raw key when a label is not catalogued.
 *
 * @type {Record<string, {ar: string, en: string}>}
 */
export const VARIABLE_LABELS = {
    id: { ar: 'المعرّف', en: 'ID' },
    user_family_id: { ar: 'الرقم التعريفي', en: 'Family ID' },
    full_name: { ar: 'الاسم الكامل', en: 'Full name' },
    user_first_name: { ar: 'الاسم الأول', en: 'First name' },
    short_name: { ar: 'الاسم الثنائي', en: 'Two-part name' },
    greeting: { ar: 'التحية', en: 'Greeting' },
    phone: { ar: 'الجوال', en: 'Phone' },
    email: { ar: 'البريد الإلكتروني', en: 'Email' },
    gender: { ar: 'الجنس', en: 'Gender' },
    dob: { ar: 'تاريخ الميلاد', en: 'Date of birth' },
    marital_status: { ar: 'الحالة الاجتماعية', en: 'Marital status' },
    is_system_admin: { ar: 'مدير النظام', en: 'System admin' },
    is_active_member: { ar: 'عضو نشط', en: 'Active member' },
    'user_region.title_ar': { ar: 'المنطقة', en: 'Region' },
    'membership.package.slug': { ar: 'باقة العضوية', en: 'Membership package' },
    package_title: { ar: 'اسم العضوية', en: 'Membership name' },
    'membership.expired_at': { ar: 'انتهاء العضوية', en: 'Membership expiry' },
};

/**
 * Resolve a friendly label for a predefined variable key in the active locale.
 *
 * @param {string} key
 * @param {'ar'|'en'} locale
 * @returns {string}
 */
export function variableLabel(key, locale = 'ar') {
    const entry = VARIABLE_LABELS[key];
    if (!entry) {
        return key;
    }

    return entry[locale] ?? entry.ar ?? key;
}

/**
 * Build the dropdown option list for a set of runtime-context keys.
 *
 * @param {string[]|undefined|null} keys
 * @param {'ar'|'en'} locale
 * @returns {Array<{key: string, label: string}>}
 */
export function variableOptions(keys, locale = 'ar') {
    return (Array.isArray(keys) ? keys : []).map((key) => ({
        key,
        label: variableLabel(key, locale),
    }));
}

/**
 * Build the question-reference option list for an expression-formula's
 * VariableMenu, from field entries as returned by `priorFields`/`allFieldEntries`.
 *
 * @param {Array<{name: string, label: {ar: string, en: string|null}}>|undefined|null} fields
 * @param {'ar'|'en'} locale
 * @returns {Array<{key: string, label: string}>}
 */
export function fieldReferenceOptions(fields, locale = 'ar') {
    return (Array.isArray(fields) ? fields : []).map((entry) => {
        const lstr = entry.label;
        const text = (locale === 'en' ? lstr?.en : lstr?.ar) ?? lstr?.ar ?? '';

        return { key: entry.name, label: text || entry.name };
    });
}

/**
 * Build the calculated-value-reference option list for an expression-formula's
 * VariableMenu. Calculated values have no separate label — the name doubles as
 * the display label. Entries without a name (not yet committed by the author)
 * are skipped.
 *
 * @param {Array<{name: string}>|undefined|null} calculatedValues
 * @returns {Array<{key: string, label: string}>}
 */
export function calculatedValueOptions(calculatedValues) {
    return (Array.isArray(calculatedValues) ? calculatedValues : [])
        .filter((entry) => entry && typeof entry.name === 'string' && entry.name !== '')
        .map((entry) => ({ key: entry.name, label: entry.name }));
}

/* ---------------------------------------------------------------- piping */

/** Matches a `{token}` reference (the SurveyJS piping syntax). */
const VARIABLE_TOKEN_RE = /\{[^{}\s]+\}/;

/**
 * Does the text contain at least one `{variable}` reference?
 *
 * @param {unknown} text
 * @returns {boolean}
 */
export function containsVariable(text) {
    return typeof text === 'string' && VARIABLE_TOKEN_RE.test(text);
}

/**
 * Insert `{key}` into `text` at `caret`, returning the new text plus the caret
 * position immediately after the inserted token. A negative/oversized caret
 * appends at the end.
 *
 * @param {string} text
 * @param {number} caret
 * @param {string} key
 * @returns {{text: string, caret: number}}
 */
export function insertVariableAt(text, caret, key) {
    const base = typeof text === 'string' ? text : '';
    const token = `{${key}}`;
    const at = Number.isInteger(caret) && caret >= 0 && caret <= base.length ? caret : base.length;
    const next = base.slice(0, at) + token + base.slice(at);

    return { text: next, caret: at + token.length };
}

/* ----------------------------------------------------------------- clipboard */

/**
 * Copy `text` to the clipboard, preferring the async Clipboard API and falling
 * back to a hidden `<textarea>` + `document.execCommand('copy')` for browsers
 * (or insecure contexts) where `navigator.clipboard` is unavailable. Pure of any
 * UI concerns (no toasts) so callers own the feedback. Resolves to whether the
 * copy is believed to have succeeded.
 *
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyTextToClipboard(text) {
    const value = String(text ?? '');
    if (value === '') {
        return false;
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(value);

            return true;
        } catch {
            /* fall through to the legacy textarea path */
        }
    }

    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
        return false;
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
        document.body.removeChild(textarea);

        return ok === true;
    } catch {
        return false;
    }
}

/* ------------------------------------------------------- statement html sanitize */

/** Matches a `<script>...</script>` block (any attributes), case-insensitive. */
const SCRIPT_BLOCK_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;

/** Matches a dangling/standalone `<script ...>` or `</script>` open/close tag. */
const SCRIPT_TAG_RE = /<\/?script\b[^>]*>/gi;

/**
 * Lightly sanitize admin-authored statement HTML: strip `<script>` blocks and
 * any stray script open/close tags. Admin-trust content, so this is intentionally
 * minimal (it does NOT attempt full XSS sanitization) — its sole job is to make
 * sure no `<script>` survives into the canvas preview or the stored html LStr.
 *
 * @param {unknown} html
 * @returns {string}
 */
export function sanitizeStatementHtml(html) {
    if (typeof html !== 'string' || html === '') {
        return '';
    }

    return html.replace(SCRIPT_BLOCK_RE, '').replace(SCRIPT_TAG_RE, '');
}

/* ------------------------------------------------------- file size (maxSize) */

const BYTES_PER_MB = 1024 * 1024;

/**
 * SurveyJS `maxSize` is stored in bytes; the UI edits megabytes. Convert a
 * byte count to a (rounded, 2-dp) MB number for display. Returns `null` when
 * unset so the input renders empty.
 *
 * @param {unknown} bytes
 * @returns {number|null}
 */
export function bytesToMb(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }

    return Math.round((value / BYTES_PER_MB) * 100) / 100;
}

/**
 * Convert a UI megabyte value back to bytes for the model. Returns `null` for
 * empty/invalid input so the prop is omitted on serialize.
 *
 * @param {unknown} mb
 * @returns {number|null}
 */
export function mbToBytes(mb) {
    const value = Number(mb);
    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }

    return Math.round(value * BYTES_PER_MB);
}

/* ----------------------------------------------------------------- operators */

/**
 * Bilingual operator labels for the logic editor.
 *
 * @type {Record<string, {ar: string, en: string}>}
 */
export const OPERATOR_LABELS = {
    '=': { ar: 'يساوي', en: 'equals' },
    '<>': { ar: 'لا يساوي', en: 'not equal' },
    '>': { ar: 'أكبر من', en: 'greater than' },
    '<': { ar: 'أصغر من', en: 'less than' },
    '>=': { ar: 'أكبر من أو يساوي', en: 'greater or equal' },
    '<=': { ar: 'أصغر من أو يساوي', en: 'less or equal' },
    contains: { ar: 'يحتوي على', en: 'contains' },
    notcontains: { ar: 'لا يحتوي على', en: 'does not contain' },
    empty: { ar: 'فارغ', en: 'is empty' },
    notempty: { ar: 'غير فارغ', en: 'is not empty' },
    anyof: { ar: 'أيٌّ من', en: 'any of' },
};

/**
 * @param {string} op
 * @param {'ar'|'en'} locale
 * @returns {string}
 */
export function operatorLabel(op, locale = 'ar') {
    const entry = OPERATOR_LABELS[op];
    if (!entry) {
        return op;
    }

    return entry[locale] ?? entry.ar ?? op;
}

/** Operators that take no operand (rendered without a value input). */
export const NULLARY_OPERATORS = ['empty', 'notempty'];

/** Operators that take an array operand (multi-select value input). */
export const ARRAY_OPERATORS = ['anyof'];

/**
 * The sensible operator set for a target field/variable type. Choice fields and
 * predefined variables get equality + membership + presence; ordered types
 * (number/rating/date) add comparisons; text gets substring ops; yes/no is
 * equality only.
 *
 * @param {string|null|undefined} fieldType  builder type, or null for a variable
 * @returns {string[]}
 */
export function operatorsForType(fieldType) {
    switch (fieldType) {
        case 'yes_no':
            return ['=', '<>'];
        case 'number':
        case 'rating':
        case 'date':
            return ['=', '<>', '>', '<', '>=', '<=', 'empty', 'notempty'];
        case 'single_choice':
        case 'dropdown':
            return ['=', '<>', 'anyof', 'empty', 'notempty'];
        case 'multi_choice':
            return ['contains', 'notcontains', 'anyof', 'empty', 'notempty'];
        case 'short_text':
        case 'long_text':
            return ['=', '<>', 'contains', 'notcontains', 'empty', 'notempty'];
        default:
            // Predefined variables (unknown shape) + any other field.
            return OPERATORS.filter((op) => op !== 'anyof');
    }
}

/**
 * The value-input shape an operator + target type expects.
 *
 * @param {string} op
 * @param {string|null|undefined} fieldType
 * @returns {'none'|'choice'|'choice-multi'|'boolean'|'number'|'date'|'text'}
 */
export function valueInputKind(op, fieldType) {
    if (NULLARY_OPERATORS.includes(op)) {
        return 'none';
    }
    if (ARRAY_OPERATORS.includes(op)) {
        if (['single_choice', 'multi_choice', 'dropdown'].includes(fieldType)) {
            return 'choice-multi';
        }

        return 'text';
    }
    if (['single_choice', 'multi_choice', 'dropdown'].includes(fieldType)) {
        return 'choice';
    }
    if (fieldType === 'yes_no') {
        return 'boolean';
    }
    if (fieldType === 'number' || fieldType === 'rating') {
        return 'number';
    }
    if (fieldType === 'date') {
        return 'date';
    }

    return 'text';
}

/* ---------------------------------------------------- predefined variable meta */

/**
 * Typed metadata for a predefined runtime variable, supplied by the server boot
 * payload (`variableMeta`). `null` when the key is uncatalogued (free text).
 *
 * @typedef {{kind: 'enum'|'boolean'|'date'|'number'|'text', options?: Array<{value: string, label: string}>}} VariableMeta
 */

/**
 * Look up the typed metadata for a predefined variable key.
 *
 * @param {Record<string, VariableMeta>|null|undefined} variableMeta
 * @param {string} key
 * @returns {VariableMeta|null}
 */
export function variableMetaFor(variableMeta, key) {
    if (!variableMeta || typeof variableMeta !== 'object') {
        return null;
    }
    const entry = variableMeta[key];

    return entry && typeof entry === 'object' && typeof entry.kind === 'string' ? entry : null;
}

/**
 * The value-input shape an operator expects for a predefined variable, given its
 * typed metadata. Nullary/array operators win first (mirroring {@link valueInputKind});
 * otherwise the variable's declared `kind` drives the input. Uncatalogued
 * variables (no meta) fall back to free text.
 *
 * @param {string} op
 * @param {VariableMeta|null|undefined} meta
 * @returns {'none'|'enum'|'boolean'|'date'|'number'|'text'}
 */
export function variableInputKind(op, meta) {
    if (NULLARY_OPERATORS.includes(op)) {
        return 'none';
    }
    if (ARRAY_OPERATORS.includes(op)) {
        // anyof is not offered for variables (operatorsForType(null) excludes it),
        // but stay defensive: an array operand has no typed widget here.
        return 'text';
    }
    if (!meta) {
        return 'text';
    }
    switch (meta.kind) {
        case 'enum':
            return 'enum';
        case 'boolean':
            return 'boolean';
        case 'date':
            return 'date';
        case 'number':
            return 'number';
        default:
            return 'text';
    }
}

/* ------------------------------------------------------------------- choices */

/**
 * Apply a label rename to a choice, mirroring the value when it still tracks the
 * old Arabic label (legacy string-item behaviour: `value === oldArabicLabel`).
 * Otherwise the explicit value is preserved.
 *
 * @param {{value: unknown, label: {ar: string, en: string|null}}} choice
 * @param {'ar'|'en'} locale  which label is being edited
 * @param {string} nextValue  the new label text
 * @returns {{value: unknown, label: {ar: string, en: string|null}}}
 */
export function renameChoiceLabel(choice, locale, nextValue) {
    const label = { ...(choice.label ?? { ar: '', en: null }) };
    const prevAr = label.ar ?? '';
    const mirrors = choice.value === prevAr;

    if (locale === 'en') {
        const prevEn = label.en ?? '';
        // With no Arabic text, English IS the primary content: keep the value
        // mirroring it (otherwise en-authored choices freeze on their seeded
        // value or end up with empty values in the SurveyJS JSON).
        const mirrorsEn = prevAr === ''
            && (choice.value === prevEn || choice.value === '' || choice.value === null || choice.value === undefined);
        label.en = nextValue === '' ? null : nextValue;

        return mirrorsEn ? { ...choice, label, value: nextValue } : { ...choice, label };
    }

    label.ar = nextValue;
    const value = mirrors ? nextValue : choice.value;

    return { ...choice, label, value };
}

let choiceUidCounter = 0;

/**
 * A process-unique, non-serialized stable id for a choice row. Used as the
 * `item-key` for choice lists so multiple blank choices (value === '') don't
 * collide on a shared key and confuse vuedraggable / Vue's keyed diffing. The
 * serializer strips it on output and re-assigns it on parse.
 *
 * @returns {string}
 */
export function choiceUid() {
    choiceUidCounter += 1;

    return `c_${choiceUidCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Build a fresh choice from an Arabic label line (value mirrors the label).
 * Carries a stable `_uid` (non-serialized) for keyed list rendering.
 *
 * @param {string} arText
 * @returns {{_uid: string, value: string, label: {ar: string, en: string|null}, raw: object}}
 */
export function makeChoice(labelText, locale = 'ar') {
    const text = (labelText ?? '').trim();

    // The seeded text belongs to the ACTIVE content locale — writing English
    // seed text into the Arabic slot made the Arabic preview show stale
    // defaults the author never saw in Build. The value mirrors the text
    // either way (SurveyJS choice values must not be empty).
    if (locale === 'en' && text !== '') {
        return { _uid: choiceUid(), value: text, label: { ar: '', en: text }, raw: {} };
    }

    return { _uid: choiceUid(), value: text, label: { ar: text, en: null }, raw: {} };
}

/**
 * Build a fresh matrixdropdown/matrixdynamic column (cell) definition with an
 * auto-generated unique `name` (`col_1`, `col_2`, …) and a plain-text cell type.
 * Carries a stable `_uid` for keyed list rendering, mirroring {@see makeChoice}.
 *
 * @param {string} labelText  the column title (active content locale)
 * @param {string[]} [existingNames]  column names already used on this field
 * @returns {{_uid: string, name: string, title: {ar: string, en: string|null}, cellType: string, isRequired: boolean, choices: null, raw: object}}
 */
export function makeMatrixColumn(labelText, existingNames = [], locale = 'ar') {
    const taken = new Set(existingNames);
    let n = 1;
    let name = `col_${n}`;
    while (taken.has(name)) {
        n += 1;
        name = `col_${n}`;
    }
    const text = (labelText ?? '').trim();

    return {
        _uid: choiceUid(),
        name,
        title: locale === 'en' && text !== '' ? { ar: '', en: text } : { ar: text, en: null },
        cellType: 'text',
        isRequired: false,
        choices: null,
        raw: {},
    };
}

/**
 * Build a fresh multipletext item with an auto-generated unique `name`
 * (`item_1`, `item_2`, …). Mirrors {@see makeMatrixColumn}'s shape/uid handling.
 *
 * @param {string} labelText  the item title (active content locale)
 * @param {string[]} [existingNames]  item names already used on this field
 * @returns {{_uid: string, name: string, title: {ar: string, en: string|null}, isRequired: boolean, raw: object}}
 */
export function makeTextItem(labelText, existingNames = [], locale = 'ar') {
    const taken = new Set(existingNames);
    let n = 1;
    let name = `item_${n}`;
    while (taken.has(name)) {
        n += 1;
        name = `item_${n}`;
    }

    const text = (labelText ?? '').trim();

    return {
        _uid: choiceUid(),
        name,
        title: locale === 'en' && text !== '' ? { ar: '', en: text } : { ar: text, en: null },
        isRequired: false,
        raw: {},
    };
}

/** Default Arabic item titles seeded onto a freshly added multipletext field. */
export const DEFAULT_TEXT_ITEM_LABELS = ['الحقل الأول', 'الحقل الثاني'];

/** English equivalents, used when the builder's active content locale is English. */
export const DEFAULT_TEXT_ITEM_LABELS_EN = ['Field 1', 'Field 2'];

/** Matrix-family cellType values choosable from the columns editor (matrixdropdown/matrixdynamic). */
export const MATRIX_CELL_TYPES = ['text', 'comment', 'checkbox', 'radiogroup', 'dropdown', 'boolean', 'rating'];

/** cellType values that carry their own `choices` list. */
export const MATRIX_CHOICE_CELL_TYPES = ['checkbox', 'radiogroup', 'dropdown'];

/** Default Arabic row labels seeded onto a freshly added matrix/matrixdropdown field. */
export const DEFAULT_MATRIX_ROW_LABELS = ['الصف الأول', 'الصف الثاني'];

/** English equivalents, used when the builder's active content locale is English. */
export const DEFAULT_MATRIX_ROW_LABELS_EN = ['Row 1', 'Row 2'];

/** Default Arabic column labels seeded onto a freshly added matrix field. */
export const DEFAULT_MATRIX_COLUMN_LABELS = ['العمود الأول', 'العمود الثاني'];

/** English equivalents, used when the builder's active content locale is English. */
export const DEFAULT_MATRIX_COLUMN_LABELS_EN = ['Column 1', 'Column 2'];

/**
 * Split bulk-pasted multiline text into one trimmed line per non-empty row.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitBulkLines(text) {
    return String(text ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '');
}

/**
 * Should the choice's value be surfaced to the user (because it diverged from
 * the Arabic label)? Used to show the value subtly as subtext/tooltip.
 *
 * @param {{value: unknown, label: {ar: string, en: string|null}}} choice
 * @returns {boolean}
 */
export function choiceValueDiverged(choice) {
    const ar = choice.label?.ar ?? '';

    return choice.value !== ar && choice.value !== '' && choice.value !== undefined && choice.value !== null;
}

/**
 * Set or clear a choice's `raw.imageLink` (imagepicker), addressing the choice by
 * its stable `_uid` rather than by list position.
 *
 * Image uploads are async, and the author stays free to reorder or delete choices
 * while one is in flight, so the index captured when the upload started may point
 * at a different choice — or past the end of the list — by the time it finishes.
 * Returns `null` when no choice carries `uid`, so callers can drop a result whose
 * target is gone instead of writing it somewhere wrong.
 *
 * @param {Array<{_uid: string, raw?: object}>} choices
 * @param {string} uid
 * @param {string|null} imageLink Link to set, or null to remove the image.
 * @returns {Array<object>|null} A new list, or null if `uid` is not present.
 */
export function withChoiceImageLink(choices, uid, imageLink) {
    const list = Array.isArray(choices) ? choices : [];
    const at = list.findIndex((choice) => choice?._uid === uid);

    if (at === -1) {
        return null;
    }

    const raw = { ...(list[at].raw ?? {}) };

    if (imageLink === null) {
        delete raw.imageLink;
    } else {
        raw.imageLink = imageLink;
    }

    const next = [...list];
    next[at] = { ...next[at], raw };

    return next;
}

/* --------------------------------------------------------- rating preview */

/** Default + bounds for the rating `rateMax` prop (mirrors the catalog). */
const RATE_MAX_DEFAULT = 5;
const RATE_MAX_MIN = 3;
const RATE_MAX_MAX = 10;

/** The standard 5-step smiley progression (worst → best), as emoji. */
export const SMILEY_PROGRESSION = ['😡', '🙁', '😐', '🙂', '😄'];

/**
 * Clamp a raw `rateMax` value into the catalog's 3..10 range, defaulting to 5
 * for missing/invalid input.
 *
 * @param {unknown} rateMax
 * @returns {number}
 */
export function normalizeRateMax(rateMax) {
    if (rateMax === null || rateMax === undefined || rateMax === '') {
        return RATE_MAX_DEFAULT;
    }
    const value = Number(rateMax);
    if (!Number.isFinite(value)) {
        return RATE_MAX_DEFAULT;
    }

    return Math.min(RATE_MAX_MAX, Math.max(RATE_MAX_MIN, Math.round(value)));
}

/**
 * Resolve a rating field's configured style into a render descriptor for the
 * canvas card preview (fix 3). `type` is the rate style; `items` is the row to
 * render: numbered pills `1..rateMax` for 'labels', a `rateMax`-long star row,
 * or a smiley row sampled from {@link SMILEY_PROGRESSION} stretched to rateMax.
 *
 * @param {{rateMax?: unknown, rateType?: unknown}|null|undefined} typeProps
 * @returns {{type: 'stars'|'labels'|'smileys', max: number, items: Array<number|string>}}
 */
export function ratingPreviewItems(typeProps) {
    const max = normalizeRateMax(typeProps?.rateMax);
    const rawType = typeProps?.rateType;
    const type = rawType === 'labels' || rawType === 'smileys' ? rawType : 'stars';

    if (type === 'labels') {
        return { type, max, items: Array.from({ length: max }, (_, i) => i + 1) };
    }

    if (type === 'smileys') {
        const items = Array.from({ length: max }, (_, i) => {
            // Map index 0..max-1 across the 5-step progression so the row always
            // runs worst→best regardless of rateMax.
            const ratio = max <= 1 ? 0 : i / (max - 1);
            const slot = Math.round(ratio * (SMILEY_PROGRESSION.length - 1));

            return SMILEY_PROGRESSION[slot];
        });

        return { type, max, items };
    }

    return { type, max, items: Array.from({ length: max }, (_, i) => i + 1) };
}

/* ------------------------------------------------ preview sample runtime data */

/**
 * Realistic Arabic sample values per runtime-context key, so the preview renders
 * piping / calculatedValues with believable family-social data instead of blanks.
 *
 * @type {Record<string, unknown>}
 */
export const PREVIEW_SAMPLE_VALUES = {
    id: 1024,
    full_name: 'محمد بن عبدالله التويجري',
    // `greeting` is a family-relational title, not a kunya — see User::getGreetingAttribute()
    // (female → 'ابنة العم'; male ≥55 → 'العم'; otherwise 'ابن العم'). The sample person is
    // male and ~36, so 'ابن العم'.
    greeting: 'ابن العم',
    phone: '966550000000',
    email: 'mohammed@example.com',
    // Enum VALUES (not labels) matching the runtime data contract, so conditions
    // such as {gender} = 'MALE' actually behave in preview.
    gender: 'MALE',
    dob: '1990-05-15',
    marital_status: 'MARRIED',
    is_system_admin: false,
    'user_region.title_ar': 'القصيم',
    'membership.package.slug': 'basic',
    'membership.expired_at': '2027-01-01',
};

/**
 * Build the sample runtime-data map injected into the preview survey (as both
 * survey data and variables) so `{key}` piping and runtime `calculatedValues`
 * resolve. Unknown keys get a readable placeholder derived from the key.
 *
 * @param {string[]|undefined|null} keys
 * @returns {Record<string, unknown>}
 */
export function previewSampleData(keys) {
    /** @type {Record<string, unknown>} */
    const data = {};
    for (const key of Array.isArray(keys) ? keys : []) {
        data[key] = Object.prototype.hasOwnProperty.call(PREVIEW_SAMPLE_VALUES, key)
            ? PREVIEW_SAMPLE_VALUES[key]
            : `عينة (${key})`;
    }

    return data;
}

/* ------------------------------------------------------ quiz preview scoring */

/**
 * Order-insensitive answer match mirroring `SurveyScoreCalculator::answersMatch`
 * (PHP). Array answers/correct values are stringified, sorted and compared;
 * scalars are compared as strings.
 *
 * @param {unknown} answer
 * @param {unknown} correct
 * @returns {boolean}
 */
export function quizAnswerMatches(answer, correct) {
    if (Array.isArray(answer) || Array.isArray(correct)) {
        const toSortedStrings = (value) => (Array.isArray(value) ? value : [value])
            .filter((entry) => entry !== undefined && entry !== null)
            .map((entry) => String(entry))
            .sort();
        const a = toSortedStrings(answer);
        const c = toSortedStrings(correct);

        return a.length === c.length && a.every((value, index) => value === c[index]);
    }

    return String(answer ?? '') === String(correct ?? '');
}

/**
 * Score the preview answers against the serialized SurveyJS JSON, mirroring
 * `SurveyScoreCalculator` (PHP): only elements carrying a `correctAnswer` count;
 * per-question `score` defaults to 1 and is clamped to >= 0; a score of 0 is
 * skipped entirely; nested panel/paneldynamic/flowpanel elements recurse.
 *
 * @param {object} surveyJson  serialized SurveyJS JSON (toSurveyJson output)
 * @param {Record<string, unknown>} answers  respondent answers keyed by name
 * @returns {{total: number, max: number, percent: number, questions: Array<{name: string, title: string, score: number, correct: boolean}>}}
 */
export function scoreQuizPreview(surveyJson, answers) {
    const questions = [];
    collectScorableQuestions(surveyJson?.pages, questions);

    let total = 0;
    let max = 0;
    const breakdown = [];
    const data = answers && typeof answers === 'object' ? answers : {};

    for (const question of questions) {
        const score = resolveQuizScore(question);
        if (score <= 0) {
            continue;
        }
        max += score;
        const correct = quizAnswerMatches(data[question.name], question.correctAnswer);
        if (correct) {
            total += score;
        }
        breakdown.push({
            name: question.name,
            title: questionDisplayTitle(question),
            score,
            correct,
        });
    }

    const percent = max > 0 ? Math.round((total / max) * 10000) / 100 : 0;

    return { total, max, percent, questions: breakdown };
}

const PANEL_TYPES = ['panel', 'paneldynamic', 'flowpanel'];

/**
 * Recurse pages/elements collecting elements that carry a `correctAnswer`,
 * descending into panel containers (mirrors the PHP extractor).
 *
 * @param {unknown} nodes
 * @param {Array<object>} out
 */
function collectScorableQuestions(nodes, out) {
    if (!Array.isArray(nodes)) {
        return;
    }
    for (const node of nodes) {
        if (!node || typeof node !== 'object') {
            continue;
        }
        if (Array.isArray(node.pages)) {
            collectScorableQuestions(node.pages, out);
        }
        if (PANEL_TYPES.includes(node.type)) {
            collectScorableQuestions(node.elements, out);

            continue;
        }
        if (Array.isArray(node.elements)) {
            collectScorableQuestions(node.elements, out);
        }
        if (Object.prototype.hasOwnProperty.call(node, 'correctAnswer') && typeof node.name === 'string' && node.name !== '') {
            out.push(node);
        }
    }
}

/**
 * @param {object} question
 * @returns {number}
 */
function resolveQuizScore(question) {
    if (!Object.prototype.hasOwnProperty.call(question, 'score')) {
        return 1;
    }
    const score = Number(question.score);

    return Number.isFinite(score) ? Math.max(0, score) : 1;
}

/**
 * Human-readable title for a scored question (localized object -> ar/default).
 *
 * @param {object} question
 * @returns {string}
 */
function questionDisplayTitle(question) {
    const title = question.title;
    if (typeof title === 'string') {
        return title;
    }
    if (title && typeof title === 'object') {
        return String(title.ar ?? title.default ?? Object.values(title)[0] ?? question.name);
    }

    return String(question.name ?? '');
}

/* ---------------------------------------------------------- logic map (fix 9) */

/**
 * Resolve an LStr-ish label into a plain string for the active locale, falling
 * back to Arabic then to the supplied fallback.
 *
 * @param {{ar?: string, en?: string|null}|null|undefined} lstr
 * @param {'ar'|'en'} locale
 * @param {string} fallback
 * @returns {string}
 */
function localeText(lstr, locale, fallback) {
    if (!lstr || typeof lstr !== 'object') {
        return fallback;
    }
    const text = (locale === 'en' ? lstr.en : lstr.ar) ?? lstr.ar ?? '';

    return text.trim() !== '' ? text : fallback;
}

/**
 * Human-readable label for a rule operand value, given the operator and locale.
 * Booleans become نعم/Yes — لا/No; arrays join with ، / ,; everything else is
 * stringified.
 *
 * @param {unknown} value
 * @param {string} op
 * @param {'ar'|'en'} locale
 * @returns {string}
 */
export function formatRuleValue(value, op, locale = 'ar') {
    if (NULLARY_OPERATORS.includes(op)) {
        return '';
    }
    if (value === true) {
        return locale === 'en' ? 'Yes' : 'نعم';
    }
    if (value === false) {
        return locale === 'en' ? 'No' : 'لا';
    }
    if (Array.isArray(value)) {
        return value.map((item) => String(item)).join(locale === 'en' ? ', ' : '، ');
    }
    if (value === null || value === undefined) {
        return '';
    }

    return String(value);
}

/**
 * Build a human-readable description of a single logic rule, resolving the rule
 * target to a friendly label via `labelOf` (a function name -> string) and the
 * operator/value via the shared label helpers. An optional `valueLabelOf`
 * maps a (targetName, rawValue) pair to a friendly value label (e.g. a choice's
 * text instead of its stored value); it falls back to the raw value display.
 *
 * @param {{field: string, op: string, value?: unknown}} rule
 * @param {(name: string) => string} labelOf
 * @param {'ar'|'en'} locale
 * @param {((name: string, value: unknown) => string|null|undefined)} [valueLabelOf]
 * @returns {string}
 */
export function formatLogicRule(rule, labelOf, locale = 'ar', valueLabelOf = null) {
    const field = labelOf(rule.field);
    const operator = operatorLabel(rule.op, locale);

    let value;
    if (typeof valueLabelOf === 'function' && !NULLARY_OPERATORS.includes(rule.op)) {
        if (Array.isArray(rule.value)) {
            value = rule.value
                .map((item) => valueLabelOf(rule.field, item) ?? formatRuleValue(item, rule.op, locale))
                .join(locale === 'en' ? ', ' : '، ');
        } else {
            value = valueLabelOf(rule.field, rule.value) ?? formatRuleValue(rule.value, rule.op, locale);
        }
    } else {
        value = formatRuleValue(rule.value, rule.op, locale);
    }

    return value === '' ? `${field} ${operator}` : `${field} ${operator} ${value}`;
}

/** The three supported conditional-logic actions. */
export const LOGIC_ACTIONS = ['show', 'hide', 'disable'];

/**
 * Normalise an arbitrary logic-action string to one of the supported values,
 * defaulting to `show`. Shared by the editor and the logic map so the action
 * set stays single-sourced.
 *
 * @param {unknown} value
 * @returns {'show'|'hide'|'disable'}
 */
export function normalizeLogicAction(value) {
    return LOGIC_ACTIONS.includes(value) ? value : 'show';
}

/**
 * Build a read-only logic map for the whole builder state (fix 9): every field
 * that HAS logic or is REFERENCED by another field's logic, plus the quiz
 * point totals. Pure + framework-free so it can be unit tested.
 *
 * @param {object|null|undefined} state  builder State (store.state)
 * @param {string[]|undefined|null} runtimeContextKeys
 * @param {'ar'|'en'} locale
 * @returns {{
 *   entries: Array<{name: string, label: string, action: 'show'|'hide'|'disable'|null, match: 'all'|'any'|null, rules: string[], advanced: string|null, referencedBy: string[]}>,
 *   quiz: {questions: Array<{name: string, label: string, points: number}>, total: number},
 *   isEmpty: boolean,
 * }}
 */
export function buildLogicMap(state, runtimeContextKeys, locale = 'ar') {
    const fields = [];
    for (const page of state?.pages ?? []) {
        for (const field of page.fields ?? []) {
            fields.push(field);
        }
    }

    const byName = new Map(fields.map((field) => [field.name, field]));
    const untitled = locale === 'en' ? 'Untitled question' : 'سؤال بدون عنوان';

    const labelOf = (name) => {
        const field = byName.get(name);
        if (field) {
            return localeText(field.label, locale, name);
        }
        // Predefined runtime variable, or an unknown reference.
        if ((runtimeContextKeys ?? []).includes(name)) {
            return variableLabel(name, locale);
        }

        return name;
    };

    /**
     * Friendly value label for a rule operand: a choice field's stored value is
     * mapped to its localized choice text; everything else returns null so the
     * caller falls back to the raw value display.
     */
    const valueLabelOf = (name, value) => {
        const field = byName.get(name);
        if (!field || !Array.isArray(field.choices)) {
            return null;
        }
        const choice = field.choices.find((entry) => entry.value === value);

        return choice ? localeText(choice.label, locale, String(value)) : null;
    };

    // Which fields reference each target in their (visual) logic rules?
    /** @type {Map<string, string[]>} */
    const referencedBy = new Map();
    for (const field of fields) {
        const logic = field.logic;
        if (!logic || !Array.isArray(logic.rules)) {
            continue;
        }
        for (const rule of logic.rules) {
            if (!rule || !rule.field || rule.field === field.name) {
                continue;
            }
            const list = referencedBy.get(rule.field) ?? [];
            const sourceLabel = localeText(field.label, locale, field.name) || untitled;
            if (!list.includes(sourceLabel)) {
                list.push(sourceLabel);
            }
            referencedBy.set(rule.field, list);
        }
    }

    const entries = [];
    for (const field of fields) {
        const logic = field.logic;
        const hasVisualLogic = logic && Array.isArray(logic.rules) && logic.rules.length > 0;
        const hasAdvancedLogic = logic && typeof logic.advanced === 'string' && logic.advanced.trim() !== '';
        const refs = referencedBy.get(field.name) ?? [];

        if (!hasVisualLogic && !hasAdvancedLogic && refs.length === 0) {
            continue;
        }

        entries.push({
            name: field.name,
            label: localeText(field.label, locale, field.name) || untitled,
            action: hasVisualLogic ? normalizeLogicAction(logic.action) : null,
            match: hasVisualLogic ? (logic.match === 'any' ? 'any' : 'all') : null,
            rules: hasVisualLogic ? logic.rules.map((rule) => formatLogicRule(rule, labelOf, locale, valueLabelOf)) : [],
            advanced: hasAdvancedLogic ? compileLogic(logic) ?? logic.advanced : null,
            referencedBy: refs,
        });
    }

    // Quiz totals.
    const questions = [];
    let total = 0;
    for (const field of fields) {
        if (field.quiz && field.quiz.correct !== undefined && field.quiz.correct !== null) {
            const points = Number(field.quiz.score ?? 1) || 0;
            total += points;
            questions.push({
                name: field.name,
                label: localeText(field.label, locale, field.name) || untitled,
                points,
            });
        }
    }

    return {
        entries,
        quiz: { questions, total },
        isEmpty: entries.length === 0 && questions.length === 0,
    };
}
