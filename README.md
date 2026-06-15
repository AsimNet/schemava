# Filament SurveyJS

[![Latest Version on Packagist](https://img.shields.io/packagist/v/asimnet/filament-surveyjs.svg?style=flat-square)](https://packagist.org/packages/asimnet/filament-surveyjs)
[![License](https://img.shields.io/packagist/l/asimnet/filament-surveyjs.svg?style=flat-square)](LICENSE.md)

> العربية: [README.ar.md](README.ar.md)

A Filament 5 plugin for building, rendering, and collecting **SurveyJS‑compatible** forms — powered by a custom,
**Arabic‑first** visual builder (an OpnForm‑style Vue app), **not** the commercial SurveyJS Creator.

Schemas are stored as standard [SurveyJS](https://surveyjs.io) JSON (`survey_json`) and rendered with the MIT
`survey-core` / `survey-js-ui` engine, so the same schema is portable to any SurveyJS renderer (web, mobile, etc.).

## What the package provides

- 🎨 **Custom Arabic‑first form builder** — a self‑contained, compiled Vue bundle (drag‑and‑drop,
  branching logic, quiz scoring, rich text, runtime variables) registered with Filament's asset manager.
- 🧩 **SurveyJS‑compatible models** — `SurveySchema` + `SurveyResult` storing standard SurveyJS JSON,
  portable to any `survey-core` renderer.
- 🖥️ **Standalone designer page** — controller + view that host the builder, with save / image‑upload /
  AI endpoints, all delegated to host contracts.
- 🔌 **Host‑overridable contracts** — `RuntimeContextProvider` (piping variables), `SurveyAccessResolver`
  (submission gating), `AiAssistant` (AI building), `SurveyUrlResolver` (public/admin URLs), and
  `SurveySubmissionHandler` (how a submission is persisted). Each ships a working default.
- 🧮 **Generic services** — quiz score calculation and SurveyJS question/calculated‑value extraction.
- 🏢 **Multi‑tenant friendly** — model, table names, storage disk, renderer version, and route options are
  all configurable; nothing is hard‑wired to a particular app.

The package is intentionally **SurveyJS‑only**. Domain surfaces that sit *on top of* SurveyJS forms — your
Filament admin resource, public/mobile survey‑taking endpoints, and any app‑specific schema "types"
(e.g. help forms) — are composed by the host application against the package's models, designer route, and
contracts. The host registers the designer routes (so multi‑tenant routing stays under its control) and
points them at `Asimnet\FilamentSurveyjs\Http\Controllers\SurveyDesignerController`.

## Requirements

- PHP 8.3+
- Filament 5.x
- Laravel 11 / 12

## Installation

```bash
composer require asimnet/filament-surveyjs
php artisan filament-surveyjs:install   # publishes config (+ migrations for fresh installs)
php artisan filament:assets             # publishes the compiled builder bundle to /public
```

The service provider auto‑registers the builder bundle and contract bindings. To wire the designer into your
app, point a route at the package controller (the host owns route registration so it composes cleanly with
your auth / multi‑tenancy):

```php
use Asimnet\FilamentSurveyjs\Http\Controllers\SurveyDesignerController;

Route::middleware(['web', 'auth'])->prefix('survey-designer')->name('survey-designer.')->group(function () {
    Route::get('/{surveySchema}', [SurveyDesignerController::class, 'show'])->name('show');
    Route::post('/{surveySchema}/save', [SurveyDesignerController::class, 'save'])->name('save');
    Route::post('/{surveySchema}/ai/query', [SurveyDesignerController::class, 'queryAi'])->name('ai-query');
    Route::post('/upload-image', [SurveyDesignerController::class, 'uploadImage'])->name('upload-image');
});
```

Then link to `route('survey-designer.show', $schema)` from your own Filament resource.

## Configuration

Publish and review `config/filament-surveyjs.php` to set:

- **`models`** — the schema/result models (subclass them to add domain behavior).
- **`tables`**, **`storage.disk`** — table names and the upload disk.
- **`renderer_version`** — the pinned `survey-core` version (keep in lockstep with your renderers).
- **`contracts`** — bind your implementations of `RuntimeContextProvider`, `SurveyAccessResolver`,
  `AiAssistant`, `SurveyUrlResolver`, and `SurveySubmissionHandler`. Each defaults to a working
  package implementation, so the plugin runs out of the box and you override only what your domain needs.

## Internationalization

The plugin follows SurveyJS's own locale model rather than hardcoding a single language:

- **Localizable content** is stored as standard SurveyJS localizable values — a plain string for the
  default locale, or `{ "default": "…", "<locale>": "…" }` for translations — so saved schemas are
  portable to any SurveyJS renderer.
- **Renderer locale** uses survey-core's `surveyLocalization` registry and the bundled `survey.i18n`
  dictionaries. The preview renders in any SurveyJS locale **code** (e.g. `ar`, `en`, `de`, `fr`), not a
  fixed set; an empty code falls back to the survey's own default locale.
- **Direction** is derived from the locale via a SurveyJS-aligned RTL set (`isRtlLocale()` in
  `survey-runtime.js` — `ar`, `fa`, `he`, `ur`, …), so RTL/LTR follows the active locale automatically.
- **Renderer string overrides** are applied per locale through `applySurveyLocaleOverrides()` /
  `DEFAULT_SURVEY_LOCALE_OVERRIDES` (e.g. friendlier validation/upload wording). Pass your own map to
  patch any locale — the package is not tied to one language.
- **Package PHP strings** are fully translatable under the `filament-surveyjs::` namespace and ship Arabic
  and English (`resources/lang/{ar,en}`).
- **Builder UI chrome** ships Arabic + English; additional UI languages can be added by extending the
  builder's `i18n.js` message catalogue.

## Acceptance tests

> Filled in as the plugin surface lands (see the package CHANGELOG / docs).

## License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.
