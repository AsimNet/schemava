{{--
    Standalone host page for the SurveyJS form builder.

    This view is intentionally "dumb": the controller builds the full boot
    payload (routes, runtime context keys, variable metadata, public URL) and
    passes it in. The page only renders the shell, the JSON boot tag, and loads
    the compiled builder bundle from Filament's asset manager.

    Variables:
      - $bootPayload     array   Fully-assembled boot payload for the Vue app.
      - $pageTitle       string  Document title.
      - $locale          string  Active locale (controls lang/dir).
      - $rendererVersion string  Pinned survey-core version for the Preview tab.
--}}
@php($isRtl = $locale === 'ar')
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', $locale) }}" dir="{{ $isRtl ? 'rtl' : 'ltr' }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ $pageTitle }}</title>

    {{-- IBM Plex Sans Arabic font --}}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
          rel="stylesheet">

    {{-- SurveyJS renderer ONLY (survey-core + survey-js-ui) — used by the Preview
         tab and the AI assistant's validation engine. NO survey-creator-* scripts:
         the custom builder replaces the SurveyJS Creator.

         The version is pinned via config('schemava.renderer_version') so
         the builder validates/previews on the SAME engine that renders the saved
         JSON downstream (e.g. a mobile app's survey-angular-ui). Bump it only in
         lockstep with those renderer clients. --}}
    {{-- URLs are built inside a single {{ }} expression so the `@` in
         `survey-core@<version>` is not adjacent to `{{` (which Blade would treat
         as the @{{ }} escape and emit verbatim instead of interpolating). --}}
    <link href="{{ 'https://unpkg.com/survey-core@'.$rendererVersion.'/survey-core.min.css' }}" rel="stylesheet"/>
    <script src="{{ 'https://unpkg.com/survey-core@'.$rendererVersion.'/survey.core.min.js' }}"></script>
    {{-- Arabic (ar) locale bundle — must load AFTER survey.core.min.js. --}}
    <script src="{{ 'https://unpkg.com/survey-core@'.$rendererVersion.'/survey.i18n.min.js' }}"></script>
    <script src="{{ 'https://unpkg.com/survey-js-ui@'.$rendererVersion.'/survey-js-ui.min.js' }}"></script>

    <link rel="stylesheet"
          href="{{ \Filament\Support\Facades\FilamentAsset::getStyleHref('schemava-builder', package: 'asimnet/schemava') }}">
</head>
<body>
<script id="form-builder-boot" type="application/json">@json($bootPayload)</script>
<div id="form-builder-app"></div>
<script src="{{ \Filament\Support\Facades\FilamentAsset::getScriptSrc('schemava-builder', package: 'asimnet/schemava') }}"></script>
</body>
</html>
