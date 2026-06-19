<?php

namespace AsimNet\Schemava\Tests\Unit;

use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\Services\SurveyScoreCalculator;
use AsimNet\Schemava\Tests\TestCase;
use PHPUnit\Framework\Attributes\Test;

class SurveyScoreCalculatorIsScoredTest extends TestCase
{
    #[Test]
    public function it_reports_a_schema_with_a_graded_question_as_scored(): void
    {
        $schema = new SurveySchema;
        $schema->survey_json = [
            'pages' => [[
                'name' => 'p1',
                'elements' => [
                    ['type' => 'radiogroup', 'name' => 'q1', 'choices' => ['a', 'b'], 'correctAnswer' => 'a'],
                ],
            ]],
        ];

        $this->assertTrue(app(SurveyScoreCalculator::class)->isScored($schema));
    }

    #[Test]
    public function it_reports_an_ungraded_schema_as_not_scored(): void
    {
        $schema = new SurveySchema;
        $schema->survey_json = [
            'pages' => [[
                'name' => 'p1',
                'elements' => [
                    ['type' => 'text', 'name' => 'q1'],
                ],
            ]],
        ];

        $this->assertFalse(app(SurveyScoreCalculator::class)->isScored($schema));
    }

    #[Test]
    public function a_zero_score_graded_question_does_not_count_as_scored(): void
    {
        $schema = new SurveySchema;
        $schema->survey_json = [
            'pages' => [[
                'name' => 'p1',
                'elements' => [
                    ['type' => 'radiogroup', 'name' => 'q1', 'choices' => ['a'], 'correctAnswer' => 'a', 'score' => 0],
                ],
            ]],
        ];

        $this->assertFalse(app(SurveyScoreCalculator::class)->isScored($schema));
    }

    #[Test]
    public function it_finds_graded_questions_nested_in_panels(): void
    {
        $schema = new SurveySchema;
        $schema->survey_json = [
            'pages' => [[
                'name' => 'p1',
                'elements' => [
                    ['type' => 'panel', 'name' => 'pnl', 'elements' => [
                        ['type' => 'radiogroup', 'name' => 'q1', 'choices' => ['a', 'b'], 'correctAnswer' => 'a'],
                    ]],
                ],
            ]],
        ];

        $this->assertTrue(app(SurveyScoreCalculator::class)->isScored($schema));
    }
}
