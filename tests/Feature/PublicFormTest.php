<?php

namespace AsimNet\Schemava\Tests\Feature;

use AsimNet\Schemava\Models\SurveyResult;
use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\Tests\TestCase;
use Illuminate\Foundation\Application;
use PHPUnit\Framework\Attributes\Test;

class PublicFormTest extends TestCase
{
    /**
     * The public form is opt-in since #5 — enable it before the provider
     * boots so its routes register for this suite.
     *
     * @param  Application  $app
     */
    protected function defineEnvironment($app): void
    {
        parent::defineEnvironment($app);

        $app['config']->set('schemava.routes.public.enabled', true);
    }

    private function form(array $attributes = []): SurveySchema
    {
        return SurveySchema::query()->create(array_merge([
            'title' => 'Contact',
            'is_active' => true,
            'survey_json' => ['pages' => [['name' => 'p1', 'elements' => [
                ['type' => 'text', 'name' => 'full_name', 'title' => 'Your name', 'isRequired' => true],
                ['type' => 'radiogroup', 'name' => 'color', 'title' => 'Favorite color', 'choices' => ['red', 'green', 'blue']],
            ]]]],
        ], $attributes));
    }

    #[Test]
    public function it_renders_the_public_form_for_an_open_schema(): void
    {
        $schema = $this->form();

        $this->get(route('schemava.public.show', ['hash' => $schema->hash]))
            ->assertOk()
            ->assertSee('full_name', false)          // schema rendered into the page
            ->assertSee('schemava-form-boot', false); // the fillable form, not the unavailable notice
    }

    #[Test]
    public function it_stores_a_public_submission(): void
    {
        $schema = $this->form();

        $this->postJson(route('schemava.public.submit', ['hash' => $schema->hash]), [
            'data' => ['full_name' => 'Sara'],
        ])->assertOk()->assertJson(['success' => true]);

        $result = SurveyResult::query()->first();

        $this->assertNotNull($result);
        $this->assertSame(['full_name' => 'Sara'], $result->data);
        $this->assertSame($schema->getKey(), $result->surveySchema->getKey());
    }

    #[Test]
    public function it_rejects_a_submission_to_an_inactive_schema(): void
    {
        $schema = $this->form(['is_active' => false]);

        $this->postJson(route('schemava.public.submit', ['hash' => $schema->hash]), [
            'data' => ['full_name' => 'Sara'],
        ])->assertStatus(422);

        $this->assertSame(0, SurveyResult::query()->count());
    }

    #[Test]
    public function it_shows_an_unavailable_notice_instead_of_the_form_when_closed(): void
    {
        $schema = $this->form(['is_active' => false]);

        $this->get(route('schemava.public.show', ['hash' => $schema->hash]))
            ->assertOk()
            ->assertDontSee('schemava-form-boot', false);
    }

    #[Test]
    public function it_404s_for_an_unknown_hash(): void
    {
        $this->get(route('schemava.public.show', ['hash' => 'missing000']))->assertNotFound();
    }

    #[Test]
    public function it_rejects_a_submission_with_an_unknown_key(): void
    {
        $schema = $this->form();

        $this->postJson(route('schemava.public.submit', ['hash' => $schema->hash]), [
            'data' => ['full_name' => 'Sara', 'not_a_real_field' => 'x'],
        ])->assertStatus(422);

        $this->assertSame(0, SurveyResult::query()->count());
    }

    #[Test]
    public function it_rejects_a_submission_missing_a_required_answer(): void
    {
        $schema = $this->form();

        $this->postJson(route('schemava.public.submit', ['hash' => $schema->hash]), [
            'data' => [],
        ])->assertStatus(422);

        $this->assertSame(0, SurveyResult::query()->count());
    }

    #[Test]
    public function it_rejects_a_submission_with_an_invalid_choice(): void
    {
        $schema = $this->form();

        $this->postJson(route('schemava.public.submit', ['hash' => $schema->hash]), [
            'data' => ['full_name' => 'Sara', 'color' => 'purple'],
        ])->assertStatus(422);

        $this->assertSame(0, SurveyResult::query()->count());
    }

    #[Test]
    public function it_rejects_an_oversized_submission(): void
    {
        config()->set('schemava.answer_validation.max_payload_bytes', 50);

        $schema = $this->form();

        $this->postJson(route('schemava.public.submit', ['hash' => $schema->hash]), [
            'data' => ['full_name' => str_repeat('a', 200)],
        ])->assertStatus(422);

        $this->assertSame(0, SurveyResult::query()->count());
    }
}
