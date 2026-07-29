<?php

namespace AsimNet\Schemava;

use AsimNet\Schemava\Filament\Resources\SurveyResults\SurveyResultResource;
use AsimNet\Schemava\Filament\Resources\SurveySchemas\SurveySchemaResource;
use AsimNet\Schemava\Models\SurveySchema;
use Closure;
use Filament\Contracts\Plugin;
use Filament\Facades\Filament;
use Filament\Panel;
use Filament\Support\Concerns\EvaluatesClosures;
use LogicException;

class SchemavaPlugin implements Plugin
{
    use EvaluatesClosures;

    protected bool $hasSurveyResource = true;

    protected bool $hasResponsesRelationManager = true;

    protected bool $hasSurveyResultResource = true;

    protected string|Closure|null $navigationGroup = null;

    protected int|Closure $navigationSort = 100;

    protected Closure|bool $authorizeCallback = true;

    protected string|Closure|null $backUrl = null;

    public static function make(): static
    {
        return app(static::class);
    }

    public static function get(): static
    {
        $plugin = static::getOrNull();

        if ($plugin === null) {
            throw new LogicException('SchemavaPlugin is not registered on any Filament panel.');
        }

        return $plugin;
    }

    /**
     * Resolve the plugin without assuming the current panel carries it. Filament
     * calls resource statics (navigation, access, relations) while registering
     * EVERY panel — at that point the "current" panel is the default one, so
     * resolving through it fatals any multi-panel app that registers the plugin
     * elsewhere. Prefer the current panel, fall back to scanning all panels,
     * and return null when the plugin is registered nowhere.
     */
    public static function getOrNull(): ?static
    {
        $id = app(static::class)->getId();

        $current = Filament::getCurrentOrDefaultPanel();

        if ($current?->hasPlugin($id)) {
            /** @var static */
            return $current->getPlugin($id);
        }

        foreach (Filament::getPanels() as $panel) {
            if ($panel->hasPlugin($id)) {
                /** @var static */
                return $panel->getPlugin($id);
            }
        }

        return null;
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

    /**
     * Where the designer's "back" control returns to. Pass a URL, or a closure
     * receiving the schema (as $schema) and returning one. When unset, the
     * default URL resolver falls back to `schemava.routes.designer.back_url`
     * and then to the bundled resource's view page.
     */
    public function backUrl(string|Closure|null $url): static
    {
        $this->backUrl = $url;

        return $this;
    }

    public function getBackUrl(SurveySchema $schema): ?string
    {
        $url = $this->evaluate($this->backUrl, [
            'schema' => $schema,
            'surveySchema' => $schema,
            'record' => $schema,
        ], [
            SurveySchema::class => $schema,
            $schema::class => $schema,
        ]);

        return is_string($url) && $url !== '' ? $url : null;
    }
}
