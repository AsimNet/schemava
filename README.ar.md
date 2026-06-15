# Filament SurveyJS

> English: [README.md](README.md)

إضافة (Plugin) لـ Filament 5 لبناء النماذج والاستبانات وعرضها وجمع ردودها، بصيغة **متوافقة مع SurveyJS** —
مدعومة بـ **مُنشئ نماذج عربيّ أولاً** مخصّص (تطبيق Vue بأسلوب OpnForm)، وليس مُنشئ SurveyJS Creator التجاري.

تُحفظ المخططات بصيغة [SurveyJS](https://surveyjs.io) JSON القياسية في العمود `survey_json`، وتُعرض عبر محرّك
`survey-core` / `survey-js-ui` مفتوح المصدر (رخصة MIT)، بحيث يكون المخطط نفسه قابلاً للنقل إلى أي عارض SurveyJS
(ويب، تطبيق جوال، إلخ).

## المزايا

- 🎨 مُنشئ نماذج عربيّ أولاً (سحب وإفلات، منطق شرطي، تقييم اختبارات، نص منسّق، متغيّرات).
- 🧩 مخرجات متوافقة مع مخطط SurveyJS — قابلة للنقل إلى أي عارض `survey-core`.
- 🤖 مساعد ذكاء اصطناعي اختياري لبناء النماذج (مزوّد قابل للاستبدال عبر عقد `AiAssistant`).
- 📥 نقاط إرسال للويب والجوال مع رفع الملفات والصور إلى قرس تخزين قابل للضبط.
- 📊 لوحة Filament: إدارة المخططات، جداول نتائج ديناميكية، إحصائيات، وتصدير.
- 🏢 جاهز لتعدّد المستأجرين؛ تُحقن متطلّبات التطبيق المضيف (الهويّة، قواعد الوصول، الذكاء الاصطناعي، الروابط) عبر العقود.

## المتطلّبات

- PHP 8.3+
- Filament 5.x
- Laravel 11 / 12

## التثبيت

```bash
composer require asimnet/filament-surveyjs
php artisan filament-surveyjs:install
```

تسجيل الإضافة على اللوحة:

```php
use Asimnet\FilamentSurveyjs\SurveyjsPlugin;

public function panel(Panel $panel): Panel
{
    return $panel->plugin(
        SurveyjsPlugin::make()
            ->navigationGroup('النماذج'),
    );
}
```

## الإعداد

انشر الملف `config/filament-surveyjs.php` وراجعه لضبط إصدار عارض SurveyJS وقرص التخزين وخيارات المسارات
وارتباطات العقود (`RuntimeContextProvider`، `SurveyAccessResolver`، `AiAssistant`، `SurveyUrlResolver`،
`SchemaTypeHandler`) التي تُكيّف الإضافة مع نطاق تطبيقك.

## الرخصة

رخصة MIT. اطّلع على [ملف الرخصة](LICENSE.md) لمزيد من المعلومات.
