<?php

namespace Asimnet\FilamentSurveyjs;

use Asimnet\FilamentSurveyjs\Contracts\AiAssistant;
use Asimnet\FilamentSurveyjs\Contracts\RuntimeContextProvider;
use Asimnet\FilamentSurveyjs\Contracts\SurveyAccessResolver;
use Asimnet\FilamentSurveyjs\Contracts\SurveySubmissionHandler;
use Asimnet\FilamentSurveyjs\Contracts\SurveyUrlResolver;
use Asimnet\FilamentSurveyjs\Models\SurveySchema;
use Filament\Support\Assets\Css;
use Filament\Support\Assets\Js;
use Filament\Support\Facades\FilamentAsset;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Route;
use Spatie\LaravelPackageTools\Commands\InstallCommand;
use Spatie\LaravelPackageTools\Package;
use Spatie\LaravelPackageTools\PackageServiceProvider;

class SurveyjsServiceProvider extends PackageServiceProvider
{
    public static string $name = 'filament-surveyjs';

    public static string $viewNamespace = 'filament-surveyjs';

    public function configurePackage(Package $package): void
    {
        $package
            ->name(static::$name)
            ->hasConfigFile('filament-surveyjs')
            ->hasViews(static::$viewNamespace)
            ->hasTranslations()
            ->hasMigrations([
                'create_survey_schemas_table',
                'create_survey_results_table',
            ])
            ->hasInstallCommand(function (InstallCommand $command): void {
                $command
                    ->publishConfigFile()
                    ->publishMigrations()
                    ->askToStarRepoOnGitHub('asimnet/filament-surveyjs');
            });
    }

    public function packageRegistered(): void
    {
        $this->bindContracts();
    }

    public function packageBooted(): void
    {
        $this->registerRouteModelBinding();
        $this->registerAssets();
    }

    /**
     * Bind each host-overridable contract to the implementation named in config.
     */
    protected function bindContracts(): void
    {
        $bindings = [
            RuntimeContextProvider::class => 'runtime_context',
            SurveyAccessResolver::class => 'access_resolver',
            AiAssistant::class => 'ai_assistant',
            SurveyUrlResolver::class => 'url_resolver',
            SurveySubmissionHandler::class => 'submission_handler',
        ];

        foreach ($bindings as $contract => $configKey) {
            $this->app->bind($contract, function ($app) use ($configKey) {
                return $app->make(config("filament-surveyjs.contracts.{$configKey}"));
            });
        }
    }

    /**
     * Resolve the `{surveySchema}` route parameter through the configured model
     * (a host subclass), preserving its own resolveRouteBinding() behavior — id
     * validation, hash binding, and any global-scope handling — so the host
     * model and its policy apply regardless of the package controller type-hint.
     */
    protected function registerRouteModelBinding(): void
    {
        Route::bind('surveySchema', function ($value, $route) {
            /** @var class-string<Model> $class */
            $class = config('filament-surveyjs.models.schema', SurveySchema::class);

            $field = method_exists($route, 'bindingFieldFor')
                ? $route->bindingFieldFor('surveySchema')
                : null;

            $model = (new $class)->resolveRouteBinding($value, $field);

            abort_if($model === null, 404);

            return $model;
        });
    }

    /**
     * Register the compiled builder bundle with Filament's asset manager.
     *
     * Marked `loadedOnRequest()` so the (large) builder bundle is NOT injected
     * into every Filament panel page; the standalone designer view loads it
     * explicitly via FilamentAsset::getScriptSrc()/getStyleHref().
     */
    protected function registerAssets(): void
    {
        $dist = __DIR__.'/../resources/dist';

        FilamentAsset::register([
            Css::make('filament-surveyjs-builder', "{$dist}/filament-surveyjs-builder.css")->loadedOnRequest(),
            Js::make('filament-surveyjs-builder', "{$dist}/filament-surveyjs-builder.js")->loadedOnRequest(),
        ], package: 'asimnet/filament-surveyjs');
    }
}
