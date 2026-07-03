<?php

namespace AsimNet\Schemava\Tests\Unit;

use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\Support\OpenRouterAiAssistant;
use AsimNet\Schemava\Tests\TestCase;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\Test;

class OpenRouterAiAssistantTest extends TestCase
{
    private function schema(): SurveySchema
    {
        return new SurveySchema(['title' => 'اختبار']);
    }

    #[Test]
    public function it_is_unconfigured_without_an_api_key_or_when_disabled(): void
    {
        config()->set('schemava.ai.api_key', null);
        $this->assertFalse((new OpenRouterAiAssistant)->isConfigured());

        config()->set('schemava.ai.api_key', 'sk-test');
        $this->assertTrue((new OpenRouterAiAssistant)->isConfigured());

        config()->set('schemava.ai.enabled', false);
        $this->assertFalse((new OpenRouterAiAssistant)->isConfigured());
    }

    #[Test]
    public function it_sends_the_system_prompt_and_history_and_returns_the_reply(): void
    {
        config()->set('schemava.ai.enabled', true);
        config()->set('schemava.ai.api_key', 'sk-test');

        Http::fake([
            'openrouter.ai/*' => Http::response([
                'choices' => [['message' => ['content' => "تم.\n```json\n{\"pages\":[]}\n```"]]],
            ]),
        ]);

        $result = (new OpenRouterAiAssistant)->query($this->schema(), 'أضف سؤالاً', [
            ['role' => 'user', 'content' => 'Current survey JSON: {}'],
        ]);

        $this->assertTrue($result['ok']);
        $this->assertStringContainsString('```json', $result['text']);

        Http::assertSent(function ($request) {
            $messages = $request['messages'];

            return $messages[0]['role'] === 'system'
                && str_contains($messages[0]['content'], 'paneldynamic')
                && str_contains($messages[0]['content'], 'triggers')
                && str_contains($messages[0]['content'], 'multipletext')
                && str_contains($messages[0]['content'], 'slider')
                && end($messages)['content'] === 'أضف سؤالاً';
        });
    }

    #[Test]
    public function it_maps_provider_failures_to_a_502_error_payload(): void
    {
        config()->set('schemava.ai.enabled', true);
        config()->set('schemava.ai.api_key', 'sk-test');

        Http::fake(['openrouter.ai/*' => Http::response(['error' => 'boom'], 500)]);

        $result = (new OpenRouterAiAssistant)->query($this->schema(), 'مرحبا', []);

        $this->assertFalse($result['ok']);
        $this->assertSame(502, $result['status']);
    }

    #[Test]
    public function it_refuses_queries_while_unconfigured(): void
    {
        config()->set('schemava.ai.api_key', null);

        $result = (new OpenRouterAiAssistant)->query($this->schema(), 'مرحبا', []);

        $this->assertFalse($result['ok']);
        $this->assertSame(503, $result['status']);
    }
}
