<?php

namespace AsimNet\Schemava\Support;

use AsimNet\Schemava\Contracts\AiAssistant;
use AsimNet\Schemava\Models\SurveySchema;

/**
 * Default AI assistant: reports itself as unconfigured and refuses queries.
 * Bind a working adapter (the bundled LaravelAiAssistant, or your own) via
 * config('schemava.contracts.ai_assistant') to enable AI building.
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
            'message' => __('schemava::surveyjs.ai.not_configured'),
        ];
    }
}
