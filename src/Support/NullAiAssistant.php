<?php

namespace Asimnet\FilamentSurveyjs\Support;

use Asimnet\FilamentSurveyjs\Contracts\AiAssistant;
use Asimnet\FilamentSurveyjs\Models\SurveySchema;

/**
 * Default AI assistant: reports itself as unconfigured and refuses queries.
 * Bind a working adapter (e.g. the bundled laravel/ai OpenRouter adapter) via
 * config('filament-surveyjs.contracts.ai_assistant') to enable AI building.
 */
class NullAiAssistant implements AiAssistant
{
    public function isConfigured(): bool
    {
        return false;
    }

    public function query(SurveySchema $schema, ?string $text, array $messageHistory): array
    {
        return [
            'ok' => false,
            'message' => __('filament-surveyjs::surveyjs.ai.not_configured'),
        ];
    }
}
