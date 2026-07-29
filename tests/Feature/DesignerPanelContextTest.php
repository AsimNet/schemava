<?php

namespace AsimNet\Schemava\Tests\Feature;

use AsimNet\Schemava\Contracts\SurveyUrlResolver;
use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\Tests\Fixtures\SecondPanelProvider;
use AsimNet\Schemava\Tests\TestCase;
use Filament\Facades\Filament;
use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Foundation\Application;
use PHPUnit\Framework\Attributes\Test;

/**
 * When several panels carry the plugin, the designer must resolve plugin
 * options (backUrl) against the panel it was opened FROM — the bundled
 * resources pass it as the `panel` query parameter — not against whichever
 * panel happens to be Filament's default.
 */
class DesignerPanelContextTest extends TestCase
{
    /**
     * @param  Application  $app
     * @return array<int, class-string>
     */
    protected function getPackageProviders($app): array
    {
        return [...parent::getPackageProviders($app), SecondPanelProvider::class];
    }

    private function schema(): SurveySchema
    {
        return SurveySchema::query()->create([
            'title' => 'Contact',
            'is_active' => true,
            'survey_json' => ['pages' => []],
        ]);
    }

    #[Test]
    public function the_back_url_uses_the_current_panel_plugin_when_it_carries_one(): void
    {
        $schema = $this->schema();
        $resolver = app(SurveyUrlResolver::class);

        // Default (admin) panel: its plugin sets no backUrl, so the bundled
        // resource view page wins.
        $this->assertStringContainsString('/admin/', (string) $resolver->adminUrl($schema));

        Filament::setCurrentPanel(Filament::getPanel('second'));

        $this->assertSame('https://second.example/forms', $resolver->adminUrl($schema));
    }

    #[Test]
    public function the_designer_honors_the_originating_panel_query_parameter(): void
    {
        $schema = $this->schema();

        $this->withoutMiddleware(Authenticate::class);

        $this->get(route('survey-designer.show', ['surveySchema' => $schema->getKey(), 'panel' => 'second']))
            ->assertOk()
            ->assertSee('second.example', false);
    }

    #[Test]
    public function an_unknown_or_pluginless_panel_parameter_is_ignored(): void
    {
        $schema = $this->schema();

        $this->withoutMiddleware(Authenticate::class);

        $this->get(route('survey-designer.show', ['surveySchema' => $schema->getKey(), 'panel' => 'nope']))
            ->assertOk()
            ->assertDontSee('second.example', false);
    }
}
