/**
 * Tiny reactive i18n for the builder UI.
 *
 * - English is the default UI language; any registered locale can be selected.
 * - The chosen UI language is persisted in localStorage under `formBuilderLocale`.
 * - Switching also flips the document `dir` (rtl for ar and other RTL locales).
 *
 * No hardcoded user-facing strings live in components — everything resolves
 * through `t(key)`.
 */

import { reactive, computed } from 'vue';
import { isRtlLocale } from './survey-runtime.js';

const STORAGE_KEY = 'formBuilderLocale';

const MESSAGES = {
    ar: {
        // Header
        back: 'رجوع',
        untitledForm: 'نموذج بدون عنوان',
        formTitlePlaceholder: 'عنوان النموذج',
        formDescriptionPlaceholder: 'وصف اختياري للنموذج',
        tabBuild: 'بناء',
        tabPreview: 'معاينة',
        save: 'حفظ',
        saving: 'جارٍ الحفظ...',
        saved: 'تم الحفظ',
        saveFailed: 'فشل الحفظ',
        uiLanguage: 'لغة الواجهة',
        contentLanguage: 'لغة المحتوى',
        arabic: 'العربية',
        english: 'الإنجليزية',
        missingTranslation: 'ترجمة ناقصة',
        missingTranslationHint: 'بعض الحقول تنقصها الترجمة الإنجليزية',
        totalPoints: 'مجموع النقاط',
        copyLink: 'نسخ رابط الاستبانة',
        linkCopied: 'تم نسخ رابط الاستبانة',
        moreActions: 'المزيد',

        // Palette
        addField: 'إضافة حقل',
        paletteHint: 'انقر لإضافة الحقل أو اسحبه إلى النموذج',

        // Canvas
        page: 'صفحة',
        pageTitlePlaceholder: 'عنوان الصفحة (اختياري)',
        addPage: 'إضافة صفحة',
        removePage: 'حذف الصفحة',
        movePageUp: 'تحريك الصفحة لأعلى',
        movePageDown: 'تحريك الصفحة لأسفل',
        emptyPage: 'لا توجد حقول بعد. أضف سؤالاً من الزر أدناه.',
        emptyForm: 'ابدأ ببناء نموذجك بإضافة أول سؤال.',
        required: 'مطلوب',
        duplicate: 'تكرار',
        delete: 'حذف',
        dragHandle: 'اسحب لإعادة الترتيب',
        lockedField: 'حقل متقدم (غير قابل للتحرير)',
        lockedFieldHint: 'هذا الحقل من نوع غير مدعوم في المحرر المرئي ويُحفظ كما هو.',
        fieldLabelPlaceholder: 'نص السؤال',

        // Add-question popover (Google-Forms-style picker)
        addQuestion: 'إضافة سؤال',
        addQuestionHint: 'اختر نوع السؤال لإضافته إلى هذه الصفحة',
        addQuestionClose: 'إغلاق قائمة الأنواع',

        // Settings panel
        settings: 'الإعدادات',
        closePanel: 'إغلاق',
        sectionBasics: 'الأساسيات',
        sectionAdvanced: 'إعدادات متقدمة',
        labelField: 'العنوان',
        descriptionField: 'الوصف',
        placeholderField: 'النص التلميحي',
        requiredToggle: 'حقل مطلوب',
        hiddenToggle: 'إخفاء الحقل',
        hiddenToggleHint: 'لن يظهر الحقل للمستخدم لكنه يبقى ضمن النتائج.',
        readOnlyLabel: 'للقراءة فقط (معطّل)',
        readOnlyHelp: 'يظهر الحقل لكن لا يمكن تعديله.',
        fieldName: 'اسم الحقل',
        fieldNameHint: 'المعرّف المستخدم في النتائج. تغييره قد يكسر النتائج السابقة.',
        fieldNameRequired: 'اسم الحقل مطلوب.',
        fieldNameDuplicate: 'هذا الاسم مستخدم بالفعل.',
        fieldNameInvalid: 'استخدم أحرفاً وأرقاماً وشرطات سفلية فقط.',
        fieldNameRenameWarning: 'تنبيه: تغيير الاسم قد يكسر النتائج المخزّنة سابقاً.',
        noFieldSelected: 'اختر حقلاً لعرض إعداداته.',
        fieldType: 'نوع الحقل',

        // Preview tab
        previewLocale: 'لغة المعاينة',
        previewRefresh: 'تحديث المعاينة',
        previewDeviceMobile: 'جوال',
        previewDeviceFull: 'كامل العرض',
        previewEmpty: 'أضف حقلاً واحداً على الأقل لمعاينة النموذج.',
        previewRendererMissing: 'تعذّر تحميل عارض الاستبيان. تأكد من اتصالك بالإنترنت ثم أعد المحاولة.',
        previewSampleNote: 'بيانات تجريبية تُستخدم لعرض المتغيّرات فقط.',
        previewQuizScore: 'نتيجة التقييم',
        previewQuizTotal: 'المجموع',
        previewQuizOutOf: 'من',
        previewQuizCorrect: 'إجابة صحيحة',
        previewQuizWrong: 'إجابة غير صحيحة',
        previewQuizNote: 'حساب تجريبي للتحقق من صحة الأسئلة التقييمية.',
        previewReset: 'إعادة المحاولة',

        // Save / leave
        unsavedChanges: 'لديك تغييرات غير محفوظة. هل تريد المغادرة؟',

        // AI assistant
        aiTitle: 'مساعد إنشاء النموذج',
        aiSubtitle: 'اكتب طلبك وسيتم تحديث النموذج مباشرة.',
        aiOpen: 'فتح المساعد الذكي',
        aiClose: 'إغلاق المساعد',
        aiPlaceholder: 'اكتب طلبك...',
        aiSend: 'إرسال',
        aiThinking: 'جارٍ التفكير...',
        aiWelcome: 'مرحبًا! أنا مساعدك الذكي، هنا لمساعدتك في إنشاء الاستبيان وإعداده. ما نوع الاستبيان الذي ترغب في إنشائه؟',
        aiApplied: 'تم تحديث النموذج بنجاح.',
        aiInvalidJson: 'يحتوي المخطط الناتج على أخطاء. تم فتح محرر JSON لتصحيحها يدوياً.',
        aiError: 'تعذّر الاتصال بالمساعد الذكي. حاول مجدداً.',
        aiTimeout: 'انتهت مهلة الطلب. حاول مجدداً بطلب أقصر.',
        aiSelectedElement: 'الحقل المحدد حالياً',
        aiRetry: 'إعادة الإرسال',

        // AI proposal gate (preview / approve / decline / undo)
        aiProposed: 'جهّزت اقتراحاً للنموذج. عاينه ثم طبّقه أو تجاهله.',
        aiApply: 'تطبيق',
        aiPreview: 'معاينة',
        aiDiscard: 'تجاهل',
        aiDiscarded: 'تم التجاهل.',
        aiUndo: 'تراجع',
        aiUndone: 'تم التراجع.',
        aiProposalPreviewBanner: 'تعاين اقتراحًا من الذكاء الاصطناعي',

        // JSON panel
        jsonTitle: 'محرّر JSON',
        jsonOpen: 'تحرير JSON',
        jsonHint: 'هذه هي الواجهة الوحيدة لتحرير الخصائص المتقدمة (المصفوفات، المُحفّزات، اللوحات الديناميكية).',
        jsonCopy: 'نسخ',
        jsonCopied: 'تم النسخ',
        jsonApply: 'تطبيق',
        jsonCancel: 'إلغاء',
        jsonInvalid: 'JSON غير صالح. تحقق من الصياغة.',
        jsonSchemaInvalid: 'المخطط يحتوي على أخطاء في الخصائص. صحّحها ثم أعد المحاولة.',
        jsonApplied: 'تم تطبيق التغييرات.',

        // Survey settings
        surveySettingsTitle: 'إعدادات الاستبيان',
        surveySettingsOpen: 'إعدادات الاستبيان',
        surveySettingsTexts: 'نصوص الاستبيان',
        surveySettingsTextsHint: 'اترك الحقل فارغاً لاستخدام النص الافتراضي بالعربية.',
        surveyTextCompleteText: 'زر الإرسال',
        surveyTextCompletedHtml: 'رسالة الإكمال',
        surveyTextCompletedBeforeHtml: 'رسالة الإكمال المسبق',
        surveyTextLoadingHtml: 'رسالة التحميل',
        surveyTextPagePrevText: 'زر السابق',
        surveyTextPageNextText: 'زر التالي',

        // Settings sections
        sectionOptions: 'الخيارات',
        sectionLogic: 'المنطق الشرطي',
        sectionQuiz: 'التقييم',

        // Options — per type
        inputTypeLabel: 'نوع الإدخال',
        inputTypeText: 'نص',
        inputTypeEmail: 'بريد إلكتروني',
        inputTypeTel: 'رقم هاتف',
        inputTypeUrl: 'رابط',
        minValue: 'أقل قيمة',
        maxValue: 'أعلى قيمة',
        rowsLabel: 'عدد الأسطر',
        showOtherItem: 'إضافة خيار «أخرى»',
        showSelectAllItem: 'إضافة خيار «تحديد الكل»',
        labelTrue: 'نص «نعم»',
        labelFalse: 'نص «لا»',
        labelTruePlaceholder: 'نعم',
        labelFalsePlaceholder: 'لا',
        rateMax: 'أعلى تقييم',
        rateType: 'نمط التقييم',
        rateTypeStars: 'نجوم',
        rateTypeLabels: 'أرقام',
        rateTypeSmileys: 'وجوه',
        ratePreview: 'معاينة',
        allowMultiple: 'السماح بعدة ملفات',
        acceptedTypes: 'الامتدادات المسموحة',
        acceptedTypesPlaceholder: '.pdf, .jpg, .png',
        acceptedTypesHint: 'افصل الامتدادات بفواصل.',
        maxSizeMb: 'الحجم الأقصى (ميجابايت)',
        statementHtml: 'النص',
        statementHtmlPlaceholder: 'اكتب النص التوضيحي هنا...',
        statementCardEmpty: 'اكتب النص التوضيحي الذي سيظهر للمستخدم...',
        statementHtmlHint: 'يدعم تنسيق HTML — استخدم المحرر أو اكتب HTML مباشرة.',
        richBold: 'عريض',
        richItalic: 'مائل',
        richUnderline: 'تسطير',
        richHeading2: 'عنوان كبير',
        richHeading3: 'عنوان فرعي',
        richList: 'قائمة نقطية',
        richLink: 'رابط',
        richClear: 'مسح التنسيق',
        editHtml: 'تحرير HTML',
        editRich: 'المحرر المرئي',
        imageUpload: 'الصورة',
        imageUploadButton: 'رفع صورة',
        imageReplace: 'استبدال الصورة',
        imageRemove: 'إزالة الصورة',
        imageUploading: 'جارٍ الرفع...',
        imageUploadFailed: 'فشل رفع الصورة. حاول مجدداً.',
        imagePreviewAlt: 'معاينة الصورة',
        imageCardEmpty: 'لم تُرفع صورة بعد.',
        hiddenValueExpression: 'التعبير (المصدر)',
        hiddenValueExpressionHint: 'يلتقط قيمة متغيّر معرّف مسبقاً ضمن النتائج، مثل {full_name}.',

        // Advanced — required error message override
        requiredErrorText: 'رسالة الحقل المطلوب',
        requiredErrorTextPlaceholder: 'يرجى الإجابة على هذا السؤال',
        requiredErrorTextHint: 'الرسالة التي تظهر عند ترك هذا الحقل المطلوب فارغاً. اتركها فارغة لاستخدام الرسالة الافتراضية بالعربية.',

        // Prefill
        defaultValueLabel: 'القيمة الافتراضية',
        defaultValuePlaceholder: 'قيمة مبدئية أو {متغيّر}',
        prefillModeValue: 'قيمة ثابتة',
        prefillModeExpression: 'متغيّر',

        // Variable menu
        insertVariable: 'إدراج متغيّر',
        variablesTitle: 'المتغيّرات',
        noVariables: 'لا توجد متغيّرات متاحة.',

        // Choices editor
        choicesLabel: 'الخيارات',
        addChoice: 'إضافة خيار',
        addChoicePlaceholder: 'أضف خياراً ثم اضغط Enter',
        removeChoice: 'حذف الخيار',
        choiceValueHint: 'القيمة المخزّنة:',
        bulkPasteHint: 'يمكنك لصق عدة أسطر لإضافة خيارات دفعةً واحدة.',
        emptyChoices: 'لا توجد خيارات بعد.',

        // Logic editor
        logicActionLabel: 'الإجراء',
        logicActionShow: 'إظهار',
        logicActionHide: 'إخفاء',
        logicActionDisable: 'تعطيل',
        logicMatchAll: 'كل الشروط',
        logicMatchAny: 'أي شرط',
        logicWhenPrefix: 'هذا الحقل عند تحقّق',
        logicAddRule: 'إضافة شرط',
        logicRemoveRule: 'حذف الشرط',
        logicNoRules: 'أضف شرطاً واحداً على الأقل لتفعيل المنطق.',
        logicNoPriorFields: 'لا توجد حقول سابقة يمكن الاشتراط عليها.',
        logicFieldPlaceholder: 'اختر الحقل',
        logicValuePlaceholder: 'القيمة',
        logicPreview: 'التعبير الناتج',
        logicVisibleIfLabel: 'visibleIf',
        logicEnableIfLabel: 'enableIf',
        logicAdvancedNote: 'تعبير مخصّص لا يمكن تحريره بصرياً.',
        logicEditAsText: 'تحرير كنص',
        logicEditVisually: 'العودة للمحرر',
        logicVariablesGroup: 'متغيّرات معرّفة',
        logicFieldsGroup: 'حقول النموذج',
        logicTrue: 'نعم',
        logicFalse: 'لا',

        // Quiz editor
        quizToggle: 'سؤال تقييمي',
        quizToggleHint: 'يُحتسب ضمن درجة المستخدم.',
        quizPoints: 'النقاط',
        quizCorrectAnswer: 'الإجابة الصحيحة المتوقّعة',
        quizCorrectHint: 'حدّد الإجابة الصحيحة من الخيارات.',
        quizExpectedPlaceholder: 'الإجابة الصحيحة',
        quizNoChoices: 'أضف خيارات أولاً لتحديد الإجابة الصحيحة.',

        // Delete confirmation
        deleteFieldConfirmTitle: 'حذف الحقل',
        deleteFieldReferenced: 'تعتمد الحقول التالية على هذا الحقل في منطقها الشرطي. سيتم حذف الشروط المرتبطة:',
        confirm: 'تأكيد',
        cancel: 'إلغاء',

        // Logic map
        logicMapOpen: 'خريطة المنطق',
        logicMapTitle: 'خريطة المنطق الشرطي',
        logicMapClose: 'إغلاق',
        logicMapEmpty: 'لا يوجد منطق شرطي بعد.',
        logicMapShownWhen: 'يظهر عندما',
        logicMapHiddenWhen: 'يخفى عندما',
        logicMapDisableWhen: 'يُعطَّل عندما',
        logicMapMatchAll: 'كل الشروط',
        logicMapMatchAny: 'أي شرط',
        logicMapAdvanced: 'تعبير مخصّص',
        logicMapReferencedBy: 'مشار إليه في منطق',
        logicMapUntitled: 'سؤال بدون عنوان',
        logicMapQuizSection: 'الأسئلة التقييمية',
        logicMapQuizPoints: 'نقطة',
        logicMapQuizTotal: 'مجموع النقاط',
    },
    en: {
        // Header
        back: 'Back',
        untitledForm: 'Untitled form',
        formTitlePlaceholder: 'Form title',
        formDescriptionPlaceholder: 'Optional form description',
        tabBuild: 'Build',
        tabPreview: 'Preview',
        save: 'Save',
        saving: 'Saving...',
        saved: 'Saved',
        saveFailed: 'Save failed',
        uiLanguage: 'Interface language',
        contentLanguage: 'Content language',
        arabic: 'Arabic',
        english: 'English',
        missingTranslation: 'Missing translation',
        missingTranslationHint: 'Some fields are missing the English translation',
        totalPoints: 'Total points',
        copyLink: 'Copy survey link',
        linkCopied: 'Survey link copied',
        moreActions: 'More',

        // Palette
        addField: 'Add field',
        paletteHint: 'Click to add or drag onto the form',

        // Canvas
        page: 'Page',
        pageTitlePlaceholder: 'Page title (optional)',
        addPage: 'Add page',
        removePage: 'Remove page',
        movePageUp: 'Move page up',
        movePageDown: 'Move page down',
        emptyPage: 'No questions yet. Add one with the button below.',
        emptyForm: 'Start building your form by adding the first question.',
        required: 'Required',
        duplicate: 'Duplicate',
        delete: 'Delete',
        dragHandle: 'Drag to reorder',
        lockedField: 'Advanced field (not editable)',
        lockedFieldHint: 'This field type is not supported by the visual editor and is preserved as-is.',
        fieldLabelPlaceholder: 'Question text',

        // Add-question popover (Google-Forms-style picker)
        addQuestion: 'Add question',
        addQuestionHint: 'Pick a question type to add to this page',
        addQuestionClose: 'Close type menu',

        // Settings panel
        settings: 'Settings',
        closePanel: 'Close',
        sectionBasics: 'Basics',
        sectionAdvanced: 'Advanced',
        labelField: 'Label',
        descriptionField: 'Description',
        placeholderField: 'Placeholder',
        requiredToggle: 'Required field',
        hiddenToggle: 'Hidden field',
        hiddenToggleHint: 'The field is not shown to the user but stays in the results.',
        readOnlyLabel: 'Read-only (disabled)',
        readOnlyHelp: 'The field is shown but cannot be edited.',
        fieldName: 'Field name',
        fieldNameHint: 'The identifier used in results. Changing it may break past results.',
        fieldNameRequired: 'Field name is required.',
        fieldNameDuplicate: 'This name is already in use.',
        fieldNameInvalid: 'Use letters, numbers and underscores only.',
        fieldNameRenameWarning: 'Warning: renaming may break previously stored results.',
        noFieldSelected: 'Select a field to see its settings.',
        fieldType: 'Field type',

        // Preview tab
        previewLocale: 'Preview language',
        previewRefresh: 'Refresh preview',
        previewDeviceMobile: 'Mobile',
        previewDeviceFull: 'Full width',
        previewEmpty: 'Add at least one field to preview the form.',
        previewRendererMissing: 'The survey renderer failed to load. Check your connection and retry.',
        previewSampleNote: 'Sample data used only to render variables.',
        previewQuizScore: 'Quiz score',
        previewQuizTotal: 'Total',
        previewQuizOutOf: 'of',
        previewQuizCorrect: 'Correct',
        previewQuizWrong: 'Incorrect',
        previewQuizNote: 'Client-side estimate to sanity-check scored questions.',
        previewReset: 'Try again',

        // Save / leave
        unsavedChanges: 'You have unsaved changes. Leave anyway?',

        // AI assistant
        aiTitle: 'Form-building assistant',
        aiSubtitle: 'Describe what you need and the form updates directly.',
        aiOpen: 'Open AI assistant',
        aiClose: 'Close assistant',
        aiPlaceholder: 'Type your request...',
        aiSend: 'Send',
        aiThinking: 'Thinking...',
        aiWelcome: 'Hi! I am your AI assistant, here to help you build and configure the survey. What kind of survey would you like to create?',
        aiApplied: 'The form was updated successfully.',
        aiInvalidJson: 'The generated schema contains errors. The JSON editor was opened so you can fix it manually.',
        aiError: 'Could not reach the AI assistant. Please try again.',
        aiTimeout: 'The request timed out. Try again with a shorter prompt.',
        aiSelectedElement: 'Currently selected field',
        aiRetry: 'Resend',

        // AI proposal gate (preview / approve / decline / undo)
        aiProposed: 'I prepared a proposal for your form. Preview it, then apply or discard.',
        aiApply: 'Apply',
        aiPreview: 'Preview',
        aiDiscard: 'Discard',
        aiDiscarded: 'Discarded.',
        aiUndo: 'Undo',
        aiUndone: 'Reverted.',
        aiProposalPreviewBanner: 'You are previewing an AI proposal',

        // JSON panel
        jsonTitle: 'JSON editor',
        jsonOpen: 'Edit JSON',
        jsonHint: 'This is the only surface for advanced passthrough constructs (matrices, triggers, dynamic panels).',
        jsonCopy: 'Copy',
        jsonCopied: 'Copied',
        jsonApply: 'Apply',
        jsonCancel: 'Cancel',
        jsonInvalid: 'Invalid JSON. Check the syntax.',
        jsonSchemaInvalid: 'The schema has property errors. Fix them and retry.',
        jsonApplied: 'Changes applied.',

        // Survey settings
        surveySettingsTitle: 'Survey settings',
        surveySettingsOpen: 'Survey settings',
        surveySettingsTexts: 'Survey texts',
        surveySettingsTextsHint: 'Leave empty to use the default Arabic text.',
        surveyTextCompleteText: 'Submit button',
        surveyTextCompletedHtml: 'Completion message',
        surveyTextCompletedBeforeHtml: 'Already-completed message',
        surveyTextLoadingHtml: 'Loading message',
        surveyTextPagePrevText: 'Previous button',
        surveyTextPageNextText: 'Next button',

        // Settings sections
        sectionOptions: 'Options',
        sectionLogic: 'Logic',
        sectionQuiz: 'Quiz',

        // Options — per type
        inputTypeLabel: 'Input type',
        inputTypeText: 'Text',
        inputTypeEmail: 'Email',
        inputTypeTel: 'Phone',
        inputTypeUrl: 'URL',
        minValue: 'Minimum',
        maxValue: 'Maximum',
        rowsLabel: 'Rows',
        showOtherItem: 'Add an “Other” option',
        showSelectAllItem: 'Add a “Select all” option',
        labelTrue: '“Yes” label',
        labelFalse: '“No” label',
        labelTruePlaceholder: 'Yes',
        labelFalsePlaceholder: 'No',
        rateMax: 'Max rating',
        rateType: 'Rating style',
        rateTypeStars: 'Stars',
        rateTypeLabels: 'Numbers',
        rateTypeSmileys: 'Smileys',
        ratePreview: 'Preview',
        allowMultiple: 'Allow multiple files',
        acceptedTypes: 'Accepted extensions',
        acceptedTypesPlaceholder: '.pdf, .jpg, .png',
        acceptedTypesHint: 'Separate extensions with commas.',
        maxSizeMb: 'Max size (MB)',
        statementHtml: 'Text',
        statementHtmlPlaceholder: 'Write the statement here...',
        statementCardEmpty: 'Write the statement text shown to the user...',
        statementHtmlHint: 'Supports HTML formatting — use the editor or write HTML directly.',
        richBold: 'Bold',
        richItalic: 'Italic',
        richUnderline: 'Underline',
        richHeading2: 'Heading',
        richHeading3: 'Subheading',
        richList: 'Bullet list',
        richLink: 'Link',
        richClear: 'Clear formatting',
        editHtml: 'Edit HTML',
        editRich: 'Visual editor',
        imageUpload: 'Image',
        imageUploadButton: 'Upload image',
        imageReplace: 'Replace image',
        imageRemove: 'Remove image',
        imageUploading: 'Uploading...',
        imageUploadFailed: 'Image upload failed. Please try again.',
        imagePreviewAlt: 'Image preview',
        imageCardEmpty: 'No image uploaded yet.',
        hiddenValueExpression: 'Expression (source)',
        hiddenValueExpressionHint: 'Captures a predefined variable into the results, e.g. {full_name}.',

        // Advanced — required error message override
        requiredErrorText: 'Required-field message',
        requiredErrorTextPlaceholder: 'Please answer this question',
        requiredErrorTextHint: 'The message shown when this required field is left empty. Leave empty to use the default Arabic message.',

        // Prefill
        defaultValueLabel: 'Default value',
        defaultValuePlaceholder: 'A default value or {variable}',
        prefillModeValue: 'Static value',
        prefillModeExpression: 'Variable',

        // Variable menu
        insertVariable: 'Insert variable',
        variablesTitle: 'Variables',
        noVariables: 'No variables available.',

        // Choices editor
        choicesLabel: 'Choices',
        addChoice: 'Add choice',
        addChoicePlaceholder: 'Add a choice and press Enter',
        removeChoice: 'Remove choice',
        choiceValueHint: 'Stored value:',
        bulkPasteHint: 'Paste multiple lines to add several choices at once.',
        emptyChoices: 'No choices yet.',

        // Logic editor
        logicActionLabel: 'Action',
        logicActionShow: 'Show',
        logicActionHide: 'Hide',
        logicActionDisable: 'Disable',
        logicMatchAll: 'All conditions',
        logicMatchAny: 'Any condition',
        logicWhenPrefix: 'this field when',
        logicAddRule: 'Add condition',
        logicRemoveRule: 'Remove condition',
        logicNoRules: 'Add at least one condition to enable logic.',
        logicNoPriorFields: 'No earlier fields to build conditions on.',
        logicFieldPlaceholder: 'Select field',
        logicValuePlaceholder: 'Value',
        logicPreview: 'Resulting expression',
        logicVisibleIfLabel: 'visibleIf',
        logicEnableIfLabel: 'enableIf',
        logicAdvancedNote: 'Custom expression that cannot be edited visually.',
        logicEditAsText: 'Edit as text',
        logicEditVisually: 'Back to editor',
        logicVariablesGroup: 'Predefined variables',
        logicFieldsGroup: 'Form fields',
        logicTrue: 'Yes',
        logicFalse: 'No',

        // Quiz editor
        quizToggle: 'Scored question',
        quizToggleHint: 'Counts toward the respondent’s score.',
        quizPoints: 'Points',
        quizCorrectAnswer: 'Expected correct answer',
        quizCorrectHint: 'Mark the correct answer among the choices.',
        quizExpectedPlaceholder: 'Correct answer',
        quizNoChoices: 'Add choices first to mark the correct answer.',

        // Delete confirmation
        deleteFieldConfirmTitle: 'Delete field',
        deleteFieldReferenced: 'The following fields rely on this field in their logic. Their related conditions will be removed:',
        confirm: 'Confirm',
        cancel: 'Cancel',

        // Logic map
        logicMapOpen: 'Logic map',
        logicMapTitle: 'Conditional logic map',
        logicMapClose: 'Close',
        logicMapEmpty: 'No conditional logic yet.',
        logicMapShownWhen: 'Shown when',
        logicMapHiddenWhen: 'Hidden when',
        logicMapDisableWhen: 'Disabled when',
        logicMapMatchAll: 'all conditions',
        logicMapMatchAny: 'any condition',
        logicMapAdvanced: 'Custom expression',
        logicMapReferencedBy: 'Referenced by logic of',
        logicMapUntitled: 'Untitled question',
        logicMapQuizSection: 'Scored questions',
        logicMapQuizPoints: 'pts',
        logicMapQuizTotal: 'Total points',
    },
};

function initialLocale() {
    if (typeof window === 'undefined') {
        return 'en';
    }
    const stored = window.localStorage?.getItem(STORAGE_KEY);

    return stored === 'ar' ? 'ar' : 'en';
}

export const i18n = reactive({
    locale: initialLocale(),
});

function applyDocumentDirection(locale) {
    if (typeof document === 'undefined') {
        return;
    }
    const dir = isRtlLocale(locale) ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', locale);
}

export function t(key) {
    const dict = MESSAGES[i18n.locale] ?? MESSAGES.ar;

    return dict[key] ?? MESSAGES.ar[key] ?? key;
}

export function setLocale(locale) {
    const next = locale === 'en' ? 'en' : 'ar';
    i18n.locale = next;
    if (typeof window !== 'undefined') {
        window.localStorage?.setItem(STORAGE_KEY, next);
    }
    applyDocumentDirection(next);
}

export function toggleLocale() {
    setLocale(i18n.locale === 'ar' ? 'en' : 'ar');
}

export const isRtl = computed(() => isRtlLocale(i18n.locale));

/** Apply the persisted UI direction immediately at boot. */
export function bootstrapDirection() {
    applyDocumentDirection(i18n.locale);
}
