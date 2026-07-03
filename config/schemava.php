<?php

use AsimNet\Schemava\Models\SurveyResult;
use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\Support\DefaultRuntimeContextProvider;
use AsimNet\Schemava\Support\DefaultSurveyAnswerValidator;
use AsimNet\Schemava\Support\DefaultSurveySubmissionHandler;
use AsimNet\Schemava\Support\DefaultSurveyUrlResolver;
use AsimNet\Schemava\Support\NullAiAssistant;
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
        'ai_assistant' => NullAiAssistant::class,
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
        ],

        // Public, browser-rendered fill-and-submit form. WHO MAY SUBMIT IS YOUR
        // CALL: the default middleware allows guests — add 'auth' to require a
        // logged-in user, and/or bind a SurveyAccessResolver for finer rules.
        // Set 'enabled' => false to not expose a public form at all.
        'public' => [
            'enabled' => true,
            'name' => 'schemava.public.show',
            'prefix' => 'surveys',
            'middleware' => ['web'],
        ],

        // JSON API for mobile / external clients (list forms, fetch one, submit).
        // Same principle: the default middleware is open — add e.g. 'auth:sanctum'
        // or 'auth:api' to require a token. Set 'enabled' => false to turn it off.
        'api' => [
            'enabled' => true,
            'prefix' => 'api/surveys',
            'middleware' => ['api'],
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
