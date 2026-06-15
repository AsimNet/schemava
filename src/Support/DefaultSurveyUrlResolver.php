<?php

namespace Asimnet\FilamentSurveyjs\Support;

use Asimnet\FilamentSurveyjs\Contracts\SurveyUrlResolver;
use Asimnet\FilamentSurveyjs\Models\SurveySchema;
use Illuminate\Support\Facades\Route;

/**
 * Builds the public survey URL from the package's named public route when it is
 * registered, falling back to the configured route prefix + the schema hash.
 */
class DefaultSurveyUrlResolver implements SurveyUrlResolver
{
    public function publicUrl(SurveySchema $schema): string
    {
        $routeName = config('filament-surveyjs.routes.public.name', 'filament-surveyjs.public.show');

        if (Route::has($routeName)) {
            return route($routeName, ['surveySchema' => $schema->hash]);
        }

        $prefix = trim((string) config('filament-surveyjs.routes.public.prefix', 'surveys'), '/');

        return url($prefix.'/'.$schema->hash);
    }

    public function adminUrl(SurveySchema $schema): ?string
    {
        return null;
    }
}
