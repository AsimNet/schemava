<?php

namespace AsimNet\Schemava;

use AsimNet\Schemava\Contracts\AiAssistant;
use AsimNet\Schemava\Contracts\RuntimeContextProvider;
use AsimNet\Schemava\Contracts\SurveyAccessResolver;
use AsimNet\Schemava\Contracts\SurveySubmissionHandler;
use AsimNet\Schemava\Contracts\SurveyUrlResolver;
use AsimNet\Schemava\Http\Controllers\SurveyDesignerController;
use AsimNet\Schemava\Models\SurveySchema;
use Filament\Support\Assets\Css;
use Filament\Support\Assets\Js;
use Filament\Support\Facades\FilamentAsset;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Spatie\LaravelPackageTools\Commands\InstallCommand;
use Spatie\LaravelPackageTools\Package;
use Spatie\LaravelPackageTools\PackageServiceProvider;

class SchemavaServiceProvider extends PackageServiceProvider
{
    public static string $name = 'schemava';

    public static string $viewNamespace = 'schemava';

    public function configurePackage(Package $package): void
    {
        $package
            ->name(static::$name)
            ->hasConfigFile('schemava')
            ->hasViews(static::$viewNamespace)
            ->hasTranslations()
            ->hasMigrations([
                'create_schemava_schemas_table',
                'create_schemava_results_table',
            ])
            ->hasInstallCommand(function (InstallCommand $command): void {
                $command
                    ->publishConfigFile()
                    ->publishMigrations()
                    ->askToStarRepoOnGitHub('asimnet/schemava');
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
        $this->registerDesignerRoutes();
        $this->registerPolicy();
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
                return $app->make(config("schemava.contracts.{$configKey}"));
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
            $class = config('schemava.models.schema', SurveySchema::class);

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
            Css::make('schemava-builder', "{$dist}/schemava-builder.css")->loadedOnRequest(),
            Js::make('schemava-builder', "{$dist}/schemava-builder.js")->loadedOnRequest(),
        ], package: 'asimnet/schemava');
    }

    /**
     * Register the visual designer routes from config. Host apps that register
     * their own designer routes (multi-tenant apps do) set `routes.enabled` to
     * false so the package does not also register — and clash with — them.
     */
    protected function registerDesignerRoutes(): void
    {
        if (! config('schemava.routes.enabled', true)) {
            return;
        }

        $designer = config('schemava.routes.designer', []);

        Route::middleware($designer['middleware'] ?? ['web', 'auth'])
            ->prefix($designer['prefix'] ?? 'survey-designer')
            ->name('survey-designer.')
            ->group(function (): void {
                Route::get('/{surveySchema}', [SurveyDesignerController::class, 'show'])->name('show');
                Route::post('/{surveySchema}/save', [SurveyDesignerController::class, 'save'])->name('save');
                Route::post('/upload-image', [SurveyDesignerController::class, 'uploadImage'])->name('upload-image');
                Route::post('/{surveySchema}/ai/query', [SurveyDesignerController::class, 'queryAi'])->name('ai-query');
            });
    }

    /**
     * Bind the optional schema policy named in config, when the host provides one.
     */
    protected function registerPolicy(): void
    {
        $policy = config('schemava.policy');

        if ($policy) {
            Gate::policy(config('schemava.models.schema', SurveySchema::class), $policy);
        }
    }
}
