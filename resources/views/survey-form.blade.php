{{--
    Public, fillable form. Unlike the Filament modal viewer, this is a full-page
    standalone document, so inline <script> tags run normally — no Alpine needed.

    Renders the schema through survey-js-ui in normal (edit) mode and POSTs the
    answers to the submit route on completion, using survey-core's built-in
    save-progress UI for feedback.

    Variables:
      - $schema          SurveySchema  The form.
      - $surveyJson      array         SurveyJS definition.
      - $unavailable     ?string       Set when the form can't be submitted.
      - $runtimeValues   array         Host piping values (RuntimeContextProvider).
      - $submitUrl       string        POST target.
      - $csrf            string        CSRF token.
      - $locale          string        Active locale (UI strings + RTL).
      - $rendererVersion string        Pinned survey-core/survey-js-ui version.
      - $pageTitle       string
--}}
@php
    $isRtl = $locale === 'ar';
    $storageDefaultLocale = 'ar';
@endphp
<!DOCTYPE html>
<html lang="{{ $locale }}" dir="{{ $isRtl ? 'rtl' : 'ltr' }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ $csrf }}">
    <title>{{ $pageTitle }}</title>
    <link href="{{ 'https://unpkg.com/survey-core@'.$rendererVersion.'/survey-core.min.css' }}" rel="stylesheet"/>
    <style>
        body { margin: 0; background: #f3f4f6; color: #14161b;
            font-family: 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .schemava-wrap { max-width: 880px; margin: 0 auto; padding: 32px 16px 64px; }
        .schemava-notice { background: #fff; border: 1px solid #e7e5e4; border-radius: 14px;
            padding: 28px; text-align: center; color: #3d424d; font-size: 1.05rem; }
    </style>
</head>
<body>
    <div class="schemava-wrap">
        @if ($unavailable)
            <div class="schemava-notice">{{ $unavailable }}</div>
        @else
            <div id="schemava-form"></div>
        @endif
    </div>

    @unless ($unavailable)
        <script src="{{ 'https://unpkg.com/survey-core@'.$rendererVersion.'/survey.core.min.js' }}"></script>
        <script src="{{ 'https://unpkg.com/survey-core@'.$rendererVersion.'/survey.i18n.min.js' }}"></script>
        <script src="{{ 'https://unpkg.com/survey-js-ui@'.$rendererVersion.'/survey-js-ui.min.js' }}"></script>
        @php
            $formBoot = [
                'surveyJson' => $surveyJson,
                'runtimeValues' => (object) $runtimeValues,
                'submitUrl' => $submitUrl,
                'locale' => $locale,
                'defaultLocale' => $storageDefaultLocale,
            ];
        @endphp
        <script id="schemava-form-boot" type="application/json">@json($formBoot)</script>
        <script>
            (function () {
                if (typeof Survey === 'undefined' || typeof Survey.Model !== 'function') {
                    return;
                }

                var boot = JSON.parse(document.getElementById('schemava-form-boot').textContent);

                if (Survey.surveyLocalization) {
                    Survey.surveyLocalization.defaultLocale = boot.defaultLocale;
                }

                var survey = new Survey.Model(boot.surveyJson);
                survey.locale = boot.locale || boot.defaultLocale;

                // Expose host runtime values to the form for piping ({key} refs).
                var values = boot.runtimeValues || {};
                Object.keys(values).forEach(function (key) {
                    survey.setVariable(key, values[key]);
                });

                var csrf = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

                survey.onComplete.add(function (sender, options) {
                    if (options && options.showSaveInProgress) {
                        options.showSaveInProgress();
                    }

                    fetch(boot.submitUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': csrf,
                            'Accept': 'application/json',
                        },
                        body: JSON.stringify({ data: sender.data }),
                    }).then(function (response) {
                        if (response.ok && options && options.showSaveSuccess) {
                            options.showSaveSuccess();
                        } else if (options && options.showSaveError) {
                            options.showSaveError();
                        }
                    }).catch(function () {
                        if (options && options.showSaveError) {
                            options.showSaveError();
                        }
                    });
                });

                if (window.SurveyUI && typeof window.SurveyUI.renderSurvey === 'function') {
                    window.SurveyUI.renderSurvey(survey, document.getElementById('schemava-form'));
                } else if (typeof survey.render === 'function') {
                    survey.render(document.getElementById('schemava-form'));
                }
            })();
        </script>
    @endunless
</body>
</html>
