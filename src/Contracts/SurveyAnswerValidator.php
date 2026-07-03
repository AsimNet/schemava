<?php

namespace AsimNet\Schemava\Contracts;

use AsimNet\Schemava\Models\SurveySchema;

/**
 * Schema-aware, server-side check of submitted survey answers, run before a
 * submission is persisted. The package ships a best-effort default (unknown
 * keys, unconditional `isRequired`, `choices` whitelists, payload size/depth
 * caps) — host apps bind a stricter/looser validator to change the rules.
 */
interface SurveyAnswerValidator
{
    /**
     * Validate submitted answers against the schema's declared questions.
     *
     * @param  array<array-key, mixed>  $data
     * @return array<int, string> Validation error messages; empty when the submission is valid.
     */
    public function validate(SurveySchema $schema, array $data): array;
}
