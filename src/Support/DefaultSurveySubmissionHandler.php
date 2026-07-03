<?php

namespace AsimNet\Schemava\Support;

use AsimNet\Schemava\Contracts\SurveySubmissionHandler;
use AsimNet\Schemava\Models\SurveySchema;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Default submission handler: stores submissions as SurveyResult rows and
 * counts a subject's prior submissions.
 *
 * Guest (unauthenticated) subjects are tracked via a {@see GuestSubject}
 * IP-hash rather than being silently exempted from `submission_limit_per_user`
 * — see {@see GuestSubject} for the caveats of that signal. Host apps needing
 * a stronger per-guest guarantee should bind their own SurveySubmissionHandler.
 */
class DefaultSurveySubmissionHandler implements SurveySubmissionHandler
{
    public function store(SurveySchema $schema, mixed $subject, array $data): mixed
    {
        return $schema->results()->create([
            'user_id' => $this->subjectId($subject),
            'submitter_fingerprint' => $this->guestFingerprint($subject),
            'data' => $data,
            'status' => 'submitted',
            'submitted_at' => now(),
            'surveyable_id' => $schema->surveyable_id,
            'surveyable_type' => $schema->surveyable_type,
        ]);
    }

    public function submissionCount(SurveySchema $schema, mixed $subject): int
    {
        if ($fingerprint = $this->guestFingerprint($subject)) {
            return $schema->results()->where('submitter_fingerprint', $fingerprint)->count();
        }

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

        if ($subject instanceof GuestSubject) {
            return null;
        }

        return $subject;
    }

    protected function guestFingerprint(mixed $subject): ?string
    {
        return $subject instanceof GuestSubject ? $subject->fingerprint : null;
    }
}
