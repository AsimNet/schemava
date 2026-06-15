<?php

namespace Asimnet\FilamentSurveyjs\Concerns;

/**
 * Helpers for walking a SurveyJS schema's questions and included calculated
 * values, and for safely reading submission values. Pure JSON traversal — no
 * host-app coupling.
 */
trait ExtractsSurveyQuestions
{
    /**
     * Extract all questions from a survey JSON, including nested elements inside panels.
     *
     * @param  array|null  $surveyJson  The survey JSON structure
     * @return array<int, array{name: string, title: string, type: string}> Array of question info
     */
    protected function extractQuestionsFromSurveyJson(?array $surveyJson): array
    {
        $questions = [];

        if (! $surveyJson || ! isset($surveyJson['pages'])) {
            return $questions;
        }

        foreach ($surveyJson['pages'] as $page) {
            if (isset($page['elements'])) {
                $this->extractQuestionsFromElements($page['elements'], $questions);
            }
        }

        return $questions;
    }

    /**
     * Recursively extract questions from elements array.
     * Handles nested elements inside panels and other container types.
     *
     * @param  array  $elements  The elements array
     * @param  array  $questions  Reference to the questions array to populate
     */
    protected function extractQuestionsFromElements(array $elements, array &$questions): void
    {
        // Element types that are not actual questions (display-only or technical)
        $nonQuestionTypes = ['html', 'expression', 'image'];

        // Container types that can have nested elements
        $containerTypes = ['panel', 'paneldynamic', 'flowpanel'];

        foreach ($elements as $element) {
            $elementType = $element['type'] ?? 'text';

            if (in_array($elementType, $containerTypes) && isset($element['elements'])) {
                // Recursively extract from nested elements
                $this->extractQuestionsFromElements($element['elements'], $questions);

                continue;
            }

            // Skip non-question element types
            if (in_array($elementType, $nonQuestionTypes)) {
                continue;
            }

            $questionName = $element['name'] ?? null;
            if (! $questionName) {
                continue;
            }

            // Skip hidden fields (visible: false or name contains hidden/internal patterns)
            if (isset($element['visible']) && $element['visible'] === false) {
                continue;
            }

            // Skip fields that are clearly internal/hidden by naming convention
            $lowerName = strtolower($questionName);
            if (str_contains($lowerName, 'hidden') || str_contains($lowerName, '_user_id') || str_contains($lowerName, 'respondent_')) {
                continue;
            }

            $questionTitle = $element['title'] ?? $questionName;

            // Handle localized titles (SurveyJS can store titles as arrays)
            if (is_array($questionTitle)) {
                $questionTitle = $questionTitle['default']
                    ?? $questionTitle['ar']
                    ?? reset($questionTitle)
                    ?: $questionName;
            }

            $questions[] = [
                'name' => $questionName,
                'title' => $questionTitle,
                'type' => $elementType,
            ];
        }
    }

    /**
     * Get question names as a flat array.
     *
     * @param  array|null  $surveyJson  The survey JSON structure
     * @return array<string> Array of question names
     */
    protected function getQuestionNames(?array $surveyJson): array
    {
        return array_column($this->extractQuestionsFromSurveyJson($surveyJson), 'name');
    }

    /**
     * Get question titles keyed by name.
     *
     * @param  array|null  $surveyJson  The survey JSON structure
     * @return array<string, string> Map of question name => title
     */
    protected function getQuestionTitles(?array $surveyJson): array
    {
        $questions = $this->extractQuestionsFromSurveyJson($surveyJson);
        $titles = [];

        foreach ($questions as $question) {
            $titles[$question['name']] = $question['title'];
        }

        return $titles;
    }

    /**
     * Extract calculated values that should be persisted into result data.
     *
     * @param  array|null  $surveyJson  The survey JSON structure
     * @return array<int, array{name: string, title: string}> Array of calculated value info
     */
    protected function extractIncludedCalculatedValues(?array $surveyJson): array
    {
        $calculatedValues = [];

        if (! $surveyJson || ! isset($surveyJson['calculatedValues']) || ! is_array($surveyJson['calculatedValues'])) {
            return $calculatedValues;
        }

        $seen = [];

        foreach ($surveyJson['calculatedValues'] as $calculatedValue) {
            if (! is_array($calculatedValue)) {
                continue;
            }

            $name = trim((string) ($calculatedValue['name'] ?? ''));
            if ($name === '' || isset($seen[$name])) {
                continue;
            }

            $includeIntoResult = $calculatedValue['includeIntoResult'] ?? false;
            if (! in_array($includeIntoResult, [true, 1, '1', 'true'], true)) {
                continue;
            }

            $title = $calculatedValue['title'] ?? $name;
            if (is_array($title)) {
                $title = $title['default']
                    ?? $title['ar']
                    ?? reset($title)
                    ?? $name;
            }

            $calculatedValues[] = [
                'name' => $name,
                'title' => (string) $title,
            ];
            $seen[$name] = true;
        }

        return $calculatedValues;
    }

    /**
     * Get calculated value names that are included in results.
     *
     * @param  array|null  $surveyJson  The survey JSON structure
     * @return array<string> Array of calculated value names
     */
    protected function getIncludedCalculatedValueNames(?array $surveyJson): array
    {
        return array_column($this->extractIncludedCalculatedValues($surveyJson), 'name');
    }

    /**
     * Get calculated value titles keyed by name.
     *
     * @param  array|null  $surveyJson  The survey JSON structure
     * @return array<string, string> Map of calculated value name => title
     */
    protected function getIncludedCalculatedValueTitles(?array $surveyJson): array
    {
        $calculatedValues = $this->extractIncludedCalculatedValues($surveyJson);
        $titles = [];

        foreach ($calculatedValues as $calculatedValue) {
            $titles[$calculatedValue['name']] = $calculatedValue['title'];
        }

        return $titles;
    }

    /**
     * Safely read a value from survey result data.
     * If a key contains dots literally, it takes precedence over nested access.
     *
     * @param  array<string, mixed>  $data
     * @param  mixed  $default
     * @return mixed
     */
    protected function getSurveyResultDataValue(array $data, string $key, $default = null)
    {
        if (array_key_exists($key, $data)) {
            return $data[$key];
        }

        return data_get($data, $key, $default);
    }
}
