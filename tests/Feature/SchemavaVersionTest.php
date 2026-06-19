<?php

namespace AsimNet\Schemava\Tests\Feature;

use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\Schemava;
use AsimNet\Schemava\Tests\TestCase;
use PHPUnit\Framework\Attributes\Test;

class SchemavaVersionTest extends TestCase
{
    #[Test]
    public function it_stamps_the_producing_schemava_version_when_a_schema_is_created(): void
    {
        $schema = SurveySchema::query()->create([
            'title' => 'Feedback',
            'survey_json' => ['pages' => [['name' => 'page1', 'elements' => []]]],
        ]);

        $this->assertNotEmpty($schema->schemava_version);
        $this->assertSame(Schemava::version(), $schema->schemava_version);
    }

    #[Test]
    public function it_refreshes_the_schemava_version_on_update(): void
    {
        $schema = SurveySchema::query()->create(['title' => 'Feedback']);

        // Simulate a schema saved by an older release, then re-save it.
        $schema->forceFill(['schemava_version' => '0.0.1-old'])->saveQuietly();
        $schema->update(['title' => 'Updated title']);

        $this->assertSame(Schemava::version(), $schema->fresh()->schemava_version);
    }

    #[Test]
    public function the_version_is_stored_outside_the_surveyjs_json(): void
    {
        $schema = SurveySchema::query()->create([
            'title' => 'Feedback',
            'survey_json' => ['pages' => [['name' => 'page1', 'elements' => []]]],
        ]);

        $json = $schema->fresh()->survey_json;

        // The version is a sibling column, never embedded in the portable SurveyJS JSON…
        $this->assertArrayNotHasKey('schemava_version', $json);
        $this->assertArrayNotHasKey('version', $json);
        // …and no renderer/creator version is ever stored.
        $this->assertArrayNotHasKey('renderer_version', $json);
        $this->assertArrayNotHasKey('surveyjs_creator_version', $json);
        $this->assertArrayNotHasKey('surveyjs_renderer_version', $json);
    }
}
