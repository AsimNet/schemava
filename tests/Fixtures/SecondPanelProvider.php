<?php

namespace AsimNet\Schemava\Tests\Fixtures;

use AsimNet\Schemava\SchemavaPlugin;
use Filament\Panel;
use Filament\PanelProvider;

/**
 * A second, non-default panel that ALSO carries the plugin — with its own
 * backUrl — for asserting that designer resolution honors the originating
 * panel instead of silently using the default panel's plugin.
 */
class SecondPanelProvider extends PanelProvider
{
    public function panel(Panel $panel): Panel
    {
        return $panel
            ->id('second')
            ->path('second')
            ->plugin(SchemavaPlugin::make()->backUrl('https://second.example/forms'));
    }
}
