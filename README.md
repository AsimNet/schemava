# Schemava

> **Author guide (Arabic):** [دليل منشئ النماذج المرئي](docs/ar/form-designer.md) — canvas authoring, containers, conditional logic, quizzes, and preview.

> A visual, multilingual form builder built specifically for **FilamentPHP panels** — exports **SurveyJS-compatible JSON**.

Schemava adds a drag-and-drop form **designer** to your FilamentPHP panel. You build forms visually, store the
schemas in your own Laravel database as plain SurveyJS-compatible JSON, and render them anywhere a `survey-core`
engine runs (web or mobile). First-class internationalization with automatic RTL/LTR.

**Schemava does not bundle SurveyJS Creator.** It is an independent builder that produces SurveyJS-compatible
JSON and previews/renders with the MIT-licensed open-source `survey-core` engine.

## Features

- Visual drag-and-drop builder (13 editable field types; advanced SurveyJS types are imported and preserved untouched)
- Multilingual schemas in any locale, with automatic RTL/LTR
- SurveyJS-compatible JSON — no proprietary format, no lock-in
- Conditional logic & branching (a visual rule builder that compiles to `visibleIf` / `enableIf`)
- Quiz scoring, file upload, and signature fields
- An optional AI assistant (bring your own provider)
- Five host-overridable contracts (runtime context, access rules, submissions, URLs, AI)
- Multi-tenant-ready: models, table names, storage disk, renderer version, and routes are all configurable

## Requirements

- PHP 8.2+ (matching Filament's own floor; the package uses no 8.3-only features)
- Laravel 11 or 12
- FilamentPHP 5

## Installation

Schemava is a licensed package distributed from a private Composer repository (it is **not** on public
Packagist). After purchase you receive the repository URL and a license **token** — both are also shown on your
**My License** page.

Point Composer at the repository, authenticate with your token, then require the package:

```bash
composer config repositories.schemava composer https://repo.schemava.dev
composer config bearer.repo.schemava.dev YOUR-LICENSE-TOKEN
composer require asimnet/schemava
```

Publish and run the migrations (this creates the `schemava_schemas` and `schemava_results` tables — the
migrations are publish-only so you can review or adapt them, e.g. custom table names), then publish the builder
assets:

```bash
php artisan vendor:publish --tag=schemava-migrations
php artisan migrate
php artisan filament:assets
```

Or let the installer do all of that (config + migrations) for you:

```bash
php artisan schemava:install
php artisan migrate
php artisan filament:assets
```

> **Nothing is exposed to the internet by installing the package.** The public fill-and-submit form and the
> JSON API are **disabled by default** — see [Collecting responses](#collecting-responses-public-form--json-api)
> to opt in deliberately.

> **CI / Docker:** never commit your token. Provide it at build time via the `COMPOSER_AUTH` environment
> variable instead:
> `COMPOSER_AUTH='{"bearer":{"repo.schemava.dev":"YOUR-LICENSE-TOKEN"}}'`
> (or mount an `auth.json` as a build secret).

## Quick start

Register the plugin on your Filament panel provider (e.g. `app/Providers/Filament/AdminPanelProvider.php`):

```php
use AsimNet\Schemava\SchemavaPlugin;
use Filament\Panel;

public function panel(Panel $panel): Panel
{
    return $panel
        // ...
        ->plugin(SchemavaPlugin::make());
}
```

That's the whole integration. Reload your panel and you'll have a **Forms** section: create a form, then click
**Design** to open the visual builder. No routes or resources to wire up yourself.

## What you get out of the box

Registering the plugin provides:

- A **Forms** Filament resource — list, create, edit, delete (backed by the `SurveySchema` model). Creating a
  form drops you straight into the builder.
- The **visual designer** — an asset-bundled page reached from the resource's **Design** action.
- The **designer routes** (`survey-designer.*`), registered for you from config.
- The compiled builder assets, registered with Filament's asset manager and **loaded only on the designer
  screen**, so they never bloat the rest of your panel.

The service provider also auto-loads the package's migrations, translations, config, and the route-model
binding for `{surveySchema}`.

## Plugin options

```php
SchemavaPlugin::make()
    // Register your OWN resource instead of the bundled one (see "Using your own resource").
    ->surveyResource(false)

    // Group the Forms resource in the panel nav, and order it.
    ->navigationGroup('Content')
    ->navigationSort(20)

    // Gate who can see AND open the builder. Return a bool, or a closure returning one.
    // Defaults to visible for every panel user.
    ->authorize(fn (): bool => auth()->user()->can('manage-forms'))

    // Where the designer's "back" control returns to. Without it, the control
    // falls back to the bundled resource's view page, or to browser history.
    ->backUrl(fn (SurveySchema $schema): string => FormResource::getUrl('index'));
```

| Method | Default | What it does |
|---|---|---|
| `surveyResource(bool)` | `true` | Register the bundled Forms resource. Set `false` to use your own. |
| `navigationGroup(?string)` | `null` | Navigation group for the resource. |
| `navigationSort(int)` | `100` | Navigation sort order. |
| `authorize(Closure\|bool)` | `true` | Gates the resource's `canAccess()` and nav visibility. |
| `backUrl(string\|Closure\|null)` | `null` | The designer's "back" destination. When unset, it falls back to `routes.designer.back_url` (config), then the bundled resource's view page; with no URL at all the control uses browser history (and hides in a fresh tab). |

## Configuration

```bash
php artisan vendor:publish --tag=schemava-config
```

Everything in `config/schemava.php`:

| Key | Purpose |
|---|---|
| `models.schema`, `models.result` | Swap in your own Eloquent subclasses to add domain behaviour (relations, scopes, targeting). The bundled resource, designer, and routes all use whatever you set here. |
| `tables.schemas`, `tables.results` | Override the table names if they clash with yours. |
| `storage.disk` | Filesystem disk for builder images and respondent uploads (default `public`; use a private/S3 disk in production). |
| `storage.images_path`, `storage.files_path` | Path prefixes within that disk. |
| `renderer_version` | The `survey-core` version the builder validates and previews against (default `2.3.16`). |
| `routes.enabled` | Whether the package registers the designer routes. Set `false` if you register your own. |
| `routes.designer` | Prefix + middleware for the designer routes, and `back_url` — the designer's "back" destination (see **Plugin options**). |
| `routes.public` | The optional public form route (**disabled by default**) — enabled flag, prefix, middleware, name. |
| `routes.api` | The optional JSON API (**disabled by default**) — enabled flag, prefix, middleware. |
| `ai.enabled` | The designer's AI assistant (**disabled by default**); needs `laravel/ai` + provider credentials. |
| `contracts.*` | The five host-overridable implementations — see **Extending Schemava**. |
| `navigation.group`, `navigation.sort` | Defaults for the resource nav (the plugin's `navigationGroup()` / `navigationSort()` take precedence). |
| `policy` | An optional policy class to register for the schema model. Leave `null` to rely on your own gates. |

## Rendering forms to your users

Each form is stored as **SurveyJS-compatible JSON** on the `SurveySchema` model's `survey_json` column. Render
it to your end users with the open-source [`survey-core`](https://github.com/surveyjs/survey-library) engine —
the same one the builder previews with. Pass `$schema->survey_json` to a `survey-core` model on the client and
handle its `onComplete` to submit answers back to your app.

Submissions are persisted as `SurveyResult` records through the `SurveySubmissionHandler` contract, so you can
store or route them however your domain needs. Quiz-style scoring is available via the bundled
`SurveyScoreCalculator`.

Before persisting, the public form and JSON API run submitted answers through the `SurveyAnswerValidator`
contract, which rejects (422) unknown keys, missing unconditionally-required answers, out-of-list `choices`
values, and oversized/deeply-nested payloads — see `answer_validation` in `config/schemava.php` for the size
caps and **Extending Schemava** below to swap in your own validator.

> **Renderer lockstep:** set `renderer_version` to the exact `survey-core` version *every* client renders with
> (web, mobile, …) so the builder always validates against the engine that ultimately renders the form.

## Collecting responses (public form + JSON API)

Beyond rendering it yourself, Schemava ships two turnkey ways to collect responses. Both are **disabled by
default** — they are unauthenticated, internet-facing endpoints, so exposing them is an explicit opt-in. Both
reuse the same access rules (`SurveyAccessResolver`) and persistence (`SurveySubmissionHandler`).

**Public web form** — a standalone fill-and-submit page at `GET {prefix}/{hash}` (default `/surveys/{hash}`),
rendered with `survey-js-ui` and pinned to your `renderer_version`.

While the public form is disabled, every share affordance hides itself automatically — the designer's
copy-link action, the resource's "Public form URL" entry, and the view page's "Open public form" action —
because the default `SurveyUrlResolver` returns no public URL rather than a link that would 404.

**JSON API** for mobile / external clients (default prefix `/api/surveys`):

| Method & path | Purpose |
|---|---|
| `GET /api/surveys` | List active forms (`id`, `hash`, `title`, `description`). |
| `GET /api/surveys/{hash}` | Fetch one form: `survey_json`, `renderer_version`, `can_submit`. |
| `POST /api/surveys/{hash}/responses` | Submit `{ "data": { … } }`; returns the created response. |

### Who may submit is your decision

Nothing is exposed by accident — both channels ship **off**, and you enable them in `config/schemava.php`
(publish it first with `php artisan vendor:publish --tag=schemava-config`) or via `.env`:

```php
'routes' => [
    'public' => [
        'enabled' => env('SCHEMAVA_PUBLIC_FORM_ENABLED', false), // true → expose the public form
        'middleware' => ['web'],  // add 'auth' to require a logged-in user
    ],
    'api' => [
        'enabled' => env('SCHEMAVA_API_ENABLED', false), // true → expose the JSON API
        'middleware' => ['api'],  // add 'auth:sanctum' / 'auth:api' to require a token
    ],
],
```

- **When enabled, the default middleware allows guests** — that is what a public form is for. Add auth
  middleware to require a login/token instead.
- For per-form, role, age, or open/close-window rules, bind your own `SurveyAccessResolver` — it gates the form
  **and** the API identically.
- Authenticated submissions are attributed to the current user; guest submissions are stored with no user.

## Extending Schemava (contracts)

Schemava resolves six contracts you can replace to integrate it with your domain. Each ships a sensible
default, so you override only what you need — bind your class in `config('schemava.contracts.*')`:

| Contract | Override to… | Default |
|---|---|---|
| `RuntimeContextProvider` | feed dynamic values (signed-in user, locale, custom variables) into form *piping* | `DefaultRuntimeContextProvider` |
| `SurveyAccessResolver` | decide who may view/submit a form (roles, age, gender, targeting) | `OpenSurveyAccessResolver` |
| `SurveySubmissionHandler` | change how a submission is stored or routed | `DefaultSurveySubmissionHandler` (creates a `SurveyResult`) |
| `SurveyAnswerValidator` | change how submitted answers are checked against the schema before storage | `DefaultSurveyAnswerValidator` |
| `SurveyUrlResolver` | build the public/admin URLs for a form | `DefaultSurveyUrlResolver` |
| `AiAssistant` | answer builder AI queries | `NullAiAssistant` (AI disabled) |

```php
// config/schemava.php
'contracts' => [
    'runtime_context'    => \App\Surveys\MyRuntimeContext::class,
    'access_resolver'    => \App\Surveys\MyAccessResolver::class,
    'submission_handler' => \AsimNet\Schemava\Support\DefaultSurveySubmissionHandler::class,
    'answer_validator'   => \AsimNet\Schemava\Support\DefaultSurveyAnswerValidator::class,
    'url_resolver'       => \AsimNet\Schemava\Support\DefaultSurveyUrlResolver::class,
    'ai_assistant'       => \App\Surveys\MyAiAssistant::class,
],
```

### AI assistant (optional)

The AI assistant lets editors describe a form in plain language and have it drafted (or rewrite a selected
field). It is **off by default** (`ai.enabled => false`). To enable it, install the AI SDK, configure a
provider key, and set `SCHEMAVA_AI_ENABLED=true`:

```bash
composer require laravel/ai
```

You are responsible for reviewing AI-generated content before use.

## Using your own resource

Prefer to build your own Filament resource (custom columns, capability gating, exports)? Disable the bundled
one and point your resource at Schemava's model:

```php
->plugin(SchemavaPlugin::make()->surveyResource(false))
```

```php
use AsimNet\Schemava\Models\SurveySchema; // or your configured subclass
use Filament\Actions\Action;
use Filament\Facades\Filament;
use Filament\Support\Icons\Heroicon;

class FormResource extends Resource
{
    protected static ?string $model = SurveySchema::class;

    // ...your form() and table()...

    // Add a row/header action that opens the visual builder. The optional
    // `panel` parameter tells the (panel-agnostic) designer which panel it was
    // opened from, so plugin options like backUrl() resolve against that panel —
    // it only matters when more than one panel registers the plugin.
    Action::make('design')
        ->icon(Heroicon::PencilSquare)
        ->url(fn (SurveySchema $record): string => route('survey-designer.show', [
            'surveySchema' => $record,
            'panel' => Filament::getCurrentPanel()?->getId(),
        ]));
}
```

The designer routes stay registered by the package (unless you disable them — see below).

## Multi-tenant / custom routes

If your app registers its own designer routes (multi-tenant apps often scope them per tenant), set
`routes.enabled` to `false` so the package doesn't register them too, then register your own group pointing at
the package controller:

```php
// config/schemava.php
'routes' => ['enabled' => false],
```

```php
use AsimNet\Schemava\Http\Controllers\SurveyDesignerController;

Route::middleware(['web', 'auth'])->prefix('survey-designer')->name('survey-designer.')->group(function () {
    Route::get('/{surveySchema}', [SurveyDesignerController::class, 'show'])->name('show');
    Route::post('/{surveySchema}/save', [SurveyDesignerController::class, 'save'])->name('save');
    Route::post('/upload-image', [SurveyDesignerController::class, 'uploadImage'])->name('upload-image');
    Route::post('/{surveySchema}/ai/query', [SurveyDesignerController::class, 'queryAi'])->name('ai-query');
});
```

Keep the route **names** (`survey-designer.*`) — the controller and the bundled resource reference them.

## Authorization

The designer controller authorizes the `update` ability on the schema model **only when a policy is registered
for it**. With no policy, the routes are protected by their middleware (`auth`) alone — fine for a single-admin
panel, but **not enough when your app has non-admin authenticated users** (customers, applicants, members):
any of them could open `survey-designer/{id}` and rewrite a form. In that case register a policy (Laravel
auto-discovery, your `AuthServiceProvider`, or `config('schemava.policy')`) or add a role/permission middleware
to `routes.designer.middleware`. The bundled resource's own visibility is controlled separately by the plugin's
`authorize()` option.

## Updating

Your purchase includes one year of updates:

```bash
composer update asimnet/schemava
php artisan filament:assets
```

Because you require `"asimnet/schemava": "^1.0"`, Composer's `prefer-stable` keeps pre-releases off your servers
unless you explicitly opt in. After your update window ends the plugin keeps working — renewing only unlocks
newer releases.

## Troubleshooting

- **`composer` returns `403` / "could not authenticate":** your token is missing or wrong. Re-run the
  `composer config bearer.repo.schemava.dev …` command with the token from your **My License** page. A refunded
  purchase revokes the token.
- **The builder doesn't load / assets are missing:** run `php artisan filament:assets` after install/update and
  make sure it runs as part of your deploy; then hard-refresh.
- **Image/file uploads fail:** check `storage.disk` is writable and, if public, run `php artisan storage:link`.

## FilamentPHP & SurveyJS compatibility

Schemava is **built specifically for FilamentPHP panels** — not a generic Laravel admin package, and not for
Nova, Orchid, Backpack, MoonShine, or custom panels. It exports **SurveyJS-compatible JSON** and may render with
the MIT-licensed `survey-core` engine; it **does not include** SurveyJS Creator, PDF Generator, or Dashboard.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

Schemava is **commercial, proprietary software** — not open source. It is sold via
[schemava.dev](https://schemava.dev). A purchase grants a non-exclusive, perpetual license to use it in
applications you own or build; you may not resell or redistribute the package itself. See [LICENSE.md](LICENSE.md)
for the full terms, and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the MIT-licensed components it
interoperates with (such as the `survey-core` renderer).

## Trademark notice

Schemava is an independent product and is **not affiliated with, endorsed by, or sponsored by** FilamentPHP,
SurveyJS, or Devsoft Baltic OÜ. FilamentPHP and SurveyJS are trademarks of their respective owners.

## Releasing (maintainers)

Publishing is automatic: pushing a tag triggers the registry's webhook, which syncs that version. Releases
follow [semver](https://semver.org) — the suffix decides the channel.

```bash
# Stable release — customers on "^1.0" receive it on their next `composer update`.
git tag v1.1.2 && git push origin main v1.1.2

# Beta / pre-release — only consumers who opt in with @beta receive it.
git tag v1.2.0-beta.1 && git push origin v1.2.0-beta.1
```

Run `npm run build` and commit `resources/dist/` before tagging **only if the form builder (Vue) changed** —
PHP-only changes don't need a rebuild.
