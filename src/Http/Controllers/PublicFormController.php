<?php

namespace AsimNet\Schemava\Http\Controllers;

use AsimNet\Schemava\Contracts\RuntimeContextProvider;
use AsimNet\Schemava\Contracts\SurveyAccessResolver;
use AsimNet\Schemava\Contracts\SurveyAnswerValidator;
use AsimNet\Schemava\Contracts\SurveySubmissionHandler;
use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\Support\GuestSubject;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public, unauthenticated endpoint where people fill a published form and submit.
 * Host-specific concerns are delegated to contracts: who may submit
 * ({@see SurveyAccessResolver}), how a submission is stored
 * ({@see SurveySubmissionHandler}), and the piping values exposed to the form
 * ({@see RuntimeContextProvider}). Registered from the service provider behind
 * the configured prefix/middleware.
 */
class PublicFormController
{
    public function show(Request $request, string $hash): View
    {
        $schema = $this->resolve($hash);
        $subject = auth()->user();
        $trackedSubject = $subject ?? GuestSubject::fromRequest($request);

        $count = app(SurveySubmissionHandler::class)->submissionCount($schema, $trackedSubject);
        $access = app(SurveyAccessResolver::class);

        $unavailable = $access->canSubmit($schema, $subject, $count)
            ? null
            : ($access->unavailableMessage($schema, $subject, $count) ?? __('schemava::surveyjs.unavailable.default'));

        return view('schemava::survey-form', [
            'schema' => $schema,
            'surveyJson' => $schema->survey_json ?: (object) [],
            'unavailable' => $unavailable,
            'runtimeValues' => $unavailable ? [] : app(RuntimeContextProvider::class)->values($subject),
            'submitUrl' => route('schemava.public.submit', ['hash' => $schema->hash]),
            'csrf' => csrf_token(),
            'locale' => app()->getLocale(),
            'rendererVersion' => config('schemava.renderer_version'),
            'pageTitle' => $schema->title,
        ]);
    }

    public function submit(Request $request, string $hash): JsonResponse
    {
        $schema = $this->resolve($hash);
        $subject = auth()->user();
        $trackedSubject = $subject ?? GuestSubject::fromRequest($request);

        $access = app(SurveyAccessResolver::class);
        $count = app(SurveySubmissionHandler::class)->submissionCount($schema, $trackedSubject);

        if (! $access->canSubmit($schema, $subject, $count)) {
            return response()->json([
                'success' => false,
                'message' => $access->unavailableMessage($schema, $subject, $count)
                    ?? __('schemava::surveyjs.unavailable.default'),
            ], 422);
        }

        $validated = $request->validate([
            'data' => ['required', 'array'],
        ]);

        $errors = app(SurveyAnswerValidator::class)->validate($schema, $validated['data']);

        if ($errors !== []) {
            return response()->json([
                'success' => false,
                'message' => $errors[0],
                'errors' => $errors,
            ], 422);
        }

        app(SurveySubmissionHandler::class)->store($schema, $trackedSubject, $validated['data']);

        return response()->json([
            'success' => true,
            'message' => __('schemava::surveyjs.public.thank_you'),
        ]);
    }

    protected function resolve(string $hash): SurveySchema
    {
        /** @var class-string<SurveySchema> $model */
        $model = config('schemava.models.schema', SurveySchema::class);

        return $model::query()->where('hash', $hash)->firstOrFail();
    }
}
