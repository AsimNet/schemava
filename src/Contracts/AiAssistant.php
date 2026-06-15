<?php

namespace AsimNet\Schemava\Contracts;

use AsimNet\Schemava\Models\SurveySchema;

/**
 * Answers the builder's AI assistant requests. The package ships a no-op
 * implementation; a working adapter (e.g. the bundled laravel/ai OpenRouter
 * adapter, or a host-provided provider) is bound via configuration.
 */
interface AiAssistant
{
    /**
     * Whether the assistant has the credentials/configuration needed to run.
     */
    public function isConfigured(): bool;

    /**
     * Answer a builder AI request for the given schema.
     *
     * @param  array<int, array{role: string, content: string}>  $messageHistory
     * @return array<string, mixed> Structured response — typically a reply
     *                              message plus an optional updated survey JSON.
     */
    public function query(SurveySchema $schema, ?string $text, array $messageHistory): array;
}
