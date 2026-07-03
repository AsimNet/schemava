/**
 * LStr helpers — localizable strings: { ar: string, en: string|null }.
 *
 * Arabic is the SurveyJS `default` locale; English is stored under `en`.
 * SurveyJS represents a localizable string either as a plain string (the
 * default locale) or as an object keyed by locale, e.g. { default: '..', en: '..' }.
 *
 *  - parse:     string s           -> { ar: s, en: null }
 *               object o           -> { ar: o.ar ?? o.default ?? firstValue(o), en: o.en ?? null }
 *  - serialize: en empty           -> plain string (Arabic is the SurveyJS default)
 *               ar + en            -> { default: ar, en }
 *               ar empty + en      -> { default: en, en }   (en-authored content
 *                                     must render in the default locale too)
 */

/** @returns {{ar: string, en: string|null}} */
export function emptyLStr() {
    return { ar: '', en: null };
}

/**
 * First string value of a SurveyJS localized object, used as the Arabic
 * fallback when neither `ar` nor `default` are present. Non-`en` keys are
 * preferred so that an English-only object still yields a sensible default.
 *
 * @param {Record<string, unknown>} value
 * @returns {string}
 */
function firstLocaleValue(value) {
    const entries = Object.entries(value).filter(([, v]) => typeof v === 'string' && v !== '');
    if (entries.length === 0) {
        return '';
    }

    const nonEnglish = entries.find(([key]) => key !== 'en');

    return /** @type {string} */ ((nonEnglish ?? entries[0])[1]);
}

/**
 * SurveyJS localizable value (string | localized object) -> LStr.
 *
 * @param {unknown} value
 * @returns {{ar: string, en: string|null}}
 */
export function parseLStr(value) {
    if (value === null || value === undefined) {
        return emptyLStr();
    }

    if (typeof value === 'string') {
        return { ar: value, en: null };
    }

    if (typeof value === 'object') {
        const obj = /** @type {Record<string, unknown>} */ (value);
        const ar = typeof obj.ar === 'string'
            ? obj.ar
            : (typeof obj.default === 'string' ? obj.default : firstLocaleValue(obj));
        const en = typeof obj.en === 'string' ? obj.en : null;

        return { ar, en };
    }

    return { ar: String(value), en: null };
}

/**
 * LStr -> SurveyJS localizable value.
 *
 * Returns `undefined` when fully empty (so callers can omit the prop),
 * a plain string when Arabic-only, or `{ default, en }` when both exist.
 * The returned `ar`/`en` are trimmed so the checks and the emitted values stay
 * consistent (a whitespace-only side is treated as empty, not stored verbatim).
 *
 * @param {{ar?: string, en?: string|null}|null|undefined} lstr
 * @returns {string|{default: string, en: string}|undefined}
 */
export function serializeLStr(lstr) {
    if (!lstr) {
        return undefined;
    }

    const ar = (lstr.ar ?? '').trim();
    const en = (lstr.en ?? '').trim();

    if (ar === '' && en === '') {
        return undefined;
    }

    if (en === '') {
        return ar;
    }

    // English-only content: emit the English text as `default` too, so the
    // Arabic (default-locale) renderer shows the authored text instead of an
    // empty/null default — the "Build and Preview don't sync" bug when a form
    // is authored with the EN content toggle active.
    return { default: ar === '' ? en : ar, en };
}

/**
 * @param {{ar?: string, en?: string|null}|null|undefined} lstr
 * @returns {boolean}
 */
export function isEmptyLStr(lstr) {
    return !lstr || ((lstr.ar ?? '').trim() === '' && (lstr.en ?? '').trim() === '');
}

/**
 * Read an LStr for display in a given content locale, falling back to Arabic.
 *
 * @param {{ar?: string, en?: string|null}|null|undefined} lstr
 * @param {'ar'|'en'} locale
 * @returns {string}
 */
export function lstrText(lstr, locale = 'ar') {
    if (!lstr) {
        return '';
    }

    if (locale === 'en') {
        return (lstr.en ?? lstr.ar) ?? '';
    }

    return lstr.ar ?? '';
}
