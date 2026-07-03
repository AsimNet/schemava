<?php

namespace AsimNet\Schemava\Tests\Unit;

use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\Support\LaravelAiAssistant;
use AsimNet\Schemava\Tests\TestCase;
use Laravel\Ai\AiServiceProvider;
use Laravel\Ai\AnonymousAgent;
use PHPUnit\Framework\Attributes\Test;

class LaravelAiAssistantTest extends TestCase
{
    protected function getPackageProviders($app): array
    {
        return array_merge(parent::getPackageProviders($app), [
            AiServiceProvider::class,
        ]);
    }

    private function schema(): SurveySchema
    {
        return new SurveySchema(['title' => 'اختبار']);
    }

    #[Test]
    public function it_is_unconfigured_without_provider_credentials_or_when_disabled(): void
    {
        config()->set('ai.default', 'openai');
        config()->set('ai.providers.openai', ['driver' => 'openai', 'key' => null]);
        $this->assertFalse((new LaravelAiAssistant)->isConfigured());

        config()->set('ai.providers.openai.key', 'sk-test');
        $this->assertTrue((new LaravelAiAssistant)->isConfigured());

        config()->set('schemava.ai.enabled', false);
        $this->assertFalse((new LaravelAiAssistant)->isConfigured());
    }

    #[Test]
    public function keyless_local_drivers_count_as_configured(): void
    {
        config()->set('schemava.ai.provider', 'ollama');
        config()->set('ai.providers.ollama', ['driver' => 'ollama', 'key' => '']);

        $this->assertTrue((new LaravelAiAssistant)->isConfigured());
    }

    #[Test]
    public function it_prompts_through_the_sdk_with_instructions_and_history(): void
    {
        config()->set('ai.default', 'openai');
        config()->set('ai.providers.openai', ['driver' => 'openai', 'key' => 'sk-test']);

        AnonymousAgent::fake([
            "تم.\n```json\n{\"pages\":[]}\n```",
        ]);

        $result = (new LaravelAiAssistant)->query($this->schema(), 'أضف سؤالاً', [
            ['role' => 'user', 'content' => 'Current survey JSON: {}'],
            ['role' => 'assistant', 'content' => 'حسناً.'],
        ]);

        $this->assertTrue($result['ok']);
        $this->assertStringContainsString('```json', $result['text']);

        AnonymousAgent::assertPrompted(function ($prompt) {
            return str_contains($prompt->agent->instructions(), 'paneldynamic')
                && str_contains($prompt->agent->instructions(), 'triggers')
                && str_contains($prompt->agent->instructions(), 'multipletext')
                && str_contains($prompt->agent->instructions(), 'slider')
                && $prompt->prompt === 'أضف سؤالاً';
        });
    }

    #[Test]
    public function it_refuses_queries_while_unconfigured(): void
    {
        config()->set('ai.default', 'openai');
        config()->set('ai.providers.openai', ['driver' => 'openai', 'key' => null]);

        $result = (new LaravelAiAssistant)->query($this->schema(), 'مرحبا', []);

        $this->assertFalse($result['ok']);
        $this->assertSame(503, $result['status']);
    }
}
