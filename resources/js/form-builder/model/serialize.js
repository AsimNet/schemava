/**
 * State <-> SurveyJS JSON.
 *
 * Lossless modulo exactly three mutations on serialize:
 *   (a) storeDataAsText:false + waitForUpload:true forced on file/signaturepad,
 *   (b) Arabic survey-text defaults applied when missing,
 *   (c) runtime `calculatedValues` injected for missing runtimeContextKeys.
 *
 * Unrecognised survey-level props live in `state.rawSurveyProps`; unrecognised
 * element props in `field.raw`; unrecognised element types become `advanced`
 * passthrough fields whose `raw` is the verbatim element.
 */

import {
    ADVANCED_TYPE,
    builderTypeForElement,
    FIELD_TYPES,
    TYPE_PROP_SPECS,
    managedPropsFor,
} from './fieldTypes.js';
import {
    parseLStr,
    serializeLStr,
    emptyLStr,
    isEmptyLStr,
} from './localized.js';
import { compileLogic, parseLogic, parseEnableExpression } from './expressions.js';
import { choiceUid } from '../ui-helpers.js';

/** SurveyJS survey-level text props (LStr-ish overrides). */
const SURVEY_TEXT_KEYS = [
    'completeText',
    'completedHtml',
    'completedBeforeHtml',
    'loadingHtml',
    'pagePrevText',
    'pageNextText',
];

/** Arabic defaults applied to survey texts when missing (legacy parity). */
const SURVEY_TEXT_DEFAULTS = {
    pagePrevText: 'السابق',
    pageNextText: 'التالي',
    completeText: 'أرسل',
    completedHtml: 'شكراً لك على إكمال الاستبيان.',
    completedBeforeHtml: 'لقد قمت بإكمال هذا الاستبيان مسبقاً.',
    loadingHtml: 'جارٍ تحميل الاستبيان...',
};

let nameCounter = 0;

/**
 * Short unique element name, collision-checked against `existingNames`.
 *
 * @param {Set<string>|string[]} existingNames
 * @returns {string}
 */
export function nextFieldName(existingNames = new Set()) {
    const taken = existingNames instanceof Set ? existingNames : new Set(existingNames);
    let name;

    do {
        nameCounter += 1;
        name = `q_${nameCounter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    } while (taken.has(name));

    return name;
}

/* -------------------------------------------------------- helpers (parsing) */

/**
 * Does a localized source value carry locales beyond ar/en/default that the
 * LStr model can't represent? Such values are preserved verbatim in `raw`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function hasUnsupportedLocales(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }

    return Object.keys(value).some((key) => !['ar', 'en', 'default'].includes(key));
}

/**
 * Parse a localized element/page/survey prop into an LStr, recording whether
 * the original must be preserved verbatim (extra locales).
 *
 * @param {unknown} value
 * @returns {{lstr: {ar: string, en: string|null}, preserveRaw: boolean}}
 */
function parseLocalized(value) {
    return { lstr: parseLStr(value), preserveRaw: hasUnsupportedLocales(value) };
}

/**
 * SurveyJS choice item -> Choice + leftover raw item props. Every parsed choice
 * gets a fresh non-serialized `_uid` for stable keyed list rendering.
 *
 * @param {unknown} item
 * @returns {{_uid: string, value: unknown, label: {ar: string, en: string|null}, raw: object}}
 */
function parseChoice(item) {
    if (item === null || item === undefined) {
        return { _uid: choiceUid(), value: '', label: emptyLStr(), raw: {} };
    }

    if (typeof item !== 'object') {
        return { _uid: choiceUid(), value: item, label: { ar: String(item), en: null }, raw: {} };
    }

    const { value, text, ...rest } = /** @type {Record<string, unknown>} */ (item);

    return {
        _uid: choiceUid(),
        value: value ?? '',
        label: parseLStr(text ?? value),
        raw: rest,
    };
}

/** Builder types whose `rows` prop is a plain choice-item list (matrix, matrixdropdown). */
const MATRIX_ROW_TYPES = ['matrix', 'matrixdropdown'];

/** Builder types whose `columns` prop is a plain choice-item list (matrix only). */
const MATRIX_SIMPLE_COLUMN_TYPES = ['matrix'];

/** Builder types whose `columns` prop is a list of cell-definition columns. */
const MATRIX_CELL_COLUMN_TYPES = ['matrixdropdown', 'matrixdynamic'];

/**
 * SurveyJS matrixdropdown/matrixdynamic column (cell) definition -> MatrixColumn
 * + leftover raw props. Mirrors {@see parseChoice}'s shape/uid handling, plus
 * `cellType` (the column's sub-question type) and its own nested `choices` for
 * choice-based cell types (dropdown/checkbox/radiogroup) — recursively editable
 * as a fully-fledged (if narrow) sub-question.
 *
 * @param {unknown} item
 * @returns {{_uid: string, name: string, title: {ar: string, en: string|null}, cellType: string|null, isRequired: boolean, choices: unknown[]|null, raw: object}}
 */
function parseMatrixColumn(item) {
    if (item === null || item === undefined) {
        return { _uid: choiceUid(), name: '', title: emptyLStr(), cellType: null, isRequired: false, choices: null, raw: {} };
    }

    if (typeof item !== 'object') {
        return { _uid: choiceUid(), name: String(item), title: emptyLStr(), cellType: null, isRequired: false, choices: null, raw: {} };
    }

    const { name, title, cellType, choices, isRequired, ...rest } = /** @type {Record<string, unknown>} */ (item);

    return {
        _uid: choiceUid(),
        name: typeof name === 'string' ? name : String(name ?? ''),
        title: title !== undefined && title !== null ? parseLStr(title) : emptyLStr(),
        cellType: typeof cellType === 'string' && cellType !== '' ? cellType : null,
        isRequired: isRequired === true,
        choices: Array.isArray(choices) ? choices.map(parseChoice) : null,
        raw: rest,
    };
}

/**
 * MatrixColumn -> SurveyJS matrixdropdown/matrixdynamic column definition.
 *
 * @param {{name: string, title?: {ar: string, en: string|null}, cellType?: string|null, isRequired?: boolean, choices?: unknown[]|null, raw?: object}} column
 * @returns {unknown}
 */
function serializeMatrixColumn(column) {
    const item = { ...(column.raw ?? {}) };
    item.name = column.name;

    if (column.title && !isEmptyLStr(column.title)) {
        assignLocalized(item, 'title', column.title);
    }
    if (column.cellType) {
        item.cellType = column.cellType;
    }
    if (column.isRequired) {
        item.isRequired = true;
    }
    if (Array.isArray(column.choices)) {
        item.choices = column.choices.map(serializeChoice);
    }

    return item;
}

/**
 * Parse a matrix-family element's `rows`/`columns` into typeProps, keyed by
 * builder type: `matrix`/`matrixdropdown` rows and `matrix` columns are plain
 * choice-item lists; `matrixdropdown`/`matrixdynamic` columns are cell
 * definitions (see {@see parseMatrixColumn}). `matrixdynamic` has no `rows`
 * (rows are added dynamically by the respondent, up to `rowCount`).
 *
 * @param {string} builderType
 * @param {Record<string, unknown>} element
 * @param {Record<string, unknown>} typeProps  mutated in place
 */
function parseMatrixProps(builderType, element, typeProps) {
    if (MATRIX_ROW_TYPES.includes(builderType) && Array.isArray(element.rows)) {
        typeProps.rows = element.rows.map(parseChoice);
    }
    if (MATRIX_SIMPLE_COLUMN_TYPES.includes(builderType) && Array.isArray(element.columns)) {
        typeProps.columns = element.columns.map(parseChoice);
    }
    if (MATRIX_CELL_COLUMN_TYPES.includes(builderType) && Array.isArray(element.columns)) {
        typeProps.columns = element.columns.map(parseMatrixColumn);
    }
}

/**
 * Emit a matrix-family field's `rows`/`columns` typeProps back onto the
 * SurveyJS element. Mirrors {@see parseMatrixProps}.
 *
 * @param {string} builderType
 * @param {Record<string, unknown>} typeProps
 * @param {Record<string, unknown>} element  mutated in place
 */
function serializeMatrixProps(builderType, typeProps, element) {
    if (MATRIX_ROW_TYPES.includes(builderType) && Array.isArray(typeProps?.rows)) {
        element.rows = typeProps.rows.map(serializeChoice);
    }
    if (MATRIX_SIMPLE_COLUMN_TYPES.includes(builderType) && Array.isArray(typeProps?.columns)) {
        element.columns = typeProps.columns.map(serializeChoice);
    }
    if (MATRIX_CELL_COLUMN_TYPES.includes(builderType) && Array.isArray(typeProps?.columns)) {
        element.columns = typeProps.columns.map(serializeMatrixColumn);
    }
}

/**
 * SurveyJS `calculatedValues` entry -> CalculatedValue + leftover raw props
 * (e.g. a `title` used by result exports). Invalid (non-object) entries are
 * dropped by the caller.
 *
 * @param {unknown} item
 * @returns {{name: string, expression: string, includeIntoResult: boolean, raw: object}|null}
 */
function parseCalculatedValue(item) {
    if (!item || typeof item !== 'object') {
        return null;
    }

    const { name, expression, includeIntoResult, ...rest } = /** @type {Record<string, unknown>} */ (item);

    return {
        name: typeof name === 'string' ? name : '',
        expression: typeof expression === 'string' ? expression : '',
        includeIntoResult: includeIntoResult === true,
        raw: rest,
    };
}

/**
 * CalculatedValue -> SurveyJS `calculatedValues` entry. `includeIntoResult` is
 * only emitted when true (mirrors the `required`/`hidden` boolean convention).
 *
 * @param {{name: string, expression: string, includeIntoResult?: boolean, raw?: object}} value
 * @returns {Record<string, unknown>}
 */
function serializeCalculatedValue(value) {
    const item = { ...(value.raw ?? {}), name: value.name, expression: value.expression };
    if (value.includeIntoResult) {
        item.includeIntoResult = true;
    }

    return item;
}

/**
 * Read a single element into a builder Field.
 *
 * @param {Record<string, unknown>} element
 * @param {Set<string>} usedNames
 * @returns {object}
 */
function elementToField(element, usedNames) {
    const builderType = builderTypeForElement(element);
    const name = typeof element.name === 'string' && element.name !== ''
        ? element.name
        : nextFieldName(usedNames);
    usedNames.add(name);

    if (builderType === ADVANCED_TYPE) {
        return {
            name,
            type: ADVANCED_TYPE,
            label: element.title !== undefined && element.title !== null
                ? parseLStr(element.title)
                : emptyLStr(),
            description: element.description ? parseLStr(element.description) : null,
            placeholder: null,
            required: element.isRequired === true,
            hidden: element.visible === false,
            choices: null,
            quiz: null,
            logic: null,
            typeProps: {},
            raw: { ...element },
        };
    }

    const spec = TYPE_PROP_SPECS[builderType] ?? {};
    const managed = new Set(managedPropsFor(builderType));

    /** @type {Record<string, unknown>} */
    const raw = {};
    for (const [key, value] of Object.entries(element)) {
        if (!managed.has(key)) {
            raw[key] = value;
        }
    }

    // Localized common props (title -> label, description, placeholder).
    // Only derive a label from an actual `title`; never synthesise one from the
    // element name (that would inject a title on round-trip). The UI falls back
    // to the name for display when the label is empty.
    const labelParsed = element.title !== undefined && element.title !== null
        ? parseLocalized(element.title)
        : { lstr: emptyLStr(), preserveRaw: false };
    const descriptionParsed = element.description !== undefined && element.description !== null
        ? parseLocalized(element.description)
        : null;
    const placeholderParsed = element.placeholder !== undefined && element.placeholder !== null
        ? parseLocalized(element.placeholder)
        : null;
    const requiredErrorParsed = element.requiredErrorText !== undefined && element.requiredErrorText !== null
        ? parseLocalized(element.requiredErrorText)
        : null;

    if (labelParsed.preserveRaw) {
        raw.title = element.title;
    }
    if (descriptionParsed?.preserveRaw) {
        raw.description = element.description;
    }
    if (placeholderParsed?.preserveRaw) {
        raw.placeholder = element.placeholder;
    }
    if (requiredErrorParsed?.preserveRaw) {
        raw.requiredErrorText = element.requiredErrorText;
    }

    // Per-type plain props.
    /** @type {Record<string, unknown>} */
    const typeProps = {};
    for (const key of spec.props ?? []) {
        if (element[key] !== undefined) {
            typeProps[key] = element[key];
        }
    }
    // Per-type localized props (labelTrue/labelFalse/html).
    for (const key of spec.localized ?? []) {
        if (element[key] !== undefined && element[key] !== null) {
            const parsed = parseLocalized(element[key]);
            if (parsed.preserveRaw) {
                raw[key] = element[key];
            } else {
                typeProps[key] = parsed.lstr;
            }
        }
    }

    // Quiz.
    let quiz = null;
    if (Object.prototype.hasOwnProperty.call(element, 'correctAnswer')) {
        const score = Object.prototype.hasOwnProperty.call(element, 'score')
            ? Number(element.score)
            : 1;
        quiz = { correct: element.correctAnswer, score: Number.isFinite(score) ? score : 1 };
    }

    // Logic. `visibleIf` (show/hide) takes precedence; otherwise `enableIf`
    // (disable). When BOTH are present the visibility side becomes the editable
    // logic and the `enableIf` is preserved verbatim in `raw` (it is not a
    // managed prop, so it stays there untouched) — keeping the rare both-present
    // import lossless even though the UI only edits the visibility side.
    let logic = null;
    const hasVisibleIf = typeof element.visibleIf === 'string' && element.visibleIf.trim() !== '';
    const hasEnableIf = typeof element.enableIf === 'string' && element.enableIf.trim() !== '';
    if (hasVisibleIf) {
        logic = parseLogic(element.visibleIf);
    } else if (hasEnableIf) {
        logic = parseEnableExpression(element.enableIf);
        // Consumed into logic — don't also re-emit it from raw.
        delete raw.enableIf;
    }

    // panel_dynamic: recursively parse the panel template's sub-questions into
    // real Fields (sharing `usedNames` so template question names stay unique
    // across the whole survey, not just within the panel).
    if (builderType === 'panel_dynamic') {
        typeProps.templateElements = Array.isArray(element.templateElements)
            ? element.templateElements
                .filter((sub) => sub && typeof sub === 'object')
                .map((sub) => elementToField(sub, usedNames))
            : [];
    }

    // Choices.
    let choices = null;
    if (Array.isArray(element.choices)) {
        choices = element.choices.map(parseChoice);
    }

    return {
        name,
        type: builderType,
        label: labelParsed.lstr,
        description: descriptionParsed ? descriptionParsed.lstr : null,
        placeholder: placeholderParsed ? placeholderParsed.lstr : null,
        requiredErrorText: requiredErrorParsed && !requiredErrorParsed.preserveRaw
            ? requiredErrorParsed.lstr
            : null,
        required: element.isRequired === true,
        hidden: element.visible === false,
        readOnly: element.readOnly === true,
        defaultValue: Object.prototype.hasOwnProperty.call(element, 'defaultValue')
            ? element.defaultValue
            : undefined,
        defaultValueExpression: typeof element.defaultValueExpression === 'string'
            ? element.defaultValueExpression
            : undefined,
        choices,
        quiz,
        logic,
        typeProps,
        raw,
    };
}

/* ----------------------------------------------------------- fromSurveyJson */

/**
 * SurveyJS JSON -> builder State.
 *
 * @param {object|null|undefined} json
 * @returns {object}
 */
export function fromSurveyJson(json) {
    const source = json && typeof json === 'object' ? json : {};
    const {
        title,
        description,
        pages,
        calculatedValues,
        ...rest
    } = source;

    // Split survey-text overrides out of the leftover props.
    /** @type {Record<string, unknown>} */
    const surveyTexts = {};
    /** @type {Record<string, unknown>} */
    const rawSurveyProps = {};
    for (const [key, value] of Object.entries(rest)) {
        if (SURVEY_TEXT_KEYS.includes(key) && !hasUnsupportedLocales(value)) {
            surveyTexts[key] = parseLStr(value);
        } else {
            rawSurveyProps[key] = value;
        }
    }

    const usedNames = new Set();
    const sourcePages = Array.isArray(pages) && pages.length > 0
        ? pages
        : [{ name: 'page1', elements: [] }];

    const builtPages = sourcePages.map((page, index) => {
        const pageObject = page && typeof page === 'object' ? page : {};
        const { name, title: pageTitle, elements, ...pageRest } = pageObject;
        const elementList = Array.isArray(elements) ? elements : [];

        return {
            name: typeof name === 'string' && name !== '' ? name : `page${index + 1}`,
            title: pageTitle !== undefined && pageTitle !== null ? parseLStr(pageTitle) : null,
            titlePreserveRaw: hasUnsupportedLocales(pageTitle),
            rawPageProps: pageRest,
            fields: elementList
                .filter((element) => element && typeof element === 'object')
                .map((element) => elementToField(element, usedNames)),
        };
    });

    return {
        meta: { title: parseLStr(title), description: parseLStr(description) },
        pages: builtPages,
        surveyTexts,
        rawSurveyProps,
        calculatedValues: Array.isArray(calculatedValues)
            ? calculatedValues.map(parseCalculatedValue).filter(Boolean)
            : [],
        contentLocale: 'ar',
    };
}

/* ------------------------------------------------------- helpers (emitting) */

/**
 * Assign a localized value to `target[key]` when non-empty.
 *
 * @param {Record<string, unknown>} target
 * @param {string} key
 * @param {{ar?: string, en?: string|null}|null|undefined} lstr
 */
function assignLocalized(target, key, lstr) {
    const serialized = serializeLStr(lstr);
    if (serialized !== undefined) {
        target[key] = serialized;
    }
}

/**
 * Choice -> SurveyJS choice item (plain string when ar-only & value===ar text).
 *
 * The choice's non-serialized `_uid` is intentionally never copied into the
 * emitted item (it is not part of `raw`, and the choice object is not spread),
 * so it stays out of the survey JSON.
 *
 * @param {{_uid?: string, value: unknown, label: {ar: string, en: string|null}, raw?: object}} choice
 * @returns {unknown}
 */
function serializeChoice(choice) {
    const label = choice.label ?? emptyLStr();
    const text = serializeLStr(label);
    const rawItem = choice.raw ?? {};
    const hasRaw = Object.keys(rawItem).length > 0;
    const arOnly = (label.en ?? '').trim() === '';

    if (arOnly && !hasRaw && choice.value === label.ar) {
        return label.ar;
    }

    /** @type {Record<string, unknown>} */
    const item = { ...rawItem, value: choice.value };
    if (text !== undefined) {
        item.text = text;
    }

    return item;
}

/**
 * Field -> SurveyJS element. Spread `raw` first, then known props win.
 *
 * @param {object} field
 * @returns {object}
 */
function fieldToElement(field) {
    if (field.type === ADVANCED_TYPE) {
        return { ...(field.raw ?? {}) };
    }

    const spec = TYPE_PROP_SPECS[field.type] ?? {};
    const surveyType = surveyTypeFor(field.type);

    /** @type {Record<string, unknown>} */
    const element = { ...(field.raw ?? {}) };

    element.type = surveyType;
    element.name = field.name;

    assignLocalized(element, 'title', field.label);
    if (field.description && !isEmptyLStr(field.description)) {
        assignLocalized(element, 'description', field.description);
    }
    if (field.placeholder && !isEmptyLStr(field.placeholder)) {
        assignLocalized(element, 'placeholder', field.placeholder);
    }
    if (field.requiredErrorText && !isEmptyLStr(field.requiredErrorText)) {
        assignLocalized(element, 'requiredErrorText', field.requiredErrorText);
    }

    if (field.required) {
        element.isRequired = true;
    }
    if (field.hidden || field.type === 'hidden_value') {
        element.visible = false;
    }
    if (field.readOnly) {
        element.readOnly = true;
    }

    if (field.defaultValue !== undefined) {
        element.defaultValue = field.defaultValue;
    }
    if (typeof field.defaultValueExpression === 'string' && field.defaultValueExpression !== '') {
        element.defaultValueExpression = field.defaultValueExpression;
    }

    // Per-type plain props.
    for (const key of spec.props ?? []) {
        const value = field.typeProps?.[key];
        if (value !== undefined && value !== null) {
            element[key] = value;
        }
    }
    // Per-type localized props.
    for (const key of spec.localized ?? []) {
        const value = field.typeProps?.[key];
        if (value && !isEmptyLStr(value)) {
            assignLocalized(element, key, value);
        }
    }

    // Choices.
    if (Array.isArray(field.choices)) {
        element.choices = field.choices.map(serializeChoice);
    }

    // panel_dynamic: re-emit the panel template's sub-questions as real elements.
    if (field.type === 'panel_dynamic') {
        element.templateElements = Array.isArray(field.typeProps?.templateElements)
            ? field.typeProps.templateElements.map(fieldToElement)
            : [];
    }

    // Logic. A `disable` action (or an advanced block tagged `target:'enable'`)
    // serializes to `enableIf`; everything else (show/hide/advanced-visible) to
    // `visibleIf`. In the both-present import case the logic targets visibleIf
    // and the preserved `enableIf` rides along untouched in `raw`.
    if (field.logic) {
        const compiled = compileLogic(field.logic);
        if (compiled) {
            const targetsEnable = field.logic.action === 'disable' || field.logic.target === 'enable';
            element[targetsEnable ? 'enableIf' : 'visibleIf'] = compiled;
        }
    }

    // Quiz.
    if (field.quiz && field.quiz.correct !== undefined && field.quiz.correct !== null) {
        element.correctAnswer = field.quiz.correct;
        const score = Number(field.quiz.score);
        if (Number.isFinite(score) && score !== 1) {
            element.score = score;
        }
    }

    // Forced props (file/signature upload safety) — always win.
    for (const [key, value] of Object.entries(spec.forced ?? {})) {
        element[key] = value;
    }

    return element;
}

/**
 * SurveyJS `type` string for a builder type (from the catalog — single source).
 *
 * @param {string} builderType
 * @returns {string}
 */
function surveyTypeFor(builderType) {
    return FIELD_TYPES[builderType]?.surveyType ?? builderType;
}

/**
 * Inject runtime calculatedValues (name + empty expression) for any missing
 * runtimeContextKeys, preserving existing entries without duplicates.
 *
 * @param {unknown} existing
 * @param {string[]} runtimeContextKeys
 * @returns {Array}
 */
function ensureRuntimeCalculatedValues(existing, runtimeContextKeys) {
    const list = Array.isArray(existing) ? [...existing] : [];
    const names = new Set(
        list
            .filter((entry) => entry && typeof entry === 'object' && typeof entry.name === 'string')
            .map((entry) => entry.name),
    );

    for (const key of runtimeContextKeys) {
        if (!names.has(key)) {
            list.push({ name: key, expression: '' });
            names.add(key);
        }
    }

    return list;
}

/* ------------------------------------------------------------- toSurveyJson */

/**
 * builder State -> SurveyJS JSON.
 *
 * @param {object} state
 * @param {{runtimeContextKeys?: string[]}} [options]
 * @returns {object}
 */
export function toSurveyJson(state, options = { runtimeContextKeys: [] }) {
    const runtimeContextKeys = options?.runtimeContextKeys ?? [];

    /** @type {Record<string, unknown>} */
    const result = { ...(state.rawSurveyProps ?? {}) };

    // Title / description (also synced to top-level for the save endpoint).
    assignLocalized(result, 'title', state.meta?.title ?? emptyLStr());
    assignLocalized(result, 'description', state.meta?.description ?? emptyLStr());

    // Pages.
    result.pages = (state.pages ?? []).map((page) => {
        /** @type {Record<string, unknown>} */
        const pageObject = { ...(page.rawPageProps ?? {}) };
        pageObject.name = page.name;

        if (page.titlePreserveRaw && pageObject.title === undefined) {
            // Extra-locale page title round-tripped via rawPageProps already.
        } else if (page.title && !isEmptyLStr(page.title)) {
            assignLocalized(pageObject, 'title', page.title);
        }

        pageObject.elements = (page.fields ?? []).map(fieldToElement);

        return pageObject;
    });

    // Survey-text overrides + Arabic defaults.
    const texts = state.surveyTexts ?? {};
    for (const key of SURVEY_TEXT_KEYS) {
        const serialized = serializeLStr(texts[key]);
        if (serialized !== undefined) {
            result[key] = serialized;
        } else if (SURVEY_TEXT_DEFAULTS[key] !== undefined && result[key] === undefined) {
            result[key] = SURVEY_TEXT_DEFAULTS[key];
        }
    }
    // Defaults may also be missing entirely from surveyTexts/raw.
    for (const [key, value] of Object.entries(SURVEY_TEXT_DEFAULTS)) {
        if (result[key] === undefined) {
            result[key] = value;
        }
    }

    // Author-defined calculatedValues + runtime injection for missing keys.
    const authoredCalculatedValues = Array.isArray(state.calculatedValues)
        ? state.calculatedValues.map(serializeCalculatedValue)
        : [];
    if (runtimeContextKeys.length > 0 || authoredCalculatedValues.length > 0) {
        result.calculatedValues = ensureRuntimeCalculatedValues(
            authoredCalculatedValues,
            runtimeContextKeys,
        );
    }

    return result;
}
