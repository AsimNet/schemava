<?php

namespace AsimNet\Schemava\Services;

use AsimNet\Schemava\Models\SurveySchema;

/**
 * Computes quiz-style scores from a submission against a schema's graded
 * questions (those carrying `correctAnswer` + optional `score`). Pure SurveyJS
 * logic — no host-app coupling.
 */
class SurveyScoreCalculator
{
    /**
     * Whether the schema defines any graded question (one carrying a
     * `correctAnswer` with a positive score). Lets callers hide score UI for
     * unscored surveys so a meaningless 0 is never shown.
     */
    public function isScored(SurveySchema $surveySchema): bool
    {
        foreach ($this->extractQuestions($surveySchema->survey_json ?? []) as $question) {
            if (! array_key_exists('correctAnswer', $question)) {
                continue;
            }

            if ($this->resolveQuestionScore($question) > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $submittedData
     * @return array<string, mixed>
     */
    public function appendScores(SurveySchema $surveySchema, array $submittedData): array
    {
        [$totalScore, $maxScore] = $this->calculate(
            $surveySchema->survey_json ?? [],
            $submittedData
        );

        $submittedData['totalScore'] = $totalScore;
        $submittedData['maxScore'] = $maxScore;
        $submittedData['scorePercent'] = $maxScore > 0
            ? round(($totalScore / $maxScore) * 100, 2)
            : 0;

        return $submittedData;
    }

    /**
     * @param  array<string, mixed>  $surveyJson
     * @param  array<string, mixed>  $answers
     * @return array{0: float, 1: float}
     */
    private function calculate(array $surveyJson, array $answers): array
    {
        $totalScore = 0.0;
        $maxScore = 0.0;

        foreach ($this->extractQuestions($surveyJson) as $question) {
            $name = is_string($question['name'] ?? null) ? $question['name'] : null;
            if (! $name || ! array_key_exists('correctAnswer', $question)) {
                continue;
            }

            $score = $this->resolveQuestionScore($question);
            if ($score <= 0) {
                continue;
            }

            $maxScore += $score;

            $answer = $this->getAnswerValue($answers, $name);
            if ($this->answersMatch($answer, $question['correctAnswer'])) {
                $totalScore += $score;
            }
        }

        return [$totalScore, $maxScore];
    }

    /**
     * @param  array<string, mixed>  $surveyJson
     * @return array<int, array<string, mixed>>
     */
    private function extractQuestions(array $surveyJson): array
    {
        $questions = [];

        foreach (($surveyJson['pages'] ?? []) as $page) {
            if (! is_array($page)) {
                continue;
            }

            $elements = $page['elements'] ?? [];
            if (! is_array($elements)) {
                continue;
            }

            $this->extractFromElements($elements, $questions);
        }

        return $questions;
    }

    /**
     * @param  array<int, mixed>  $elements
     * @param  array<int, array<string, mixed>>  $questions
     */
    private function extractFromElements(array $elements, array &$questions): void
    {
        foreach ($elements as $element) {
            if (! is_array($element)) {
                continue;
            }

            $type = $element['type'] ?? null;

            if (in_array($type, ['panel', 'paneldynamic', 'flowpanel'], true)) {
                $nestedElements = $element['elements'] ?? [];
                if (is_array($nestedElements)) {
                    $this->extractFromElements($nestedElements, $questions);
                }

                continue;
            }

            if (! empty($element['name'])) {
                $questions[] = $element;
            }
        }
    }

    /**
     * @param  array<string, mixed>  $answers
     */
    private function getAnswerValue(array $answers, string $name): mixed
    {
        if (array_key_exists($name, $answers)) {
            return $answers[$name];
        }

        return data_get($answers, $name);
    }

    /**
     * @param  array<string, mixed>  $question
     */
    private function resolveQuestionScore(array $question): float
    {
        if (! array_key_exists('score', $question)) {
            return 1.0;
        }

        return max(0.0, (float) $question['score']);
    }

    private function answersMatch(mixed $answer, mixed $correctAnswer): bool
    {
        if (is_array($answer) || is_array($correctAnswer)) {
            $answerArray = array_map('strval', (array) $answer);
            $correctArray = array_map('strval', (array) $correctAnswer);

            sort($answerArray);
            sort($correctArray);

            return $answerArray === $correctArray;
        }

        return (string) $answer === (string) $correctAnswer;
    }
}
