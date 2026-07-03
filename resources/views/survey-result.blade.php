{{--
    Read-only viewer for a single SurveyResult submission, rendered back through
    the SurveyJS renderer in DISPLAY mode so it is faithful to the schema.

    Shown inside a Filament ViewAction modal (Livewire-rendered HTML). Inline
    <script> tags do NOT execute in Livewire modal content, so all rendering is
    handled by the `schemavaSurveyResult` Alpine component, registered globally
    via FilamentAsset (resources/js/survey-result-viewer.js). This view only
    hands that component the data it needs.

    Variables:
      - $surveyJson      array   The schema's SurveyJS definition.
      - $data            array   The submitted answers (SurveyResult->data).
      - $locale          string  Active locale (drives UI strings + RTL).
      - $rendererVersion string  Pinned survey-core/survey-js-ui version (informational).
--}}
@php($isRtl = $locale === 'ar')
@php($storageDefaultLocale = 'ar')

<div
    class="schemava-result"
    dir="{{ $isRtl ? 'rtl' : 'ltr' }}"
    style="--sjs-font-family: 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;"
    x-data="schemavaSurveyResult(@js([
        // Self-hosted renderer URLs — CDN tags break behind TLS-inspection proxies.
        'urls' => [
            'css' => \Filament\Support\Facades\FilamentAsset::getStyleHref('surveyjs-core', package: 'asimnet/schemava'),
            'core' => \Filament\Support\Facades\FilamentAsset::getScriptSrc('surveyjs-core', package: 'asimnet/schemava'),
            'i18n' => \Filament\Support\Facades\FilamentAsset::getScriptSrc('surveyjs-i18n', package: 'asimnet/schemava'),
            'ui' => \Filament\Support\Facades\FilamentAsset::getScriptSrc('surveyjs-ui', package: 'asimnet/schemava'),
        ],
        'surveyJson' => $surveyJson ?: (object) [],
        'data' => (object) ($data ?: []),
        'locale' => $locale ?: $storageDefaultLocale,
        'defaultLocale' => $storageDefaultLocale,
    ]))"
>
    <div wire:ignore x-ref="mount" class="schemava-result-mount" style="min-height: 120px;"></div>

    <p x-show="state === 'loading'" class="schemava-result-status" style="color: #6b7280; font-size: .9rem;">
        {{ __('schemava::surveyjs.responses.loading') }}
    </p>
    <p x-show="state === 'error'" x-cloak class="schemava-result-status" style="color: #b91c1c; font-size: .9rem;">
        {{ __('schemava::surveyjs.responses.render_failed') }}
    </p>
</div>
