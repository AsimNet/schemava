<?php

namespace AsimNet\Schemava\Contracts;

use AsimNet\Schemava\Models\SurveySchema;

/**
 * Decides whether a subject may submit a survey. The package ships an
 * implementation covering the generic gates (active, open/close window, max
 * responses, per-user limit); host apps bind a richer resolver to add
 * role/gender/age/targeting rules tied to their own domain.
 */
interface SurveyAccessResolver
{
    /**
     * Whether the subject may submit the schema. A null subject represents a
     * guest/unauthenticated request.
     */
    public function canSubmit(SurveySchema $schema, mixed $subject, int $submissionCount = 0): bool;

    /**
     * A localized, human-readable reason the schema is unavailable to the
     * subject, or null when submission is allowed.
     */
    public function unavailableMessage(SurveySchema $schema, mixed $subject, int $submissionCount = 0): ?string;
}
