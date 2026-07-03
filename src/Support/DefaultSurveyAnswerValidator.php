<?php

namespace AsimNet\Schemava\Support;

use AsimNet\Schemava\Contracts\SurveyAnswerValidator;
use AsimNet\Schemava\Models\SurveySchema;

/**
 * Best-effort, schema-aware answer validator. Deliberately does not evaluate
 * `visibleIf`/`enableIf` expressions (that requires a full SurveyJS logic
 * engine); it only enforces what is safely checkable from the raw JSON:
 * unknown keys, unconditionally required questions, `choices` whitelists for
 * single/multi-select types, and payload size/nesting caps against abuse.
 */
class DefaultSurveyAnswerValidator implements SurveyAnswerValidator
{
    /** Element types that group child elements but store answers flat, under the children's own names. */
    private const FLATTENING_CONTAINER_TYPES = ['panel', 'flowpanel'];

    /** Element types that never carry a directly submitted answer value. */
    private const NON_QUESTION_TYPES = ['html', 'image', 'expression'];

    /** Types whose value(s) must come from the declared `choices` list. */
    private const CHOICE_TYPES = ['radiogroup', 'checkbox', 'dropdown'];

    /**
     * @param  array<array-key, mixed>  $data
     * @return array<int, string>
     */
    public function validate(SurveySchema $schema, array $data): array
    {
        $maxBytes = (int) config('schemava.answer_validation.max_payload_bytes', 65536);
        $maxDepth = (int) config('schemava.answer_validation.max_depth', 10);

        $encoded = json_encode($data);

        if ($encoded === false || strlen($encoded) > $maxBytes) {
            return [__('schemava::surveyjs.validation.payload_too_large', ['max' => $maxBytes])];
        }

        if ($this->depthOf($data) > $maxDepth) {
            return [__('schemava::surveyjs.validation.payload_too_deep', ['max' => $maxDepth])];
        }

        $questions = $this->extractQuestions((array) ($schema->survey_json ?? []));

        $errors = [];

        foreach (array_keys($data) as $key) {
            if (! is_string($key) || ! isset($questions[$key])) {
                $errors[] = __('schemava::surveyjs.validation.unknown_key', ['key' => (string) $key]);
            }
        }

        foreach ($questions as $name => $question) {
            $value = $data[$name] ?? null;

            if ($this->isUnconditionallyRequired($question) && $this->isBlank($value)) {
                $errors[] = __('schemava::surveyjs.validation.required', ['field' => $name]);

                continue;
            }

            if (array_key_exists($name, $data) && ! $this->isBlank($value)) {
                $choiceError = $this->validateChoices($question, $value);

                if ($choiceError !== null) {
                    $errors[] = $choiceError;
                }
            }
        }

        return $errors;
    }

    /**
     * @param  array<string, mixed>  $surveyJson
     * @return array<string, array<array-key, mixed>> Questions keyed by their `name`.
     */
    private function extractQuestions(array $surveyJson): array
    {
        $questions = [];

        foreach (($surveyJson['pages'] ?? []) as $page) {
            if (! is_array($page)) {
                continue;
            }

            $elements = $page['elements'] ?? [];

            if (is_array($elements)) {
                $this->extractFromElements($elements, $questions);
            }
        }

        return $questions;
    }

    /**
     * @param  array<int, mixed>  $elements
     * @param  array<string, array<array-key, mixed>>  $questions
     */
    private function extractFromElements(array $elements, array &$questions): void
    {
        foreach ($elements as $element) {
            if (! is_array($element)) {
                continue;
            }

            $type = $element['type'] ?? null;

            if (in_array($type, self::FLATTENING_CONTAINER_TYPES, true)) {
                $nested = $element['elements'] ?? [];

                if (is_array($nested)) {
                    $this->extractFromElements($nested, $questions);
                }

                continue;
            }

            $name = $element['name'] ?? null;

            // Dynamic panels store an array of row-objects under their own name;
            // nested question names are not top-level keys, so don't flatten them.
            // `paneldynamic` itself is still registered as a known key below.
            if (is_string($name) && $name !== '' && ! in_array($type, self::NON_QUESTION_TYPES, true)) {
                $questions[$name] = $element;
            }
        }
    }

    /**
     * @param  array<array-key, mixed>  $question
     */
    private function isUnconditionallyRequired(array $question): bool
    {
        if (($question['visible'] ?? true) === false) {
            return false;
        }

        if (! empty($question['visibleIf'])) {
            return false;
        }

        return ($question['isRequired'] ?? false) === true;
    }

    /**
     * @param  array<array-key, mixed>  $question
     */
    private function validateChoices(array $question, mixed $value): ?string
    {
        $type = $question['type'] ?? null;

        if (! in_array($type, self::CHOICE_TYPES, true)) {
            return null;
        }

        $choices = $question['choices'] ?? null;

        if (! is_array($choices) || $choices === []) {
            // Dynamic (choicesByUrl/choicesByValueName) or unspecified choices can't be
            // validated against a static list; leave it to the client-rendered form.
            return null;
        }

        $allowed = array_map(
            fn ($choice) => (string) (is_array($choice) ? ($choice['value'] ?? $choice['text'] ?? '') : $choice),
            $choices,
        );

        if (! empty($question['showNoneItem'] ?? false)) {
            $allowed[] = (string) ($question['noneValue'] ?? 'none');
        }

        if (! empty($question['hasOther'] ?? false)) {
            $allowed[] = (string) ($question['otherValue'] ?? 'other');
        }

        if ($type === 'checkbox' && ! empty($question['showSelectAllItem'] ?? false)) {
            $allowed[] = (string) ($question['selectAllValue'] ?? 'selectall');
        }

        foreach (is_array($value) ? $value : [$value] as $submitted) {
            if (is_array($submitted)) {
                continue;
            }

            if (! in_array((string) $submitted, $allowed, true)) {
                return __('schemava::surveyjs.validation.invalid_choice', [
                    'field' => (string) ($question['name'] ?? ''),
                ]);
            }
        }

        return null;
    }

    private function isBlank(mixed $value): bool
    {
        if ($value === null) {
            return true;
        }

        if (is_string($value)) {
            return trim($value) === '';
        }

        if (is_array($value)) {
            return $value === [];
        }

        return false;
    }

    private function depthOf(mixed $value, int $current = 1): int
    {
        if (! is_array($value) || $value === []) {
            return $current;
        }

        $max = $current;

        foreach ($value as $item) {
            $max = max($max, $this->depthOf($item, $current + 1));
        }

        return $max;
    }
}
