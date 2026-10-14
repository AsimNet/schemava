# Schemava

> **دليل الاستخدام:** [دليل منشئ النماذج المرئي](docs/ar/form-designer.md) — البناء على اللوحة، الحاويات، المنطق الشرطي، التقييم، والمعاينة.

> English: [README.md](README.md)

إضافة (Plugin) لـ Filament 5 لبناء النماذج والاستبانات وعرضها وجمع ردودها، بصيغة **متوافقة مع SurveyJS** —
مدعومة بـ **مُنشئ نماذج متعدّد اللغات (i18n)** مخصّص (تطبيق Vue بأسلوب OpnForm)، وليس مُنشئ SurveyJS Creator التجاري.

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

- PHP 8.2+
- Filament 5.x
- Laravel 11 / 12

## التثبيت

```bash
composer config repositories.schemava vcs https://github.com/AsimNet/schemava
composer require asimnet/schemava
php artisan schemava:install   # ينشر ملف الإعداد وملفات الترحيل (migrations)
php artisan migrate            # ينشئ جدولي schemava_schemas و schemava_results
php artisan filament:assets
```

> **للمستخدمين السابقين:** المستودع الخاص `repo.schemava.dev` متوقّف، والحزمة الآن مجانية وتُثبَّت من GitHub مباشرة.
> وجّه المستودع إلى GitHub واحذف التوكن القديم ثم حدّث:
> `composer config repositories.schemava vcs https://github.com/AsimNet/schemava && composer config --unset bearer.repo.schemava.dev && composer update asimnet/schemava`

> **حدود GitHub API:** إن تعثّر التثبيت (خصوصًا في CI)، أضف توكن GitHub (بلا صلاحيات لمستودع عام):
> `composer config --global github-oauth.github.com YOUR-GITHUB-TOKEN`

> ملاحظة: ملفات الترحيل تُنشر ولا تُشغَّل تلقائيًا — لا بد من نشرها (عبر `schemava:install` أو
> `php artisan vendor:publish --tag=schemava-migrations`) ثم تنفيذ `php artisan migrate`.

> **لا يُعرَض أي شيء للإنترنت بمجرد التثبيت:** نموذج التعبئة العام وواجهة JSON API **معطّلان افتراضيًا**،
> وتفعيلهما اختيار صريح من `config/schemava.php` (المفتاحان `routes.public.enabled` و `routes.api.enabled`).

تسجيل الإضافة على اللوحة:

```php
use AsimNet\Schemava\SchemavaPlugin;

public function panel(Panel $panel): Panel
{
    return $panel->plugin(
        SchemavaPlugin::make()
            ->navigationGroup('النماذج'),
    );
}
```

## الإعداد

انشر الملف `config/schemava.php` وراجعه لضبط إصدار عارض SurveyJS وقرص التخزين وخيارات المسارات
وارتباطات العقود (`RuntimeContextProvider`، `SurveyAccessResolver`، `AiAssistant`، `SurveyUrlResolver`،
`SchemaTypeHandler`) التي تُكيّف الإضافة مع نطاق تطبيقك.

## الرخصة

رخصة MIT. اطّلع على [ملف الرخصة](LICENSE.md) لمزيد من المعلومات.
