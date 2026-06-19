{{--
    Read-only viewer for a single SurveyResult submission, rendered back through
    the SurveyJS renderer in DISPLAY mode so it is faithful to the schema.

    Embedded inside a Filament ViewAction modal (Livewire-rendered HTML, not a
    standalone document): the relation manager passes the parent schema's
    survey_json, the record's stored answers, the active locale, and the pinned
    renderer version. The view loads the renderer from a CDN and boots a
    display-mode Survey.Model.

    Variables:
      - $surveyJson      array   The schema's SurveyJS definition.
      - $data            array   The submitted answers (SurveyResult->data).
      - $locale          string  Active locale (drives UI strings + RTL).
      - $rendererVersion string  Pinned survey-core/survey-js-ui version.

    The boot mirrors resources/js/form-builder/survey-runtime.js
    `createDisplayModel()` (unit-tested in tests/js/form-builder/survey-display.test.js):
    align the default locale, build the model, set locale, set data, force
    `mode = 'display'`. Kept inline (no bundle) because this view ships no Vue app.

    Robustness inside Livewire/Filament:
      - the render container is `wire:ignore` so Livewire never wipes the
        SurveyJS-rendered DOM on re-render;
      - a per-container init guard + a unique id make the boot idempotent when the
        modal script runs more than once.
--}}
@php($isRtl = $locale === 'ar')
@php($storageDefaultLocale = 'ar')
@php($containerId = 'schemava-result-'.uniqid())

{{-- SurveyJS renderer (survey-core + survey-js-ui), pinned via
     config('schemava.renderer_version') so this read-only viewer renders on the
     SAME engine the builder validated/previewed against and that downstream
     clients use. URLs are built inside a single {{ }} expression so the `@` in
     `survey-core@<version>` is not adjacent to `{{` (which Blade would treat as
     the @{{ }} escape and emit verbatim instead of interpolating). --}}
<link href="{{ 'https://unpkg.com/survey-core@'.$rendererVersion.'/survey-core.min.css' }}" rel="stylesheet"/>
<script src="{{ 'https://unpkg.com/survey-core@'.$rendererVersion.'/survey.core.min.js' }}"></script>
{{-- Locale bundle (e.g. Arabic) — must load AFTER survey.core.min.js. --}}
<script src="{{ 'https://unpkg.com/survey-core@'.$rendererVersion.'/survey.i18n.min.js' }}"></script>
<script src="{{ 'https://unpkg.com/survey-js-ui@'.$rendererVersion.'/survey-js-ui.min.js' }}"></script>

<div
    class="schemava-result"
    dir="{{ $isRtl ? 'rtl' : 'ltr' }}"
    style="--sjs-font-family: 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;"
>
    <div wire:ignore id="{{ $containerId }}" class="schemava-result-mount" style="min-height: 120px;"></div>

    <script>
        (function () {
            var container = document.getElementById(@json($containerId));
            if (!container || container.dataset.schemavaRendered === 'true') {
                return;
            }

            // Renderer globals are loaded from the CDN above. Bail quietly when
            // unavailable (offline) — the modal still opens, just without a render.
            if (typeof Survey === 'undefined' || typeof Survey.Model !== 'function') {
                return;
            }

            var surveyJson = @json($surveyJson ?: (object) []);
            var responseData = @json((object) ($data ?: []));
            var defaultLocale = @json($storageDefaultLocale);
            var locale = @json($locale) || defaultLocale;

            // Mirror createDisplayModel(): align survey-core's default locale with
            // the schema's storage default BEFORE building the model so an `en`
            // render reads the explicit `en` slot, not the Arabic `default` slot.
            if (Survey.surveyLocalization) {
                Survey.surveyLocalization.defaultLocale = defaultLocale;
            }

            var survey = new Survey.Model(surveyJson);
            survey.locale = locale;
            survey.data = (responseData && typeof responseData === 'object') ? responseData : {};
            // Read-only: survey-core disables inputs and shows the stored answers,
            // collapses to one page, and hides navigation/progress chrome.
            survey.mode = 'display';
            survey.questionsOnPageMode = 'singlePage';
            survey.showNavigationButtons = 'none';
            survey.showProgressBar = 'off';

            if (typeof window !== 'undefined' && window.SurveyUI && typeof window.SurveyUI.renderSurvey === 'function') {
                window.SurveyUI.renderSurvey(survey, container);
            } else if (typeof survey.render === 'function') {
                survey.render(container);
            }

            container.dataset.schemavaRendered = 'true';
        })();
    </script>
</div>
