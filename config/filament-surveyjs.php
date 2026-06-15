<?php

use Asimnet\FilamentSurveyjs\Models\SurveyResult;
use Asimnet\FilamentSurveyjs\Models\SurveySchema;
use Asimnet\FilamentSurveyjs\Support\DefaultRuntimeContextProvider;
use Asimnet\FilamentSurveyjs\Support\DefaultSurveySubmissionHandler;
use Asimnet\FilamentSurveyjs\Support\DefaultSurveyUrlResolver;
use Asimnet\FilamentSurveyjs\Support\NullAiAssistant;
use Asimnet\FilamentSurveyjs\Support\OpenSurveyAccessResolver;

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
        'schemas' => 'survey_schemas',
        'results' => 'survey_results',
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
    | engine that renders saved schemas in production. Keep this in lockstep
    | with every client that renders the saved JSON (e.g. a mobile app using
    | survey-angular-ui) so the builder never validates on a different engine
    | than the one that ultimately renders the result.
    |
    */

    'renderer_version' => '2.3.16',

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
        'enabled' => true,
        'designer' => [
            'prefix' => 'survey-designer',
            'middleware' => ['web', 'auth'],
        ],
        'public' => [
            'name' => 'filament-surveyjs.public.show',
            'prefix' => 'surveys',
            'middleware' => ['web'],
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
