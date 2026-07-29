<?php

namespace AsimNet\Schemava\Tests\Fixtures;

use Filament\Panel;
use Filament\PanelProvider;

/**
 * A default panel WITHOUT the plugin, mirroring the multi-panel apps from
 * issue #4 where Schemava lives on a secondary panel only.
 */
class HubPanelProvider extends PanelProvider
{
    public function panel(Panel $panel): Panel
    {
        return $panel
            ->default()
            ->id('hub')
            ->path('hub');
    }
}
