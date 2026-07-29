<?php

namespace AsimNet\Schemava\Tests\Feature;

use AsimNet\Schemava\Filament\Resources\SurveySchemas\SurveySchemaResource;
use AsimNet\Schemava\SchemavaPlugin;
use AsimNet\Schemava\Tests\Fixtures\AdminPanelProvider;
use AsimNet\Schemava\Tests\Fixtures\AwardPanelProvider;
use AsimNet\Schemava\Tests\Fixtures\HubPanelProvider;
use AsimNet\Schemava\Tests\TestCase;
use Filament\Facades\Filament;
use Illuminate\Foundation\Application;
use PHPUnit\Framework\Attributes\Test;

/**
 * Issue #4: registering the plugin on a non-default panel used to fatal the
 * entire app — Filament calls resource statics (navigation, access, relations)
 * while registering EVERY panel, with the "current" panel still the default
 * one, and SchemavaPlugin::get() threw when that panel lacked the plugin.
 */
class MultiPanelPluginTest extends TestCase
{
    /**
     * Swap the single admin panel for a default panel WITHOUT the plugin plus
     * a secondary panel WITH it.
     *
     * @param  Application  $app
     * @return array<int, class-string>
     */
    protected function getPackageProviders($app): array
    {
        $providers = array_filter(
            parent::getPackageProviders($app),
            fn (string $provider): bool => $provider !== AdminPanelProvider::class,
        );

        return [...array_values($providers), HubPanelProvider::class, AwardPanelProvider::class];
    }

    #[Test]
    public function registering_every_panel_does_not_throw_when_the_default_panel_lacks_the_plugin(): void
    {
        // Resolving the registry registers each panel, which invokes the
        // resource statics on the registration hot path (getRelations()).
        $panels = Filament::getPanels();

        $this->assertArrayHasKey('hub', $panels);
        $this->assertArrayHasKey('award', $panels);
        $this->assertFalse($panels['hub']->hasPlugin('schemava'));
        $this->assertTrue($panels['award']->hasPlugin('schemava'));
    }

    #[Test]
    public function the_plugin_resolves_by_scanning_panels_when_the_current_panel_lacks_it(): void
    {
        Filament::setCurrentPanel(Filament::getPanel('hub'));

        $plugin = SchemavaPlugin::getOrNull();

        $this->assertInstanceOf(SchemavaPlugin::class, $plugin);
        $this->assertSame('Forms', $plugin->getNavigationGroup());
    }

    #[Test]
    public function resource_statics_fall_back_instead_of_throwing_outside_the_plugin_panel(): void
    {
        Filament::setCurrentPanel(Filament::getPanel('hub'));

        $this->assertSame('Forms', SurveySchemaResource::getNavigationGroup());
        $this->assertNotSame([], SurveySchemaResource::getRelations());
        $this->assertTrue(SurveySchemaResource::canAccess());
    }
}
