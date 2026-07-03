<?php

namespace Workbench\App\Providers;

use AsimNet\Schemava\SchemavaPlugin;
use Filament\Panel;
use Filament\PanelProvider;

class AdminPanelProvider extends PanelProvider
{
    public function panel(Panel $panel): Panel
    {
        return $panel
            ->default()
            ->id('admin')
            ->path('admin')
            ->login()
            ->plugin(SchemavaPlugin::make());
    }
}
