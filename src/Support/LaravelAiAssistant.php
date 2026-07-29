<?php

namespace AsimNet\Schemava\Support;

use AsimNet\Schemava\Contracts\AiAssistant;
use AsimNet\Schemava\Models\SurveySchema;
use Laravel\Ai\AnonymousAgent;
use Laravel\Ai\Messages\AssistantMessage;
use Laravel\Ai\Messages\UserMessage;
use Throwable;

/**
 * AI assistant built on Laravel's first-party AI SDK (laravel/ai ^0.8).
 *
 * Provider credentials and endpoints live in the SDK's own config/ai.php
 * (OPENAI_API_KEY, ANTHROPIC_API_KEY, …); Schemava only chooses WHICH provider
 * and model to use via config('schemava.ai'). To route through OpenRouter,
 * configure the SDK's openai provider with OPENAI_URL=https://openrouter.ai/api/v1.
 *
 * laravel/ai is a suggested (not required) dependency — when it is not
 * installed, isConfigured() is false, the designer hides the assistant, and
 * the endpoint refuses queries.
 */
class LaravelAiAssistant implements AiAssistant
{
    /**
     * The assistant's system prompt (the agent's instructions). Kept in sync
     * with the designer's ACTUAL capabilities — update it whenever the builder
     * gains element types or schema-level features, or the model will author
     * schemas the designer (or the renderer) cannot faithfully handle.
     */
    protected function instructions(): string
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
        if (! (bool) config('schemava.ai.enabled', false) || ! class_exists(AnonymousAgent::class)) {
            return false;
        }

        $provider = (string) (config('schemava.ai.provider') ?: config('ai.default', 'openai'));
        $providerConfig = config("ai.providers.{$provider}");

        if (! is_array($providerConfig)) {
            return false;
        }

        // Key-less drivers (local ollama, IAM-authenticated bedrock) count as
        // configured; everything else needs its API key present.
        if (in_array($providerConfig['driver'] ?? $provider, ['ollama', 'bedrock'], true)) {
            return true;
        }

        return trim((string) ($providerConfig['key'] ?? '')) !== '';
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

        $messages = [];
        foreach ($messageHistory as $message) {
            if (! is_array($message)) {
                continue;
            }
            $content = (string) ($message['content'] ?? '');
            match ($message['role'] ?? null) {
                'user' => $messages[] = new UserMessage($content),
                'assistant' => $messages[] = new AssistantMessage($content),
                default => null,
            };
        }

        try {
            $response = (new AnonymousAgent($this->instructions(), $messages, []))->prompt(
                trim((string) $text) !== '' ? (string) $text : 'تابع.',
                provider: config('schemava.ai.provider') ?: null,
                model: config('schemava.ai.model') ?: null,
                timeout: (int) config('schemava.ai.timeout', 90),
            );
        } catch (Throwable $exception) {
            report($exception);

            return ['ok' => false, 'error' => __('schemava::surveyjs.ai.request_failed'), 'status' => 502];
        }

        $content = trim((string) $response->text);

        if ($content === '') {
            return ['ok' => false, 'error' => __('schemava::surveyjs.ai.request_failed'), 'status' => 502];
        }

        return ['ok' => true, 'text' => $content];
    }
}
