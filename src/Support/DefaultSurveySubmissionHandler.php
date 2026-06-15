<?php

namespace AsimNet\Schemava\Support;

use AsimNet\Schemava\Contracts\SurveySubmissionHandler;
use AsimNet\Schemava\Models\SurveyResult;
use AsimNet\Schemava\Models\SurveySchema;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Model;

/**
 * Default submission handler: stores submissions as SurveyResult rows and
 * counts a subject's prior submissions.
 */
class DefaultSurveySubmissionHandler implements SurveySubmissionHandler
{
    public function store(SurveySchema $schema, mixed $subject, array $data): mixed
    {
        /** @var class-string<Model> $resultModel */
        $resultModel = config('schemava.models.result', SurveyResult::class);

        return $resultModel::create([
            'survey_schema_id' => $schema->getKey(),
            'user_id' => $this->subjectId($subject),
            'data' => $data,
            'status' => 'submitted',
            'submitted_at' => now(),
            'surveyable_id' => $schema->surveyable_id,
            'surveyable_type' => $schema->surveyable_type,
        ]);
    }

    public function submissionCount(SurveySchema $schema, mixed $subject): int
    {
        $subjectId = $this->subjectId($subject);

        if ($subjectId === null) {
            return 0;
        }

        return $schema->results()->where('user_id', $subjectId)->count();
    }

    protected function subjectId(mixed $subject): int|string|null
    {
        if ($subject instanceof Authenticatable) {
            return $subject->getAuthIdentifier();
        }

        return $subject;
    }
}
