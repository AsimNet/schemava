<?php

namespace AsimNet\Schemava\Tests\Feature;

use AsimNet\Schemava\Filament\Resources\SurveySchemas\Pages\EditSurveySchema;
use AsimNet\Schemava\Filament\Resources\SurveySchemas\RelationManagers\ResultsRelationManager;
use AsimNet\Schemava\Models\SurveyResult;
use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\SchemavaPlugin;
use AsimNet\Schemava\Tests\Fixtures\ExposedResultsRelationManager;
use AsimNet\Schemava\Tests\TestCase;
use Illuminate\Database\Eloquent\Model;
use PHPUnit\Framework\Attributes\Test;

/**
 * Exercises the responses relation manager's behavior — authorization gating,
 * respondent/score resolution, and the read-only display-mode boot payload it
 * hands to the `schemava::survey-result` view — without driving a full Livewire
 * render (the table itself is covered by Filament's own framework tests).
 */
class ResultsRelationManagerTest extends TestCase
{
    private function scoredSchema(): SurveySchema
    {
        return SurveySchema::query()->create([
            'title' => 'Quiz',
            'survey_json' => [
                'pages' => [[
                    'name' => 'page1',
                    'elements' => [
                        ['type' => 'radiogroup', 'name' => 'favorite_color', 'choices' => ['blue', 'green'], 'correctAnswer' => 'blue', 'score' => 2],
                    ],
                ]],
            ],
        ]);
    }

    private function plainSchema(): SurveySchema
    {
        return SurveySchema::query()->create([
            'title' => 'Feedback',
            'survey_json' => [
                'pages' => [[
                    'name' => 'page1',
                    'elements' => [
                        ['type' => 'text', 'name' => 'favorite_color'],
                    ],
                ]],
            ],
        ]);
    }

    private function managerFor(SurveySchema $schema): ExposedResultsRelationManager
    {
        $manager = new ExposedResultsRelationManager;
        $manager->ownerRecord = $schema;

        return $manager;
    }

    #[Test]
    public function it_is_visible_when_the_plugin_toggle_is_enabled_and_authorized(): void
    {
        $schema = $this->plainSchema();

        $this->assertTrue(ResultsRelationManager::canViewForRecord($schema, EditSurveySchema::class));
    }

    #[Test]
    public function it_is_hidden_when_the_plugin_toggle_is_disabled(): void
    {
        SchemavaPlugin::get()->responsesRelationManager(false);

        try {
            $schema = $this->plainSchema();

            $this->assertFalse(ResultsRelationManager::canViewForRecord($schema, EditSurveySchema::class));
        } finally {
            SchemavaPlugin::get()->responsesRelationManager(true);
        }
    }

    #[Test]
    public function it_is_hidden_when_the_plugin_authorization_denies(): void
    {
        SchemavaPlugin::get()->authorize(false);

        try {
            $schema = $this->plainSchema();

            $this->assertFalse(ResultsRelationManager::canViewForRecord($schema, EditSurveySchema::class));
        } finally {
            SchemavaPlugin::get()->authorize(true);
        }
    }

    #[Test]
    public function it_resolves_the_users_name_as_the_respondent(): void
    {
        $schema = $this->plainSchema();
        $user = new class extends Model
        {
            protected $attributes = ['name' => 'Sara', 'email' => 'sara@example.test'];
        };
        $result = new SurveyResult;
        $result->setRelation('user', $user);

        $this->assertSame('Sara', $this->managerFor($schema)->exposedRespondent($result));
    }

    #[Test]
    public function it_falls_back_to_a_localized_guest_label_when_there_is_no_user(): void
    {
        $schema = $this->plainSchema();
        $result = new SurveyResult;
        $result->setRelation('user', null);

        $this->assertSame(
            __('schemava::surveyjs.responses.guest'),
            $this->managerFor($schema)->exposedRespondent($result)
        );
    }

    #[Test]
    public function the_score_column_is_shown_only_for_scored_schemas(): void
    {
        $this->assertTrue($this->managerFor($this->scoredSchema())->exposedOwnerSchemaIsScored());
        $this->assertFalse($this->managerFor($this->plainSchema())->exposedOwnerSchemaIsScored());
    }

    #[Test]
    public function it_computes_the_submission_score_for_a_scored_schema(): void
    {
        $schema = $this->scoredSchema();
        $result = $schema->results()->create([
            'data' => ['favorite_color' => 'blue'],
            'status' => 'completed',
            'submitted_at' => now(),
        ]);

        $this->assertSame('2 / 2', $this->managerFor($schema)->exposedScore($result));
    }

    #[Test]
    public function the_view_modal_renders_the_submission_in_display_mode_with_the_schema_and_data(): void
    {
        $schema = $this->scoredSchema();
        $result = $schema->results()->create([
            'data' => ['favorite_color' => 'blue'],
            'status' => 'completed',
            'submitted_at' => now(),
        ]);

        $html = $this->managerFor($schema)->exposedRenderSubmission($result)->render();

        // The boot payload carries the parent schema's survey_json (question name)…
        $this->assertStringContainsString('favorite_color', $html);
        // …the record's submitted answer…
        $this->assertStringContainsString('blue', $html);
        // …renders read-only through the SurveyJS renderer…
        $this->assertStringContainsString("mode = 'display'", $html);
        // …and pins the configured renderer version.
        $this->assertStringContainsString('survey-core@'.config('schemava.renderer_version'), $html);
    }
}
