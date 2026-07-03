<?php

namespace AsimNet\Schemava\Http\Controllers;

use AsimNet\Schemava\Contracts\SurveyAccessResolver;
use AsimNet\Schemava\Contracts\SurveyAnswerValidator;
use AsimNet\Schemava\Contracts\SurveySubmissionHandler;
use AsimNet\Schemava\Models\SurveySchema;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * JSON API for consuming forms from mobile apps / external clients: list active
 * forms, fetch one to render, and submit a response. Authentication is the
 * installing app's decision — set `routes.api.middleware` in config (e.g. add
 * 'auth:sanctum' or 'auth:api'). Access + persistence reuse the same contracts
 * as the web form, so the same rules apply everywhere.
 */
class ApiFormController
{
    public function index(): JsonResponse
    {
        $forms = $this->model()::query()
            ->where('is_active', true)
            ->orderByDesc('id')
            ->get()
            ->map(fn (SurveySchema $schema): array => [
                'id' => $schema->getKey(),
                'hash' => $schema->hash,
                'title' => $schema->title,
                'description' => $schema->description,
            ])
            ->all();

        return response()->json(['data' => $forms]);
    }

    public function show(string $hash): JsonResponse
    {
        $schema = $this->resolve($hash);
        $subject = auth()->user();

        $access = app(SurveyAccessResolver::class);
        $count = app(SurveySubmissionHandler::class)->submissionCount($schema, $subject);
        $canSubmit = $access->canSubmit($schema, $subject, $count);

        return response()->json(['data' => [
            'id' => $schema->getKey(),
            'hash' => $schema->hash,
            'title' => $schema->title,
            'description' => $schema->description,
            'survey_json' => $schema->survey_json ?: (object) [],
            'renderer_version' => config('schemava.renderer_version'),
            'can_submit' => $canSubmit,
            'unavailable_message' => $canSubmit
                ? null
                : $access->unavailableMessage($schema, $subject, $count),
        ]]);
    }

    public function submit(Request $request, string $hash): JsonResponse
    {
        $schema = $this->resolve($hash);
        $subject = auth()->user();

        $access = app(SurveyAccessResolver::class);
        $count = app(SurveySubmissionHandler::class)->submissionCount($schema, $subject);

        if (! $access->canSubmit($schema, $subject, $count)) {
            return response()->json([
                'message' => $access->unavailableMessage($schema, $subject, $count)
                    ?? __('schemava::surveyjs.unavailable.default'),
            ], 422);
        }

        $validated = $request->validate(['data' => ['required', 'array']]);

        $errors = app(SurveyAnswerValidator::class)->validate($schema, $validated['data']);

        if ($errors !== []) {
            return response()->json([
                'message' => $errors[0],
                'errors' => $errors,
            ], 422);
        }

        $result = app(SurveySubmissionHandler::class)->store($schema, $subject, $validated['data']);

        $payload = ['status' => 'submitted'];

        if ($result instanceof Model) {
            $payload = [
                'id' => $result->getKey(),
                'status' => $result->getAttribute('status') ?? 'submitted',
                'submitted_at' => optional($result->getAttribute('submitted_at'))?->toIso8601String(),
            ];
        }

        return response()->json(['data' => $payload], 201);
    }

    protected function resolve(string $hash): SurveySchema
    {
        return $this->model()::query()->where('hash', $hash)->firstOrFail();
    }

    /**
     * @return class-string<SurveySchema>
     */
    protected function model(): string
    {
        return config('schemava.models.schema', SurveySchema::class);
    }
}
