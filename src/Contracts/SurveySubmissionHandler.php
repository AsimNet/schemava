<?php

namespace AsimNet\Schemava\Contracts;

use AsimNet\Schemava\Models\SurveyResult;
use AsimNet\Schemava\Models\SurveySchema;

/**
 * Persists a survey submission and counts a subject's prior submissions. The
 * package ships a default that stores a {@see SurveyResult}.
 *
 * Host apps may bind their own handler to persist submissions differently
 * (e.g. routing certain schemas to domain records). The package itself has no
 * knowledge of any such app-specific behavior.
 */
interface SurveySubmissionHandler
{
    /**
     * Persist a submission and return the created record.
     *
     * @param  array<string, mixed>  $data
     */
    public function store(SurveySchema $schema, mixed $subject, array $data): mixed;

    /**
     * How many times the subject has already submitted this schema, used to
     * enforce per-user submission limits.
     */
    public function submissionCount(SurveySchema $schema, mixed $subject): int;
}
