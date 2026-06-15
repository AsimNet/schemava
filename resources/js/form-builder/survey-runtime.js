/**
 * Thin bridge to the SurveyJS *renderer* CDN globals (renderer only — the
 * SurveyJS Creator is gone). The blade loads two UMD bundles from unpkg:
 *
 *   - `survey.core.min.js`   -> window.Survey   (Model, surveyLocalization, …)
 *   - `survey-js-ui.min.js`  -> window.SurveyUI (renderSurvey; also augments
 *                                                 Survey.Model.prototype.render)
 *
 * This module is the single place that touches those globals so components stay
 * framework-pure and the global names live in one spot. Everything degrades
 * gracefully when the globals are missing (offline / tests).
 */

/** @returns {any|null} the global `Survey` namespace from survey-core, or null. */
export function getSurveyGlobal() {
    return typeof window !== 'undefined' && window.Survey ? window.Survey : null;
}

/** @returns {any|null} the global `SurveyUI` namespace from survey-js-ui, or null. */
export function getSurveyUiGlobal() {
    return typeof window !== 'undefined' && window.SurveyUI ? window.SurveyUI : null;
}

/** @returns {boolean} whether both renderer globals are available. */
export function isRendererAvailable() {
    return Boolean(getSurveyGlobal()) && Boolean(getSurveyUiGlobal());
}

/**
 * Validate a SurveyJS JSON object the same way the legacy creator did: build a
 * fresh `Survey.Model`, `fromJSON` with `validatePropertyValues`, then inspect
 * `jsonErrors`. When the renderer global is unavailable we cannot validate, so
 * we optimistically treat the (already JSON-parsed) value as valid.
 *
 * @param {object} json
 * @returns {{valid: boolean, errors: unknown[]}}
 */
export function validateSurveyJson(json) {
    const Survey = getSurveyGlobal();
    if (!Survey || typeof Survey.Model !== 'function') {
        return { valid: true, errors: [] };
    }

    try {
        const model = new Survey.Model();
        model.fromJSON(json, { validatePropertyValues: true });
        const errors = Array.isArray(model.jsonErrors) ? model.jsonErrors : [];

        return { valid: errors.length === 0, errors };
    } catch (error) {
        return { valid: false, errors: [error] };
    }
}

/**
 * Right-to-left locales, aligned with the set survey-core renders RTL for.
 * Used to drive document/preview direction from the active locale code instead
 * of hardcoding a single language.
 *
 * @type {Set<string>}
 */
export const RTL_LOCALES = new Set([
    'ar', 'arc', 'dv', 'fa', 'ha', 'he', 'khw', 'ks', 'ku', 'ps', 'sd', 'syr', 'ug', 'ur', 'yi',
]);

/**
 * Whether a SurveyJS locale code is right-to-left. Tolerant of region suffixes
 * (e.g. `ar-SA`) and empty/missing values (treated as LTR).
 *
 * @param {string|null|undefined} locale
 * @returns {boolean}
 */
export function isRtlLocale(locale) {
    if (typeof locale !== 'string' || locale === '') {
        return false;
    }

    return RTL_LOCALES.has(locale.toLowerCase().split('-')[0]);
}

/**
 * Default survey-text locale overrides applied on top of survey-core's bundled
 * dictionaries. Keyed by locale code; `fill` only sets a key when the bundle
 * doesn't already define it, while `set` always wins. Hosts may pass their own
 * map to {@see applySurveyLocaleOverrides} / {@see createPreviewModel} to patch
 * any locale's strings — the package is not tied to a single language.
 *
 * @type {Record<string, {fill?: Record<string, string>, set?: Record<string, string>}>}
 */
export const DEFAULT_SURVEY_LOCALE_OVERRIDES = {
    ar: {
        fill: {
            pagePrevText: 'السابق',
            pageNextText: 'التالي',
            completeText: 'أرسل',
        },
        set: {
            requiredError: 'هذا الحقل مطلوب.',
            filePlaceholder: 'اسحب الملف وأفلته هنا أو اضغط الزر أدناه لاختيار ملف للرفع.',
        },
    },
};

/**
 * Patch survey-core's localization registry (`Survey.surveyLocalization.locales`)
 * with per-locale string overrides. `fill` entries only fill gaps (an explicit
 * bundle value wins); `set` entries always win. Guarantees the targeted locales
 * exist offline/in tests. Generalizes the legacy Arabic-only patch.
 *
 * @param {Record<string, {fill?: Record<string, string>, set?: Record<string, string>}>} [overrides]
 * @returns {void}
 */
export function applySurveyLocaleOverrides(overrides = DEFAULT_SURVEY_LOCALE_OVERRIDES) {
    const Survey = getSurveyGlobal();
    if (!Survey?.surveyLocalization?.locales) {
        return;
    }

    for (const [code, spec] of Object.entries(overrides ?? {})) {
        const dict = Survey.surveyLocalization.locales[code] ?? {};

        for (const [key, value] of Object.entries(spec?.fill ?? {})) {
            dict[key] = dict[key] ?? value;
        }
        for (const [key, value] of Object.entries(spec?.set ?? {})) {
            dict[key] = value;
        }

        Survey.surveyLocalization.locales[code] = dict;
    }
}

/**
 * The locale whose text lives in a serialized string's SurveyJS `default` slot.
 *
 * The package keeps Arabic in `default` and other languages under their locale
 * code (see model/localized.js — `serializeLStr`). survey-core defaults its
 * global `surveyLocalization.defaultLocale` to `'en'`; aligning it with this
 * value is what lets an `'en'` render resolve the explicit `en` slot instead of
 * the Arabic `default` slot. Hosts may override per call via
 * `options.defaultLocale` on {@see createPreviewModel}.
 *
 * @type {string}
 */
export const STORAGE_DEFAULT_LOCALE = 'ar';

/**
 * Create a configured preview `Survey.Model` for the given serialized JSON.
 *
 * - aligns survey-core's default locale with the schema's storage default so
 *   the `default` slot maps to Arabic and `en` to English (see
 *   {@see STORAGE_DEFAULT_LOCALE})
 * - sets the active `locale`
 * - seeds sample runtime data as both survey data and variables so `{key}`
 *   piping and runtime `calculatedValues` resolve
 * - disables network submission (preview is read-only: completion stays local)
 *
 * @param {object} json  serialized SurveyJS JSON
 * @param {{locale?: string, defaultLocale?: string, localeOverrides?: object, sampleData?: Record<string, unknown>}} [options]
 *   `defaultLocale` is the schema's storage/default locale (the locale the
 *   `default` slot represents); defaults to {@see STORAGE_DEFAULT_LOCALE}.
 * @returns {any|null} a Survey.Model instance, or null when the global is absent
 */
export function createPreviewModel(json, options = {}) {
    const Survey = getSurveyGlobal();
    if (!Survey || typeof Survey.Model !== 'function') {
        return null;
    }

    applySurveyLocaleOverrides(options.localeOverrides);

    // Align survey-core's default locale with the schema's storage default
    // BEFORE building the model. Otherwise survey-core's built-in `'en'` default
    // makes an `'en'` render resolve the `default` slot (Arabic) instead of the
    // explicit `en` slot. See {@see STORAGE_DEFAULT_LOCALE}.
    const defaultLocale = typeof options.defaultLocale === 'string' && options.defaultLocale !== ''
        ? options.defaultLocale
        : STORAGE_DEFAULT_LOCALE;
    if (Survey.surveyLocalization) {
        Survey.surveyLocalization.defaultLocale = defaultLocale;
    }

    const model = new Survey.Model(json);
    // Any SurveyJS locale code drives the rendered UI strings (resolved from
    // survey-core's surveyLocalization registry / the survey.i18n bundle).
    // With no explicit locale we render the storage default locale.
    model.locale = typeof options.locale === 'string' && options.locale !== ''
        ? options.locale
        : defaultLocale;

    const sampleData = options.sampleData ?? {};
    for (const [key, value] of Object.entries(sampleData)) {
        // setVariable feeds `{key}` piping + calculatedValues expressions; merged
        // data covers questions whose name equals a runtime key (hidden fields).
        model.setVariable(key, value);
    }
    if (Object.keys(sampleData).length > 0) {
        model.mergeData(sampleData);
    }

    // Preview must never POST anywhere — swallow completion locally.
    if (typeof model.onComplete?.add === 'function') {
        model.onComplete.add((sender, complete) => {
            if (complete && typeof complete.showSaveInProgress === 'function') {
                // no-op: we are not persisting anything in preview
            }
        });
    }

    return model;
}

/**
 * Render a Survey.Model into a DOM element using the renderer's vanilla-JS API.
 * Prefers `SurveyUI.renderSurvey(model, element)`; falls back to the legacy
 * `model.render(element)` augmentation when only that is present.
 *
 * @param {any} model
 * @param {HTMLElement} element
 * @returns {boolean} whether rendering was attempted
 */
export function renderPreviewModel(model, element) {
    if (!model || !element) {
        return false;
    }

    const SurveyUI = getSurveyUiGlobal();
    if (SurveyUI && typeof SurveyUI.renderSurvey === 'function') {
        SurveyUI.renderSurvey(model, element);

        return true;
    }

    if (typeof model.render === 'function') {
        model.render(element);

        return true;
    }

    return false;
}

/**
 * Best-effort unmount of a previously rendered preview from its DOM node.
 *
 * The renderer (survey-js-ui) keeps a vnode tree on the container node; mounting
 * a fresh model into a node that still carries one yields a collapsed/empty
 * frame. PreviewPane always renders into a brand-new node, so the primary
 * defence is dropping that node — but we also call the renderer's unmount hook
 * when one is exposed, and as a last resort clear the node's children.
 *
 * @param {HTMLElement|null|undefined} element
 * @returns {void}
 */
export function unmountPreview(element) {
    if (!element) {
        return;
    }

    const SurveyUI = getSurveyUiGlobal();
    try {
        if (SurveyUI && typeof SurveyUI.unmountSurveyFromElement === 'function') {
            SurveyUI.unmountSurveyFromElement(element);
        } else if (SurveyUI && typeof SurveyUI.unmount === 'function') {
            SurveyUI.unmount(element);
        }
    } catch {
        /* ignore — node removal below is the real cleanup */
    }

    if (typeof element.replaceChildren === 'function') {
        element.replaceChildren();
    } else {
        element.innerHTML = '';
    }
}
