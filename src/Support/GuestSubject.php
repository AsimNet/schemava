<?php

namespace AsimNet\Schemava\Support;

use AsimNet\Schemava\Contracts\SurveyAccessResolver;
use AsimNet\Schemava\Contracts\SurveySubmissionHandler;
use Illuminate\Http\Request;

/**
 * Identifies an unauthenticated submitter by a hash of their request IP, so
 * {@see DefaultSurveySubmissionHandler} can give `submission_limit_per_user`
 * real teeth for guest submissions instead of silently exempting them.
 *
 * This is a coarse, best-effort signal: submitters behind a shared/NAT'd IP
 * (offices, carriers, VPNs) can be falsely capped together, and it offers no
 * protection against a submitter who switches networks. Host apps needing a
 * stronger guarantee should bind their own {@see SurveyAccessResolver} and/or
 * {@see SurveySubmissionHandler} (e.g. keyed on a verified email/phone, a
 * signed device cookie, or an authenticated guest session).
 */
final class GuestSubject
{
    public function __construct(public readonly string $fingerprint) {}

    public static function fromRequest(Request $request): self
    {
        return new self(hash('sha256', $request->ip() ?? ''));
    }
}
