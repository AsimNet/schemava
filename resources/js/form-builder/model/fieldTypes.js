/**
 * Field-type catalog — single source of truth for the palette, settings panel
 * and serializer. See spec: builder type -> SurveyJS element mapping.
 *
 * Icons are heroicons (outline, 24x24) path `d` strings rendered inline.
 */

export const FIELD_GROUPS = [
    { id: 'essentials', label: { ar: 'أساسية', en: 'Essentials' } },
    { id: 'choices', label: { ar: 'اختيارات', en: 'Choices' } },
    { id: 'content', label: { ar: 'محتوى', en: 'Content' } },
    { id: 'uploads', label: { ar: 'مرفقات', en: 'Uploads' } },
    { id: 'advanced', label: { ar: 'متقدم', en: 'Advanced' } },
];

export const FIELD_TYPES = {
    short_text: {
        surveyType: 'text',
        group: 'essentials',
        label: { ar: 'إجابة قصيرة', en: 'Short answer' },
        icon: 'M3.75 9h16.5m-16.5 6.75h8.25',
        hasPlaceholder: true,
        typeProps: { inputType: 'text' },
    },
    long_text: {
        surveyType: 'comment',
        group: 'essentials',
        label: { ar: 'إجابة طويلة', en: 'Long answer' },
        icon: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
        hasPlaceholder: true,
        typeProps: { rows: 4 },
    },
    number: {
        surveyType: 'text',
        group: 'essentials',
        label: { ar: 'رقم', en: 'Number' },
        icon: 'M8.25 4.5l7.5 15m-7.5-15h-3m3 0h3m-3 15h-3m3 0h3m4.5-15l-7.5 15',
        hasPlaceholder: true,
        typeProps: { inputType: 'number', min: null, max: null },
    },
    date: {
        surveyType: 'text',
        group: 'essentials',
        label: { ar: 'تاريخ', en: 'Date' },
        icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
        typeProps: { inputType: 'date' },
    },
    single_choice: {
        surveyType: 'radiogroup',
        group: 'choices',
        label: { ar: 'اختيار واحد', en: 'Single choice' },
        icon: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
        hasChoices: true,
        quizzable: true,
        typeProps: { showOtherItem: false },
    },
    multi_choice: {
        surveyType: 'checkbox',
        group: 'choices',
        label: { ar: 'اختيارات متعددة', en: 'Multiple choice' },
        icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        hasChoices: true,
        quizzable: true,
        typeProps: { showOtherItem: false, showSelectAllItem: false },
    },
    dropdown: {
        surveyType: 'dropdown',
        group: 'choices',
        label: { ar: 'قائمة منسدلة', en: 'Dropdown' },
        icon: 'M19.5 8.25l-7.5 7.5-7.5-7.5',
        hasChoices: true,
        hasPlaceholder: true,
        quizzable: true,
        typeProps: {},
    },
    ranking: {
        surveyType: 'ranking',
        group: 'choices',
        label: { ar: 'ترتيب', en: 'Ranking' },
        icon: 'M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5',
        hasChoices: true,
        typeProps: { selectToRankEnabled: false },
    },
    tagbox: {
        surveyType: 'tagbox',
        group: 'choices',
        label: { ar: 'اختيار متعدد (بحث)', en: 'Tag box' },
        icon: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z',
        hasChoices: true,
        hasPlaceholder: true,
        typeProps: { showOtherItem: false },
    },
    imagepicker: {
        surveyType: 'imagepicker',
        group: 'choices',
        label: { ar: 'اختيار بالصور', en: 'Image picker' },
        icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
        hasChoices: true,
        typeProps: { multiSelect: false, showLabel: true },
    },
    yes_no: {
        surveyType: 'boolean',
        group: 'choices',
        label: { ar: 'نعم / لا', en: 'Yes / No' },
        icon: 'M4.5 12.75l6 6 9-13.5',
        quizzable: true,
        typeProps: { labelTrue: null, labelFalse: null },
    },
    rating: {
        surveyType: 'rating',
        group: 'choices',
        label: { ar: 'تقييم', en: 'Rating' },
        icon: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
        typeProps: { rateMax: 5, rateType: 'stars' },
    },
    statement: {
        surveyType: 'html',
        group: 'content',
        label: { ar: 'نص توضيحي', en: 'Statement' },
        icon: 'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z',
        typeProps: {},
    },
    image: {
        surveyType: 'image',
        group: 'content',
        label: { ar: 'صورة', en: 'Image' },
        icon: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
        typeProps: { imageLink: null },
    },
    file: {
        surveyType: 'file',
        group: 'uploads',
        label: { ar: 'رفع ملف', en: 'File upload' },
        icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5',
        typeProps: { allowMultiple: false, acceptedTypes: null, maxSize: null },
    },
    signature: {
        surveyType: 'signaturepad',
        group: 'uploads',
        label: { ar: 'توقيع', en: 'Signature' },
        icon: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
        typeProps: {},
    },
    hidden_value: {
        surveyType: 'text',
        group: 'advanced',
        label: { ar: 'حقل مخفي', en: 'Hidden field' },
        icon: 'M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88',
        typeProps: {},
    },
    matrix: {
        surveyType: 'matrix',
        group: 'choices',
        label: { ar: 'مصفوفة (اختيار واحد لكل صف)', en: 'Matrix (single choice)' },
        icon: 'M3.75 5.25h16.5v13.5H3.75V5.25zM3.75 10.5h16.5M3.75 15.75h16.5M9.75 5.25v13.5M15 5.25v13.5',
        typeProps: { rows: [], columns: [] },
    },
    matrixdropdown: {
        surveyType: 'matrixdropdown',
        group: 'choices',
        label: { ar: 'مصفوفة (أعمدة متعددة)', en: 'Matrix (multi-column)' },
        icon: 'M3.75 5.25h16.5v13.5H3.75V5.25zM3.75 10.5h16.5M3.75 15.75h16.5M9.75 5.25v13.5M15 5.25v13.5',
        typeProps: { rows: [], columns: [] },
    },
    matrixdynamic: {
        surveyType: 'matrixdynamic',
        group: 'choices',
        label: { ar: 'مصفوفة (صفوف متكررة)', en: 'Matrix (dynamic rows)' },
        icon: 'M3.75 5.25h16.5v13.5H3.75V5.25zM3.75 10.5h16.5M3.75 15.75h16.5M9.75 5.25v13.5M15 5.25v13.5',
        typeProps: { rowCount: 2, columns: [] },
    },
    multipletext: {
        surveyType: 'multipletext',
        group: 'essentials',
        label: { ar: 'حقول نصية متعددة', en: 'Multiple textboxes' },
        icon: 'M3.75 5.25h16.5M3.75 9.75h7.5m-7.5 4.5h16.5M3.75 18.75h7.5',
        hasItems: true,
        typeProps: { colCount: 1, items: [] },
    },
    expression: {
        surveyType: 'expression',
        group: 'advanced',
        label: { ar: 'قيمة محسوبة', en: 'Calculated value' },
        icon: 'M8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25zM9.75 15.75h.008v.008H9.75v-.008zm0-2.25h.008v.008H9.75V13.5zm0-2.25h.008v.008H9.75v-.008zM12 15.75h.008v.008H12v-.008zm0-2.25h.008v.008H12V13.5zm0-2.25h.008v.008H12v-.008zm2.25 4.5h.008v.008h-.008v-.008zm0-2.25h.008v.008h-.008V13.5z',
        typeProps: { expression: '', displayStyle: 'none' },
    },
    panel_dynamic: {
        surveyType: 'paneldynamic',
        group: 'advanced',
        label: { ar: 'لوحة متكررة', en: 'Repeating panel' },
        icon: 'M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122',
        typeProps: {
            templateElements: [],
            panelCount: 1,
            minPanelCount: 0,
            maxPanelCount: null,
        },
    },
};

/** Pseudo-type for unrecognized SurveyJS elements (matrix, paneldynamic, …). */
export const ADVANCED_TYPE = 'advanced';

/**
 * Common element-level props the serializer owns directly (never passed
 * through `field.raw`). Per-type props are described by `TYPE_PROP_SPECS`.
 *
 * @type {string[]}
 */
export const COMMON_ELEMENT_PROPS = [
    'type',
    'name',
    'title',
    'description',
    'placeholder',
    'isRequired',
    'requiredErrorText',
    'visible',
    'visibleIf',
    'readOnly',
    'defaultValue',
    'defaultValueExpression',
    'correctAnswer',
    'score',
    'choices',
    'items',
];

/**
 * Per-builder-type extra props the serializer reads on import and re-emits.
 * `localized` props are stored as LStr; `forced` props are written with a
 * fixed value regardless of input (file/signature upload safety).
 *
 * @type {Record<string, {props?: string[], localized?: string[], forced?: Record<string, unknown>}>}
 */
export const TYPE_PROP_SPECS = {
    short_text: { props: ['inputType'] },
    number: { props: ['inputType', 'min', 'max'] },
    date: { props: ['inputType'] },
    long_text: { props: ['rows'] },
    single_choice: { props: ['showOtherItem'] },
    multi_choice: { props: ['showOtherItem', 'showSelectAllItem'] },
    dropdown: { props: [] },
    ranking: { props: ['selectToRankEnabled'] },
    tagbox: { props: ['showOtherItem'] },
    imagepicker: { props: ['multiSelect', 'showLabel'] },
    yes_no: { localized: ['labelTrue', 'labelFalse'] },
    rating: { props: ['rateMax', 'rateType'] },
    file: {
        props: ['allowMultiple', 'acceptedTypes', 'maxSize'],
        forced: { storeDataAsText: false, waitForUpload: true },
    },
    signature: {
        forced: { storeDataAsText: false, waitForUpload: true },
    },
    image: { props: ['imageLink'] },
    statement: { localized: ['html'] },
    hidden_value: {},
    // items need custom (LStr-title) parsing/emitting — see serialize.js.
    multipletext: { props: ['colCount'], custom: ['items'] },
    // rows/columns need custom (non-passthrough) parsing/emitting — see
    // elementToField/fieldToElement in serialize.js — so they are declared here
    // via `custom` purely to keep them out of `field.raw` (see managedPropsFor).
    matrix: { custom: ['rows', 'columns'] },
    matrixdropdown: { custom: ['rows', 'columns'] },
    matrixdynamic: { props: ['rowCount'], custom: ['columns'] },
    expression: { props: ['expression', 'displayStyle'] },
    panel_dynamic: {
        props: ['panelCount', 'minPanelCount', 'maxPanelCount', 'templateElements'],
        localized: ['panelAddText', 'panelRemoveText'],
    },
};

/**
 * All element-prop keys that the serializer manages for a given builder type
 * (common + per-type). Used to decide what stays out of `field.raw`.
 *
 * @param {string} builderType
 * @returns {string[]}
 */
export function managedPropsFor(builderType) {
    const spec = TYPE_PROP_SPECS[builderType] ?? {};

    return [
        ...COMMON_ELEMENT_PROPS,
        ...(spec.props ?? []),
        ...(spec.localized ?? []),
        ...Object.keys(spec.forced ?? {}),
        ...(spec.custom ?? []),
    ];
}

/**
 * Builder type for a SurveyJS element. The `text` survey type is shared by
 * several builder types, disambiguated by `inputType` FIRST so a hidden
 * (`visible:false`) number/date still classifies as number/date — hiddenness is
 * carried by the separate `hidden` Field flag, not the builder type. Only a
 * plain-text hidden element (inputType text/absent + `visible:false`) maps to
 * the generic `hidden_value` type.
 */
export function builderTypeForElement(element) {
    const type = element?.type ?? 'text';

    if (type === 'text') {
        const inputType = element.inputType ?? 'text';
        if (inputType === 'number') return 'number';
        if (inputType === 'date') return 'date';
        if (['text', 'email', 'tel', 'url'].includes(inputType)) {
            return element.visible === false ? 'hidden_value' : 'short_text';
        }
        return ADVANCED_TYPE;
    }

    const match = Object.entries(FIELD_TYPES).find(([, def]) => def.surveyType === type);

    return match ? match[0] : ADVANCED_TYPE;
}
