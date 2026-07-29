<?php

namespace AsimNet\Schemava\Tests\Fixtures;

use AsimNet\Schemava\SchemavaPlugin;
use Filament\Panel;
use Filament\PanelProvider;

/**
 * A secondary (non-default) panel that carries the plugin — the registration
 * order that used to fatal the whole app (issue #4).
 */
class AwardPanelProvider extends PanelProvider
{
    public function panel(Panel $panel): Panel
    {
        return $panel
            ->id('award')
            ->path('award')
            ->plugin(SchemavaPlugin::make()->navigationGroup('Forms'));
    }
}
