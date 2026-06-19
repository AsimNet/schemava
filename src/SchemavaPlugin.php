<?php

namespace AsimNet\Schemava;

use AsimNet\Schemava\Filament\Resources\SurveyResults\SurveyResultResource;
use AsimNet\Schemava\Filament\Resources\SurveySchemas\SurveySchemaResource;
use Closure;
use Filament\Contracts\Plugin;
use Filament\Panel;
use Filament\Support\Concerns\EvaluatesClosures;

class SchemavaPlugin implements Plugin
{
    use EvaluatesClosures;

    protected bool $hasSurveyResource = true;

    protected bool $hasResponsesRelationManager = true;

    protected bool $hasSurveyResultResource = true;

    protected string|Closure|null $navigationGroup = null;

    protected int|Closure $navigationSort = 100;

    protected Closure|bool $authorizeCallback = true;

    public static function make(): static
    {
        return app(static::class);
    }

    public static function get(): static
    {
        /** @var static $plugin */
        $plugin = filament(app(static::class)->getId());

        return $plugin;
    }

    public function getId(): string
    {
        return 'schemava';
    }

    public function register(Panel $panel): void
    {
        $resources = [];

        if ($this->hasSurveyResource) {
            $resources[] = SurveySchemaResource::class;
        }

        if ($this->hasSurveyResultResource) {
            $resources[] = SurveyResultResource::class;
        }

        if ($resources !== []) {
            $panel->resources($resources);
        }
    }

    public function boot(Panel $panel): void
    {
        // Per-panel initialization after registration.
    }

    /**
     * Enable or disable the survey schema resource.
     */
    public function surveyResource(bool $enabled = true): static
    {
        $this->hasSurveyResource = $enabled;

        return $this;
    }

    public function hasSurveyResource(): bool
    {
        return $this->hasSurveyResource;
    }

    /**
     * Enable or disable the read-only responses (submissions) relation manager
     * on the bundled schema resource. Enabled by default so a fresh install can
     * browse submissions out of the box.
     */
    public function responsesRelationManager(bool $enabled = true): static
    {
        $this->hasResponsesRelationManager = $enabled;

        return $this;
    }

    public function hasResponsesRelationManager(): bool
    {
        return $this->hasResponsesRelationManager;
    }

    /**
     * Enable or disable the top-level "All responses" resource — a read-only,
     * cross-form browser of submissions. Enabled by default.
     */
    public function surveyResultResource(bool $enabled = true): static
    {
        $this->hasSurveyResultResource = $enabled;

        return $this;
    }

    public function hasSurveyResultResource(): bool
    {
        return $this->hasSurveyResultResource;
    }

    /**
     * Set the navigation group for the plugin's resources.
     */
    public function navigationGroup(string|Closure|null $group): static
    {
        $this->navigationGroup = $group;

        return $this;
    }

    public function getNavigationGroup(): ?string
    {
        return $this->evaluate($this->navigationGroup);
    }

    /**
     * Set the navigation sort order for the plugin's resources.
     */
    public function navigationSort(int|Closure $sort): static
    {
        $this->navigationSort = $sort;

        return $this;
    }

    public function getNavigationSort(): int
    {
        return $this->evaluate($this->navigationSort);
    }

    /**
     * Gate visibility and access of the bundled resource. Pass a closure that
     * returns a bool (e.g. a role or permission check) or a plain bool. Defaults
     * to visible for every panel user.
     */
    public function authorize(Closure|bool $callback): static
    {
        $this->authorizeCallback = $callback;

        return $this;
    }

    public function isAuthorized(): bool
    {
        return (bool) $this->evaluate($this->authorizeCallback);
    }
}
