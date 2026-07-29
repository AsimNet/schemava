<?php

namespace AsimNet\Schemava\Tests\Feature;

use AsimNet\Schemava\Tests\TestCase;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\Test;

/**
 * Issue #5: a fresh install must not expose unauthenticated, internet-facing
 * endpoints. The public form and the JSON API are opt-in; only the (auth'd)
 * designer routes register by default.
 */
class RouteDefaultsTest extends TestCase
{
    #[Test]
    public function the_public_form_routes_are_not_registered_by_default(): void
    {
        $this->assertFalse(Route::has('schemava.public.show'));
        $this->assertFalse(Route::has('schemava.public.submit'));
    }

    #[Test]
    public function the_api_routes_are_not_registered_by_default(): void
    {
        $this->assertFalse(Route::has('schemava.api.index'));
        $this->assertFalse(Route::has('schemava.api.show'));
        $this->assertFalse(Route::has('schemava.api.submit'));
    }

    #[Test]
    public function the_designer_routes_are_registered_by_default(): void
    {
        $this->assertTrue(Route::has('survey-designer.show'));
        $this->assertTrue(Route::has('survey-designer.save'));
    }

    #[Test]
    public function the_ai_assistant_is_disabled_by_default(): void
    {
        $this->assertFalse((bool) config('schemava.ai.enabled'));
    }
}
