<?php

namespace AsimNet\Schemava\Tests\Feature;

use AsimNet\Schemava\Contracts\SurveyUrlResolver;
use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\SchemavaPlugin;
use AsimNet\Schemava\Support\DefaultSurveyUrlResolver;
use AsimNet\Schemava\Tests\TestCase;
use Illuminate\Auth\Middleware\Authenticate;
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

    #[Test]
    public function without_an_explicit_url_the_designer_uses_history_with_the_resource_as_fallback(): void
    {
        $schema = $this->schema();
        $resolver = app(SurveyUrlResolver::class);

        $this->assertInstanceOf(DefaultSurveyUrlResolver::class, $resolver);
        $this->assertNull($resolver->configuredBackUrl($schema));
        $this->assertStringContainsString('/admin/survey-schemas/'.$schema->getKey(), (string) $resolver->fallbackBackUrl($schema));
    }

    #[Test]
    public function an_explicit_url_is_reported_as_configured(): void
    {
        config()->set('schemava.routes.designer.back_url', 'https://example.test/forms');

        $this->assertSame(
            'https://example.test/forms',
            app(SurveyUrlResolver::class)->configuredBackUrl($this->schema()),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function bootRoutes(SurveySchema $schema): array
    {
        $this->withoutMiddleware(Authenticate::class);

        $payload = $this->get(route('survey-designer.show', ['surveySchema' => $schema->getKey()]))
            ->assertOk()
            ->viewData('bootPayload');

        return $payload['routes'];
    }

    #[Test]
    public function the_designer_sends_no_explicit_back_url_by_default_so_history_is_used(): void
    {
        $schema = $this->schema();

        $routes = $this->bootRoutes($schema);

        $this->assertNull($routes['backUrl']);
        $this->assertStringContainsString('/admin/survey-schemas/'.$schema->getKey(), (string) $routes['backFallbackUrl']);
    }

    #[Test]
    public function a_subclass_overriding_admin_url_keeps_its_explicit_destination(): void
    {
        $this->app->bind(SurveyUrlResolver::class, fn () => new class extends DefaultSurveyUrlResolver
        {
            public function adminUrl(SurveySchema $schema): ?string
            {
                return 'https://host.example/forms/'.$schema->getKey();
            }
        });

        $schema = $this->schema();

        $routes = $this->bootRoutes($schema);

        $this->assertSame('https://host.example/forms/'.$schema->getKey(), $routes['backUrl']);
        $this->assertNull($routes['backFallbackUrl']);
    }
}
