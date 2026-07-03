<?php

namespace AsimNet\Schemava\Http\Controllers;

use AsimNet\Schemava\Contracts\AiAssistant;
use AsimNet\Schemava\Contracts\RuntimeContextProvider;
use AsimNet\Schemava\Contracts\SurveyUrlResolver;
use AsimNet\Schemava\Http\Requests\SurveyDesignerAiQueryRequest;
use AsimNet\Schemava\Models\SurveySchema;
use Illuminate\Contracts\View\View;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Hosts the SurveyJS form builder and its save / image-upload / AI endpoints.
 * Host-specific concerns are delegated to contracts: runtime piping context,
 * public/admin URLs, and the AI assistant. The boot payload is fully assembled
 * here and handed to the package's "dumb" designer view.
 */
class SurveyDesignerController
{
    use AuthorizesRequests;

    public function show(SurveySchema $surveySchema): View
    {
        if (Gate::getPolicyFor($surveySchema)) {
            $this->authorize('update', $surveySchema);
        }

        $locale = app()->getLocale();
        $runtime = app(RuntimeContextProvider::class);
        $urls = app(SurveyUrlResolver::class);

        $bootPayload = [
            'surveyJson' => $surveySchema->survey_json ?: (object) [],
            'schema' => [
                'id' => $surveySchema->id,
                'title' => $surveySchema->title,
                'description' => $surveySchema->description,
            ],
            'hash' => $surveySchema->hash,
            'publicUrl' => $urls->publicUrl($surveySchema),
            'routes' => [
                'save' => route('survey-designer.save', ['surveySchema' => $surveySchema->id]),
                'uploadImage' => route('survey-designer.upload-image'),
                'aiQuery' => route('survey-designer.ai-query', ['surveySchema' => $surveySchema->id]),
                'backUrl' => $urls->adminUrl($surveySchema),
            ],
            'csrf' => csrf_token(),
            'runtimeContextKeys' => $runtime->keys(),
            'variableMeta' => $runtime->variableMeta(),
            'locale' => $locale,
            'uiLocale' => config('schemava.designer_ui_locale', 'ar'),
            'aiEnabled' => config('schemava.ai.enabled', true) && app(AiAssistant::class)->isConfigured(),
        ];

        return view('schemava::survey-designer', [
            'bootPayload' => $bootPayload,
            'pageTitle' => __('schemava::surveyjs.designer.page_title').': '.$surveySchema->title,
            'locale' => $locale,
            'rendererVersion' => config('schemava.renderer_version'),
        ]);
    }

    public function save(Request $request, SurveySchema $surveySchema): JsonResponse
    {
        if (Gate::getPolicyFor($surveySchema)) {
            $this->authorize('update', $surveySchema);
        }

        $validated = $request->validate([
            'survey_json' => 'required|array',
        ]);

        $surveyJson = $this->processSurveyJson($validated['survey_json']);

        // Sync title/description into the scalar columns. The builder may emit a
        // localized object ({default, en}) for these at the top level (valid
        // SurveyJS, kept verbatim in survey_json); the scalar columns must only
        // ever store the default string, never the array.
        $updateData = ['survey_json' => $surveyJson];

        $title = $this->localizedScalar($surveyJson['title'] ?? null);
        if ($title !== null) {
            $updateData['title'] = $title;
        }

        $description = $this->localizedScalar($surveyJson['description'] ?? null);
        if ($description !== null) {
            $updateData['description'] = $description;
        }

        $surveySchema->update($updateData);

        return response()->json([
            'success' => true,
            'message' => __('schemava::surveyjs.designer.saved'),
        ]);
    }

    public function uploadImage(Request $request): JsonResponse
    {
        // Validate outside the try so a bad upload (wrong type / >5MB) returns
        // Laravel's standard 422 instead of a generic 500.
        $request->validate([
            'files' => 'required|array',
            'files.*' => 'required|image|max:5120', // 5MB max
        ]);

        try {
            $disk = config('schemava.storage.disk', 'public');
            $directory = config('schemava.storage.images_path', 'surveys/images');

            // The builder uploads one file at a time.
            $file = $request->file('files')[0];

            // Guard an empty path so we never hand back the disk base URL with an
            // empty path (the bug behind saved `.../tenant_.../` imageLinks).
            $path = $file->store($directory, $disk);

            if (! is_string($path) || $path === '') {
                Log::error('Survey image upload failed: store() returned an empty path', [
                    'disk' => $disk,
                    'original_name' => $file->getClientOriginalName(),
                    'size' => $file->getSize(),
                    'mime' => $file->getClientMimeType(),
                ]);

                return response()->json([
                    'status' => 'error',
                    'message' => __('schemava::surveyjs.designer.upload_failed'),
                ], 500);
            }

            return response()->json([
                'status' => 'success',
                'url' => Storage::disk($disk)->url($path),
            ]);
        } catch (Throwable $e) {
            Log::error('Survey image upload error: '.$e->getMessage());

            return response()->json([
                'status' => 'error',
                'message' => __('schemava::surveyjs.designer.upload_failed'),
            ], 500);
        }
    }

    public function queryAi(SurveyDesignerAiQueryRequest $request, SurveySchema $surveySchema): JsonResponse
    {
        if (Gate::getPolicyFor($surveySchema)) {
            $this->authorize('update', $surveySchema);
        }

        // Hidden in the UI when unconfigured — refuse direct calls too.
        if (! config('schemava.ai.enabled', true) || ! app(AiAssistant::class)->isConfigured()) {
            return response()->json(['error' => __('schemava::surveyjs.ai.not_configured')], 503);
        }

        $validated = $request->validated();

        $result = app(AiAssistant::class)->query(
            $surveySchema,
            $validated['text'] ?? null,
            $validated['messageHistory'],
        );

        if (($result['ok'] ?? false) === true) {
            return response()->json(['text' => $result['text'] ?? '']);
        }

        return response()->json(
            ['error' => $result['error'] ?? 'AI request failed.'],
            (int) ($result['status'] ?? 502),
        );
    }

    /**
     * Reduce a SurveyJS localizable value (a plain string or a localized object
     * like `{default, en}`) to the default scalar stored in the title /
     * description columns. Returns null for unusable input so the caller skips
     * the column rather than writing an array/empty string into it.
     */
    private function localizedScalar(mixed $value): ?string
    {
        if (is_string($value)) {
            return trim($value) === '' ? null : $value;
        }

        if (! is_array($value)) {
            return null;
        }

        $candidates = [];
        if (array_key_exists('default', $value)) {
            $candidates[] = $value['default'];
        }
        if (array_key_exists('ar', $value)) {
            $candidates[] = $value['ar'];
        }
        $candidates = array_merge($candidates, array_values($value));

        foreach ($candidates as $candidate) {
            if (is_string($candidate) && trim($candidate) !== '') {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * Enforce settings on certain question types: file/signature uploads must
     * wait for the upload to complete and be stored as files (not base64).
     *
     * @param  array<string, mixed>  $surveyJson
     * @return array<string, mixed>
     */
    private function processSurveyJson(array $surveyJson): array
    {
        if (isset($surveyJson['pages']) && is_array($surveyJson['pages'])) {
            foreach ($surveyJson['pages'] as $pageIndex => $page) {
                if (isset($page['elements']) && is_array($page['elements'])) {
                    foreach ($page['elements'] as $elementIndex => $element) {
                        $surveyJson['pages'][$pageIndex]['elements'][$elementIndex] =
                            $this->processElement($element);
                    }
                }
            }
        }

        return $surveyJson;
    }

    /**
     * @param  array<string, mixed>  $element
     * @return array<string, mixed>
     */
    private function processElement(array $element): array
    {
        if (in_array($element['type'] ?? '', ['signaturepad', 'file'], true)) {
            $element['storeDataAsText'] = false;
            $element['waitForUpload'] = true;
        }

        if (isset($element['elements']) && is_array($element['elements'])) {
            foreach ($element['elements'] as $index => $nestedElement) {
                $element['elements'][$index] = $this->processElement($nestedElement);
            }
        }

        if (isset($element['templateElements']) && is_array($element['templateElements'])) {
            foreach ($element['templateElements'] as $index => $nestedElement) {
                $element['templateElements'][$index] = $this->processElement($nestedElement);
            }
        }

        return $element;
    }
}
