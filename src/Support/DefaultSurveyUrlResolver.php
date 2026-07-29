<?php

namespace AsimNet\Schemava\Support;

use AsimNet\Schemava\Contracts\SurveyUrlResolver;
use AsimNet\Schemava\Filament\Resources\SurveySchemas\SurveySchemaResource;
use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\SchemavaPlugin;
use Filament\Facades\Filament;
use Illuminate\Support\Facades\Route;
use Throwable;

/**
 * Builds the public survey URL from the package's named public route when it is
 * registered, falling back to the configured route prefix + the schema hash.
 */
class DefaultSurveyUrlResolver implements SurveyUrlResolver
{
    public function publicUrl(SurveySchema $schema): string
    {
        $routeName = config('schemava.routes.public.name', 'schemava.public.show');

        if (Route::has($routeName)) {
            return route($routeName, ['hash' => $schema->hash]);
        }

        // The prefix guess only makes sense when the host opted into a public
        // form but registers the routes itself (routes.enabled => false). With
        // the public form disabled there is no URL to share — return '' so the
        // share/copy-link affordances hide instead of handing out a 404.
        if (! config('schemava.routes.public.enabled', false)) {
            return '';
        }

        $prefix = trim((string) config('schemava.routes.public.prefix', 'surveys'), '/');

        return url($prefix.'/'.$schema->hash);
    }

    /**
     * The designer's "back" destination, resolved in order: the explicit
     * `routes.designer.back_url` config value, the plugin's `backUrl()` option,
     * then the bundled Forms resource's view page on a panel that carries it.
     * Null (no back control) only when none of those yields a URL.
     */
    public function adminUrl(SurveySchema $schema): ?string
    {
        $configured = config('schemava.routes.designer.back_url');

        if (is_string($configured) && $configured !== '') {
            return $configured;
        }

        $plugin = SchemavaPlugin::getOrNull();

        if ($plugin !== null && ($url = $plugin->getBackUrl($schema)) !== null) {
            return $url;
        }

        return $this->bundledResourceUrl($schema);
    }

    /**
     * The bundled resource's view page for this schema, from the first panel
     * that registers the plugin with the resource enabled (preferring the
     * current panel). Null when the resource is disabled everywhere or the URL
     * cannot be built (e.g. unresolved tenancy) — the designer is often opened
     * outside any panel-scoped request, so this must never throw.
     */
    protected function bundledResourceUrl(SurveySchema $schema): ?string
    {
        try {
            $panels = Filament::getPanels();
        } catch (Throwable) {
            return null;
        }

        $current = Filament::getCurrentOrDefaultPanel();

        if ($current !== null) {
            $panels = [$current, ...array_values($panels)];
        }

        foreach ($panels as $panel) {
            if (! $panel->hasPlugin('schemava')) {
                continue;
            }

            /** @var SchemavaPlugin $plugin */
            $plugin = $panel->getPlugin('schemava');

            if (! $plugin->hasSurveyResource()) {
                continue;
            }

            try {
                return SurveySchemaResource::getUrl('view', ['record' => $schema], panel: $panel->getId());
            } catch (Throwable) {
                continue;
            }
        }

        return null;
    }
}
