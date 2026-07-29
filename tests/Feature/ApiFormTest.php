<?php

namespace AsimNet\Schemava\Tests\Feature;

use AsimNet\Schemava\Models\SurveyResult;
use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\Tests\TestCase;
use Illuminate\Foundation\Application;
use PHPUnit\Framework\Attributes\Test;

class ApiFormTest extends TestCase
{
    /**
     * The JSON API is opt-in since #5 — enable it before the provider boots
     * so its routes register for this suite.
     *
     * @param  Application  $app
     */
    protected function defineEnvironment($app): void
    {
        parent::defineEnvironment($app);

        $app['config']->set('schemava.routes.api.enabled', true);
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
    public function it_lists_active_forms_only(): void
    {
        $active = $this->form();
        $this->form(['is_active' => false]);

        $this->getJson(route('schemava.api.index'))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.hash', $active->hash);
    }

    #[Test]
    public function it_returns_a_single_form_with_its_schema(): void
    {
        $schema = $this->form();

        $this->getJson(route('schemava.api.show', ['hash' => $schema->hash]))
            ->assertOk()
            ->assertJsonPath('data.hash', $schema->hash)
            ->assertJsonPath('data.can_submit', true)
            ->assertJsonPath('data.renderer_version', config('schemava.renderer_version'))
            ->assertJsonStructure(['data' => ['id', 'hash', 'title', 'survey_json']]);
    }

    #[Test]
    public function it_accepts_a_submission_and_returns_the_created_response(): void
    {
        $schema = $this->form();

        $this->postJson(route('schemava.api.submit', ['hash' => $schema->hash]), [
            'data' => ['full_name' => 'Sara'],
        ])->assertCreated()->assertJsonPath('data.status', 'submitted');

        $result = SurveyResult::query()->first();

        $this->assertNotNull($result);
        $this->assertSame(['full_name' => 'Sara'], $result->data);
    }

    #[Test]
    public function it_rejects_a_submission_to_a_closed_form(): void
    {
        $schema = $this->form(['is_active' => false]);

        $this->postJson(route('schemava.api.submit', ['hash' => $schema->hash]), [
            'data' => ['full_name' => 'Sara'],
        ])->assertStatus(422);

        $this->assertSame(0, SurveyResult::query()->count());
    }

    #[Test]
    public function it_404s_for_an_unknown_form(): void
    {
        $this->getJson(route('schemava.api.show', ['hash' => 'missing000']))->assertNotFound();
    }

    #[Test]
    public function it_rejects_a_submission_with_an_unknown_key(): void
    {
        $schema = $this->form();

        $this->postJson(route('schemava.api.submit', ['hash' => $schema->hash]), [
            'data' => ['full_name' => 'Sara', 'not_a_real_field' => 'x'],
        ])->assertStatus(422);

        $this->assertSame(0, SurveyResult::query()->count());
    }

    #[Test]
    public function it_rejects_a_submission_missing_a_required_answer(): void
    {
        $schema = $this->form();

        $this->postJson(route('schemava.api.submit', ['hash' => $schema->hash]), [
            'data' => [],
        ])->assertStatus(422);

        $this->assertSame(0, SurveyResult::query()->count());
    }

    #[Test]
    public function it_rejects_a_submission_with_an_invalid_choice(): void
    {
        $schema = $this->form();

        $this->postJson(route('schemava.api.submit', ['hash' => $schema->hash]), [
            'data' => ['full_name' => 'Sara', 'color' => 'purple'],
        ])->assertStatus(422);

        $this->assertSame(0, SurveyResult::query()->count());
    }

    #[Test]
    public function it_rejects_an_oversized_submission(): void
    {
        config()->set('schemava.answer_validation.max_payload_bytes', 50);

        $schema = $this->form();

        $this->postJson(route('schemava.api.submit', ['hash' => $schema->hash]), [
            'data' => ['full_name' => str_repeat('a', 200)],
        ])->assertStatus(422);

        $this->assertSame(0, SurveyResult::query()->count());
    }
}
