<?php

namespace AsimNet\Schemava\Support;

use AsimNet\Schemava\Contracts\AiAssistant;
use AsimNet\Schemava\Models\SurveySchema;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * OpenRouter-backed AI assistant (OpenAI-compatible chat completions over
 * plain HTTP — no extra composer dependency). Configure via config('schemava.ai'):
 *
 *   'ai' => [
 *       'enabled'  => true,
 *       'api_key'  => env('SCHEMAVA_AI_API_KEY'),
 *       'model'    => env('SCHEMAVA_AI_MODEL', 'anthropic/claude-sonnet-4.5'),
 *       'base_url' => env('SCHEMAVA_AI_BASE_URL', 'https://openrouter.ai/api/v1'),
 *   ]
 *
 * Any OpenAI-compatible endpoint works through base_url (OpenRouter, OpenAI,
 * a local gateway). Unconfigured (no key) or disabled, isConfigured() is false
 * and the designer hides the assistant entirely.
 */
class OpenRouterAiAssistant implements AiAssistant
{
    /**
     * The assistant's system prompt. Kept in sync with the designer's ACTUAL
     * capabilities — update it whenever the builder gains element types or
     * schema-level features, or the model will author schemas the designer
     * (or the renderer) cannot faithfully handle.
     */
    protected function systemPrompt(): string
    {
        return <<<'PROMPT'
You are the built-in form-building assistant of Schemava, an Arabic-first visual
form designer that stores forms as SurveyJS-compatible JSON.

## Response format — STRICT
- Reply with a SHORT comment in the user's language (Arabic for Arabic requests).
- When you change the form, follow the comment with EXACTLY ONE fenced ```json
  block containing the COMPLETE updated survey JSON (never a fragment or diff).
- For questions that need no form change, reply with the comment only (no json).

## Survey JSON rules
- Top level: { "title", "description", "pages": [...], optional "triggers",
  "calculatedValues", "completedHtml", "pagePrevText", "pageNextText", "completeText" }.
- Every localizable text is either a plain string (Arabic — the default locale)
  or an object { "default": "النص العربي", "en": "English text" }. Author Arabic
  in "default"; add "en" only when the user asks for bilingual content.
- Pages: { "name", "title"?, "description"?, "visibleIf"?, "elements": [...] }.
- Element names must be unique across the WHOLE survey (including inside
  panels). Keep existing names unchanged so logic references and stored
  results survive; use short latin snake_case for new names.

## Supported element types (use ONLY these)
text (with "inputType": text|email|tel|url|number|date, "min"/"max" for number),
comment, radiogroup, checkbox, dropdown, tagbox, ranking, imagepicker,
boolean ("labelTrue"/"labelFalse"), rating ("rateMax", "rateType": stars|labels|smileys),
slider ("min", "max", "step"), html (statement content in "html"), image ("imageLink"),
file ("allowMultiple", "acceptedTypes", "maxSize"), signaturepad, expression
("expression", "displayStyle"), multipletext ("items": [{ "name", "title" }], "colCount"),
matrix ("rows", "columns" as value/text items), matrixdropdown ("rows" + "columns"
as { "name", "title", "cellType", "choices"? }), matrixdynamic ("columns" + "rowCount"),
panel (static group; children in "elements"), paneldynamic (repeating group;
children in "templateElements", plus "panelCount", "minPanelCount", "maxPanelCount",
"panelAddText", "panelRemoveText").
- Do NOT nest panel/paneldynamic inside each other.
- choices may be plain strings (Arabic) or { "value", "text" } objects.

## Behaviour features
- Conditional visibility: "visibleIf" / "enableIf" expressions on elements AND
  pages, e.g. "{q_age} > 18 and {q_type} = 'موظف'".
- Piping: "{q_name}" tokens inside titles/descriptions; "defaultValueExpression".
- Quiz grading: "correctAnswer" (+ optional numeric "score", default 1) on a
  question makes it auto-graded; totals are computed server-side.
- Survey triggers: "triggers": [{ "type": "skip", "expression", "gotoName" } |
  { "type": "complete", "expression" }].
- "calculatedValues": [{ "name", "expression", "includeIntoResult"? }].
- Required: "isRequired": true; custom message via "requiredErrorText".

## Style
- Default to Arabic content, concise labels, and sensible choices.
- Prefer one page unless the form is long or the user asks for steps.
- Never invent properties outside this catalogue; unknown props are preserved
  by the designer but invisible to the author — avoid them.
PROMPT;
    }

    public function isConfigured(): bool
    {
        return (bool) config('schemava.ai.enabled', true)
            && trim((string) config('schemava.ai.api_key', '')) !== '';
    }

    public function query(SurveySchema $schema, ?string $text, array $messageHistory): array
    {
        if (! $this->isConfigured()) {
            return [
                'ok' => false,
                'error' => __('schemava::surveyjs.ai.not_configured'),
                'status' => 503,
            ];
        }

        $messages = [['role' => 'system', 'content' => $this->systemPrompt()]];
        foreach ($messageHistory as $message) {
            if (is_array($message) && in_array($message['role'] ?? '', ['user', 'assistant'], true)) {
                $messages[] = [
                    'role' => $message['role'],
                    'content' => (string) ($message['content'] ?? ''),
                ];
            }
        }
        if ($text !== null && trim($text) !== '') {
            $messages[] = ['role' => 'user', 'content' => $text];
        }

        try {
            $response = Http::withToken((string) config('schemava.ai.api_key'))
                ->timeout((int) config('schemava.ai.timeout', 90))
                ->post(rtrim((string) config('schemava.ai.base_url', 'https://openrouter.ai/api/v1'), '/').'/chat/completions', [
                    'model' => (string) config('schemava.ai.model', 'anthropic/claude-sonnet-4.5'),
                    'messages' => $messages,
                ]);
        } catch (Throwable $exception) {
            report($exception);

            return ['ok' => false, 'error' => __('schemava::surveyjs.ai.request_failed'), 'status' => 502];
        }

        if ($response->failed()) {
            return ['ok' => false, 'error' => __('schemava::surveyjs.ai.request_failed'), 'status' => 502];
        }

        $content = $response->json('choices.0.message.content');

        if (! is_string($content) || trim($content) === '') {
            return ['ok' => false, 'error' => __('schemava::surveyjs.ai.request_failed'), 'status' => 502];
        }

        return ['ok' => true, 'text' => $content];
    }
}
