# Schemava

[![Latest Version on Packagist](https://img.shields.io/packagist/v/asimnet/schemava.svg?style=flat-square)](https://packagist.org/packages/asimnet/schemava)

> Visual form builder built specifically for **FilamentPHP panels**. Exports **SurveyJS‑compatible JSON**.

Schemava lets you build multilingual forms visually inside your FilamentPHP panel, store the schemas in your
own Laravel application, and export SurveyJS‑compatible JSON. Forms can be previewed and rendered with the
MIT‑licensed open‑source `survey-core` engine. **Schemava does not bundle SurveyJS Creator.**

## Features

- Visual drag‑and‑drop form builder for FilamentPHP panels
- Multilingual schemas (any locale)
- Automatic RTL/LTR preview
- SurveyJS‑compatible JSON export
- Conditional logic and branching
- Quiz scoring
- File upload and signature fields
- Extensible, host‑overridable contracts (runtime context, access rules, AI assistance, URL resolution, submission storage)
- Multi‑tenant‑ready configuration (models, table names, storage disk, renderer version, routes)

## Requirements

- PHP 8.3+
- Laravel 11 or 12
- FilamentPHP 5

## Installation

```bash
composer require asimnet/schemava
php artisan filament:assets
```

## Registering the plugin

Register the plugin on your Filament panel provider:

```php
use AsimNet\Schemava\SchemavaPlugin;
use Filament\Panel;

public function panel(Panel $panel): Panel
{
    return $panel
        // ...
        ->plugin(
            SchemavaPlugin::make()
                ->navigationGroup('Forms'),
        );
}
```

The package registers its compiled builder assets through Filament's asset manager. The host application owns
designer route registration (so multi‑tenant routing stays under its control), pointing routes at
`AsimNet\Schemava\Http\Controllers\SurveyDesignerController`. Publish the config to tune the renderer version,
storage disk, and route options:

```bash
php artisan vendor:publish --tag=schemava-config
```

## FilamentPHP compatibility

Schemava is **built specifically for FilamentPHP panels**. It is **not** a generic Laravel admin panel package
and is **not** intended for Laravel Nova, Orchid, Backpack, MoonShine, or custom admin panels.

## SurveyJS compatibility

Schemava exports **SurveyJS‑compatible JSON** and may render forms with the MIT‑licensed open‑source
`survey-core` engine. Schemava **does not include** SurveyJS Creator, SurveyJS PDF Generator, or SurveyJS
Dashboard. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Trademark notice

Schemava is an independent product and is **not affiliated with, endorsed by, or sponsored by** FilamentPHP,
SurveyJS, or Devsoft Baltic OÜ. FilamentPHP and SurveyJS are trademarks of their respective owners. Schemava
exports SurveyJS‑compatible JSON and does not include SurveyJS Creator, SurveyJS PDF Generator, or SurveyJS
Dashboard.

## Releasing (maintainers)

Publishing is automatic: pushing a tag triggers the registry's webhook, which syncs that version.
Releases follow [semver](https://semver.org) — the suffix decides the channel.

```bash
# Stable release — customers on "^1.0" receive it on their next `composer update`.
git tag v1.0.1 && git push origin main v1.0.1

# Beta / pre-release — only consumers who opt in with @beta (or minimum-stability: beta) receive it.
git tag v1.1.0-beta.1 && git push origin v1.1.0-beta.1
```

Because customers require `"asimnet/schemava": "^1.0"`, Composer's `prefer-stable` keeps a beta tag off their
servers unless they explicitly ask for it — so an in-progress release can never break a production install.
Run `npm run build` and commit `resources/dist/` before tagging if the form builder changed.
