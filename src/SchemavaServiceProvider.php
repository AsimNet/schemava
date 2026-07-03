<?php

namespace AsimNet\Schemava;

use AsimNet\Schemava\Contracts\AiAssistant;
use AsimNet\Schemava\Contracts\RuntimeContextProvider;
use AsimNet\Schemava\Contracts\SurveyAccessResolver;
use AsimNet\Schemava\Contracts\SurveyAnswerValidator;
use AsimNet\Schemava\Contracts\SurveySubmissionHandler;
use AsimNet\Schemava\Contracts\SurveyUrlResolver;
use AsimNet\Schemava\Http\Controllers\ApiFormController;
use AsimNet\Schemava\Http\Controllers\PublicFormController;
use AsimNet\Schemava\Http\Controllers\SurveyDesignerController;
use AsimNet\Schemava\Models\SurveySchema;
use Filament\Support\Assets\Css;
use Filament\Support\Assets\Js;
use Filament\Support\Facades\FilamentAsset;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
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
                'add_submitter_fingerprint_to_schemava_results_table',
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
        $this->registerRateLimiting();
        $this->registerDesignerRoutes();
        $this->registerPublicRoutes();
        $this->registerApiRoutes();
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
            SurveyAnswerValidator::class => 'answer_validator',
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
        $filament = __DIR__.'/../resources/filament';

        FilamentAsset::register([
            Css::make('schemava-builder', "{$dist}/schemava-builder.css")->loadedOnRequest(),
            Js::make('schemava-builder', "{$dist}/schemava-builder.js")->loadedOnRequest(),
            // Loaded on every panel page (NOT loadedOnRequest) so the response-viewer
            // Alpine component is registered before any Filament modal that uses it
            // opens — Livewire does not execute <script> tags injected into modals.
            // Lives in resources/filament (a shipped dir) rather than resources/js,
            // which is export-ignored from the distributed package.
            Js::make('schemava-result-viewer', "{$filament}/survey-result-viewer.js"),
        ], package: 'asimnet/schemava');
    }

    /**
     * Register the `schemava-submit` named rate limiter used by the public and
     * API submit routes. These are unauthenticated, guessable-hash-reachable
     * endpoints, so the package throttles them itself rather than relying on
     * whatever the host's `web`/`api` middleware groups happen to configure.
     * Keyed by request IP; tunable (or disabled) via `schemava.rate_limiting`.
     */
    protected function registerRateLimiting(): void
    {
        RateLimiter::for('schemava-submit', function (Request $request) {
            $config = config('schemava.rate_limiting.submit', []);

            return (new Limit(
                $request->ip(),
                (int) ($config['max_attempts'] ?? 10),
                (int) ($config['decay_seconds'] ?? 60),
            ))->response(fn () => response()->json([
                'message' => __('schemava::surveyjs.unavailable.rate_limited'),
            ], 429));
        });
    }

    /**
     * Middleware applied to the public/API submit routes on top of whatever
     * `routes.public.middleware` / `routes.api.middleware` already declare.
     * Set `schemava.rate_limiting.enabled` to false to opt out (e.g. when the
     * host app throttles these routes itself at a proxy).
     *
     * @return array<int, string>
     */
    protected function submitRateLimitMiddleware(): array
    {
        return config('schemava.rate_limiting.enabled', true) ? ['throttle:schemava-submit'] : [];
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
     * Register the public, unauthenticated form routes (fill + submit) from
     * config. Gated by the same `routes.enabled` flag host apps use when they
     * take over route registration themselves.
     */
    protected function registerPublicRoutes(): void
    {
        $public = config('schemava.routes.public', []);

        if (! config('schemava.routes.enabled', true) || ($public['enabled'] ?? true) === false) {
            return;
        }

        Route::middleware($public['middleware'] ?? ['web'])
            ->prefix($public['prefix'] ?? 'surveys')
            ->group(function () use ($public): void {
                Route::get('/{hash}', [PublicFormController::class, 'show'])
                    ->name($public['name'] ?? 'schemava.public.show');
                Route::post('/{hash}', [PublicFormController::class, 'submit'])
                    ->middleware($this->submitRateLimitMiddleware())
                    ->name('schemava.public.submit');
            });
    }

    /**
     * Register the JSON API routes (list / fetch / submit) for mobile and
     * external clients. Authentication is the host app's decision via
     * `routes.api.middleware`; disable entirely with `routes.api.enabled`.
     */
    protected function registerApiRoutes(): void
    {
        $api = config('schemava.routes.api', []);

        if (! config('schemava.routes.enabled', true) || ($api['enabled'] ?? true) === false) {
            return;
        }

        Route::middleware($api['middleware'] ?? ['api'])
            ->prefix($api['prefix'] ?? 'api/surveys')
            ->name('schemava.api.')
            ->group(function (): void {
                Route::get('/', [ApiFormController::class, 'index'])->name('index');
                Route::get('/{hash}', [ApiFormController::class, 'show'])->name('show');
                Route::post('/{hash}/responses', [ApiFormController::class, 'submit'])
                    ->middleware($this->submitRateLimitMiddleware())
                    ->name('submit');
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
