<?php

namespace AsimNet\Schemava\Support;

use AsimNet\Schemava\Contracts\SurveyAccessResolver;
use AsimNet\Schemava\Models\SurveySchema;

/**
 * Default access policy: anyone may submit while the schema is open and the
 * per-user submission cap is not exceeded. Host apps bind a richer resolver to
 * add role/gender/age/targeting rules.
 */
class OpenSurveyAccessResolver implements SurveyAccessResolver
{
    public function canSubmit(SurveySchema $schema, mixed $subject, int $submissionCount = 0): bool
    {
        if (! $schema->isOpen()) {
            return false;
        }

        $limit = (int) ($schema->submission_limit_per_user ?? 0);

        if ($limit > 0 && $submissionCount >= $limit) {
            return false;
        }

        return true;
    }

    public function unavailableMessage(SurveySchema $schema, mixed $subject, int $submissionCount = 0): ?string
    {
        if ($this->canSubmit($schema, $subject, $submissionCount)) {
            return null;
        }

        if (! $schema->is_active || ($schema->close_at && now()->gt($schema->close_at))) {
            return $schema->close_message
                ?: $schema->unavailable_message
                ?: __('schemava::surveyjs.unavailable.closed');
        }

        if ($schema->open_at && now()->lt($schema->open_at)) {
            return $schema->unavailable_message ?: __('schemava::surveyjs.unavailable.not_open');
        }

        return $schema->unavailable_message ?: __('schemava::surveyjs.unavailable.default');
    }
}
