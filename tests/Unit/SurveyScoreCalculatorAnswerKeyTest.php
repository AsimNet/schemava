<?php

namespace AsimNet\Schemava\Tests\Unit;

use AsimNet\Schemava\Services\SurveyScoreCalculator;
use AsimNet\Schemava\Tests\TestCase;
use PHPUnit\Framework\Attributes\Test;

class SurveyScoreCalculatorAnswerKeyTest extends TestCase
{
    #[Test]
    public function it_strips_correct_answer_and_score_from_every_element_including_nested_containers(): void
    {
        $json = [
            'title' => 'اختبار',
            'pages' => [[
                'name' => 'p1',
                'elements' => [
                    ['type' => 'radiogroup', 'name' => 'q1', 'choices' => ['أ', 'ب'], 'correctAnswer' => 'أ', 'score' => 2],
                    ['type' => 'panel', 'name' => 'g1', 'elements' => [
                        ['type' => 'text', 'name' => 'q2', 'correctAnswer' => 'x'],
                    ]],
                    ['type' => 'paneldynamic', 'name' => 'pd1', 'templateElements' => [
                        ['type' => 'boolean', 'name' => 'q3', 'correctAnswer' => true, 'score' => 5],
                    ]],
                ],
            ]],
        ];

        $stripped = (new SurveyScoreCalculator)->withoutAnswerKeys($json);

        $flat = json_encode($stripped);
        $this->assertStringNotContainsString('correctAnswer', $flat);
        $this->assertStringNotContainsString('"score"', $flat);

        // Everything else survives untouched.
        $this->assertSame(['أ', 'ب'], $stripped['pages'][0]['elements'][0]['choices']);
        $this->assertSame('q2', $stripped['pages'][0]['elements'][1]['elements'][0]['name']);
        $this->assertSame('اختبار', $stripped['title']);
    }

    #[Test]
    public function it_leaves_a_keyless_survey_unchanged(): void
    {
        $json = ['pages' => [['name' => 'p1', 'elements' => [['type' => 'text', 'name' => 'q1']]]]];

        $this->assertSame($json, (new SurveyScoreCalculator)->withoutAnswerKeys($json));
    }
}
