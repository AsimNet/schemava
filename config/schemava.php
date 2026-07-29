<?php

use AsimNet\Schemava\Models\SurveyResult;
use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\Support\DefaultRuntimeContextProvider;
use AsimNet\Schemava\Support\DefaultSurveyAnswerValidator;
use AsimNet\Schemava\Support\DefaultSurveySubmissionHandler;
use AsimNet\Schemava\Support\DefaultSurveyUrlResolver;
use AsimNet\Schemava\Support\LaravelAiAssistant;
use AsimNet\Schemava\Support\OpenSurveyAccessResolver;

return [

    /*
    |--------------------------------------------------------------------------
    | Models
    |--------------------------------------------------------------------------
    |
    | The Eloquent models used for schemas and results. Host apps typically
    | bind their own subclasses here to add domain behavior (e.g. help-form
    | handling, activity targeting, custom user relations).
    |
    */

    'models' => [
        'schema' => SurveySchema::class,
        'result' => SurveyResult::class,
    ],

    /*
    |--------------------------------------------------------------------------
    | Tables
    |--------------------------------------------------------------------------
    */

    'tables' => [
        'schemas' => 'schemava_schemas',
        'results' => 'schemava_results',
        'schema_foreign_key' => 'schemava_schema_id',
    ],

    /*
    |--------------------------------------------------------------------------
    | Storage
    |--------------------------------------------------------------------------
    |
    | The filesystem disk and path prefixes used for builder images and
    | respondent file uploads.
    |
    */

    'storage' => [
        'disk' => env('FILAMENT_SURVEYJS_DISK', 'public'),
        'images_path' => 'surveys/images',
        'files_path' => 'surveys',
    ],

    /*
    |--------------------------------------------------------------------------
    | SurveyJS renderer version
    |--------------------------------------------------------------------------
    |
    | The survey-core engine the builder validates and previews against, and the
    | engine that renders saved schemas in production. The renderer is BUNDLED
    | with the package (resources/dist/vendor/surveyjs, served as published
    | assets — no CDN, so previews work behind TLS-inspection proxies); this
    | value records that bundled version. Keep it in lockstep with every client
    | that renders the saved JSON (e.g. a mobile app using survey-angular-ui),
    | and replace the bundled files when bumping it.
    |
    */

    'renderer_version' => '2.3.16',

    /*
    |--------------------------------------------------------------------------
    | Designer interface language
    |--------------------------------------------------------------------------
    |
    | Default UI language ('ar' | 'en') for the visual form designer. Applies
    | until the author picks a language from the designer's own menu (that
    | choice is remembered per browser and then wins over this default).
    |
    */

    'designer_ui_locale' => 'ar',

    /*
    |--------------------------------------------------------------------------
    | AI assistant
    |--------------------------------------------------------------------------
    |
    | The designer's AI building assistant, built on Laravel's first-party AI
    | SDK (composer require laravel/ai). Provider credentials live in the
    | SDK's own config/ai.php (OPENAI_API_KEY, ANTHROPIC_API_KEY, …) — here
    | you only pick which provider/model Schemava uses. The assistant appears
    | ONLY when 'enabled' is on AND laravel/ai is installed AND the chosen
    | provider has credentials; otherwise the button is hidden and the
    | endpoint refuses queries. OFF BY DEFAULT — opt in with
    | SCHEMAVA_AI_ENABLED=true (or 'enabled' => true here). OpenRouter: use
    | the SDK's openai provider with OPENAI_URL=https://openrouter.ai/api/v1.
    |
    */

    'ai' => [
        'enabled' => env('SCHEMAVA_AI_ENABLED', false),
        // null = the laravel/ai default provider (config('ai.default')).
        'provider' => env('SCHEMAVA_AI_PROVIDER'),
        // null = the provider's default model.
        'model' => env('SCHEMAVA_AI_MODEL'),
        'timeout' => env('SCHEMAVA_AI_TIMEOUT', 90),
    ],

    /*
    |--------------------------------------------------------------------------
    | Contracts
    |--------------------------------------------------------------------------
    |
    | Implementations the package resolves for host-specific concerns. Swap any
    | of these for your own class to integrate the plugin with your domain.
    |
    */

    'contracts' => [
        'runtime_context' => DefaultRuntimeContextProvider::class,
        'access_resolver' => OpenSurveyAccessResolver::class,
        'ai_assistant' => LaravelAiAssistant::class,
        'url_resolver' => DefaultSurveyUrlResolver::class,
        'submission_handler' => DefaultSurveySubmissionHandler::class,
        'answer_validator' => DefaultSurveyAnswerValidator::class,
    ],

    /*
    |--------------------------------------------------------------------------
    | Answer validation
    |--------------------------------------------------------------------------
    |
    | Limits enforced by the default SurveyAnswerValidator against public/API
    | submissions, before they reach the SurveySubmissionHandler.
    |
    */

    'answer_validation' => [
        // Max size (bytes) of the JSON-encoded `data` payload.
        'max_payload_bytes' => 65536,

        // Max nesting depth of the `data` payload.
        'max_depth' => 10,
    ],

    /*
    |--------------------------------------------------------------------------
    | Routes
    |--------------------------------------------------------------------------
    |
    | Prefix, middleware and naming for the designer, public form, and mobile
    | API routes. Registered by the package service provider (Phase 3).
    |
    */

    'routes' => [

        // Master switch. Host apps that register the routes themselves (e.g.
        // multi-tenant apps) set this to false so the package registers none.
        'enabled' => true,

        'designer' => [
            'prefix' => 'survey-designer',
            'middleware' => ['web', 'auth'],

            // Where the designer's "back" control returns to. Null resolves,
            // in order: SchemavaPlugin::backUrl(), then the bundled Forms
            // resource's view page when it is registered. For per-schema URLs
            // use the plugin option or bind your own SurveyUrlResolver.
            'back_url' => null,
        ],

        // Public, browser-rendered fill-and-submit form. DISABLED BY DEFAULT:
        // enabling it exposes an unauthenticated, internet-facing endpoint, so
        // that is an explicit opt-in. When you enable it, WHO MAY SUBMIT IS
        // YOUR CALL: the default middleware allows guests — add 'auth' to
        // require a logged-in user, and/or bind a SurveyAccessResolver for
        // finer rules. The submit route additionally always gets the
        // `schemava-submit` rate limiter (see `rate_limiting` below),
        // independent of what's listed here.
        'public' => [
            'enabled' => env('SCHEMAVA_PUBLIC_FORM_ENABLED', false),
            'name' => 'schemava.public.show',
            'prefix' => 'surveys',
            'middleware' => ['web'],
        ],

        // JSON API for mobile / external clients (list forms, fetch one, submit).
        // DISABLED BY DEFAULT for the same reason — enabling it publishes a
        // guest-open listing of every active form. When you enable it, add e.g.
        // 'auth:sanctum' or 'auth:api' to the middleware to require a token.
        // The submit route additionally always gets the `schemava-submit` rate
        // limiter (see `rate_limiting` below), independent of what's listed here.
        'api' => [
            'enabled' => env('SCHEMAVA_API_ENABLED', false),
            'prefix' => 'api/surveys',
            'middleware' => ['api'],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Rate limiting
    |--------------------------------------------------------------------------
    |
    | The public and API submit routes are unauthenticated and reachable by
    | anyone who knows (or guesses) a form's hash, so the package throttles
    | them itself via a named `schemava-submit` rate limiter, keyed by request
    | IP — independent of, and in addition to, the `web`/`api` middleware
    | groups' own limiters. Set `enabled` to false only if the host app already
    | throttles these routes elsewhere (e.g. at a reverse proxy/CDN).
    |
    */

    'rate_limiting' => [
        'enabled' => true,

        'submit' => [
            'max_attempts' => 10,
            'decay_seconds' => 60,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Navigation
    |--------------------------------------------------------------------------
    */

    'navigation' => [
        'group' => null,
        'sort' => 100,
    ],

    /*
    |--------------------------------------------------------------------------
    | Authorization
    |--------------------------------------------------------------------------
    |
    | Optional policy class for the schema model. When null, no policy is
    | registered by the package and the host app's own gates apply.
    |
    */

    'policy' => null,

];
