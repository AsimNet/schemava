<?php

namespace AsimNet\Schemava\Tests\Feature;

use AsimNet\Schemava\Contracts\SurveyUrlResolver;
use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\SchemavaPlugin;
use AsimNet\Schemava\Tests\TestCase;
use PHPUnit\Framework\Attributes\Test;

/**
 * Issue #8: the designer's back control rendered as a dead anchor because
 * adminUrl() always returned null. The default resolver now falls back to the
 * config value, the plugin's backUrl() option, then the bundled resource.
 */
class DesignerBackUrlTest extends TestCase
{
    private function schema(): SurveySchema
    {
        return SurveySchema::query()->create([
            'title' => 'Contact',
            'is_active' => true,
            'survey_json' => ['pages' => []],
        ]);
    }

    #[Test]
    public function it_defaults_to_the_bundled_resource_view_page(): void
    {
        $schema = $this->schema();

        $url = app(SurveyUrlResolver::class)->adminUrl($schema);

        $this->assertIsString($url);
        $this->assertStringContainsString('/admin/survey-schemas/'.$schema->getKey(), $url);
    }

    #[Test]
    public function the_config_back_url_wins_over_everything(): void
    {
        config()->set('schemava.routes.designer.back_url', 'https://example.test/forms');

        $url = app(SurveyUrlResolver::class)->adminUrl($this->schema());

        $this->assertSame('https://example.test/forms', $url);
    }

    #[Test]
    public function the_plugin_back_url_closure_receives_the_schema(): void
    {
        $schema = $this->schema();

        SchemavaPlugin::getOrNull()->backUrl(
            fn (SurveySchema $s): string => 'https://example.test/forms/'.$s->getKey(),
        );

        $url = app(SurveyUrlResolver::class)->adminUrl($schema);

        $this->assertSame('https://example.test/forms/'.$schema->getKey(), $url);
    }
}
