<?php

namespace AsimNet\Schemava\Tests\Fixtures;

use AsimNet\Schemava\SchemavaPlugin;
use Filament\Panel;
use Filament\PanelProvider;

/**
 * Minimal default panel for the test suite that registers the bundled
 * {@see SchemavaPlugin} (and therefore the SurveySchema resource and its
 * responses relation manager) so plugin-aware code paths resolve a real panel.
 */
class AdminPanelProvider extends PanelProvider
{
    public function panel(Panel $panel): Panel
    {
        return $panel
            ->default()
            ->id('admin')
            ->path('admin')
            ->plugin(SchemavaPlugin::make());
    }
}
