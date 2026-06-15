<?php

namespace Asimnet\FilamentSurveyjs\Models;

use Asimnet\FilamentSurveyjs\Contracts\SurveyAccessResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Str;

/**
 * Generic SurveyJS schema. Identity-, access-, and domain-specific behavior
 * (roles, gender/age gating, activity targeting, help-form handling) lives in
 * the host application via subclasses and the package's contracts — not here.
 */
class SurveySchema extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'survey_json',
        'start_date',
        'end_date',
        'max_submissions_per_user',
        'role_access',
        'gender_access',
        'age_range',
        'is_active',
        'open_at',
        'close_at',
        'close_message',
        'unavailable_message',
        'max_responses',
        'submission_limit_per_user',
        'surveyable_id',
        'surveyable_type',
        'tags',
        'hash',
    ];

    protected $attributes = [
        'survey_json' => '{"pages":[{"name":"page1","elements":[]}]}',
    ];

    protected function casts(): array
    {
        return [
            'survey_json' => 'array',
            'start_date' => 'datetime',
            'end_date' => 'datetime',
            'max_submissions_per_user' => 'integer',
            'role_access' => 'array',
            'gender_access' => 'array',
            'age_range' => 'array',
            'is_active' => 'boolean',
            'open_at' => 'datetime',
            'close_at' => 'datetime',
            'max_responses' => 'integer',
            'submission_limit_per_user' => 'integer',
            'tags' => 'array',
        ];
    }

    public function getTable(): string
    {
        return config('filament-surveyjs.tables.schemas', 'survey_schemas');
    }

    protected static function booted(): void
    {
        static::creating(function (self $schema): void {
            if (empty($schema->hash)) {
                $schema->hash = static::generateUniqueHash();
            }
        });

        static::updating(function (self $schema): void {
            if (empty($schema->hash)) {
                $schema->hash = static::generateUniqueHash();
            }
        });

        static::deleting(function (self $schema): void {
            $schema->results()->delete();
        });
    }

    protected static function generateUniqueHash(): string
    {
        do {
            $hash = Str::random(6);
        } while (static::query()->where('hash', $hash)->exists());

        return $hash;
    }

    public function results(): HasMany
    {
        return $this->hasMany(
            config('filament-surveyjs.models.result', SurveyResult::class),
            'survey_schema_id',
        );
    }

    /**
     * The parent model this schema is attached to (e.g. an Activity or Event in
     * the host app), if any.
     */
    public function surveyable(): MorphTo
    {
        return $this->morphTo();
    }

    public function hasStarted(): bool
    {
        return $this->start_date === null || now()->gte($this->start_date);
    }

    public function hasEnded(): bool
    {
        return $this->end_date !== null && now()->gt($this->end_date);
    }

    /**
     * Whether the schema is currently open for submissions, considering the
     * active flag, the open/close window, and the global response cap.
     */
    public function isOpen(): bool
    {
        if (! $this->is_active) {
            return false;
        }

        $now = now();

        if ($this->open_at && $now->lt($this->open_at)) {
            return false;
        }

        if ($this->close_at && $now->gt($this->close_at)) {
            return false;
        }

        if ($this->max_responses && $this->results()->count() >= $this->max_responses) {
            return false;
        }

        return true;
    }

    /**
     * Generic submission gate based only on the active flag, the start/end
     * window, and the per-user submission cap. Richer rules (roles, gender, age,
     * targeting) are applied by a {@see SurveyAccessResolver}.
     */
    public function canSubmit(int|string|null $userId = null): bool
    {
        if (! $this->is_active || ! $this->hasStarted() || $this->hasEnded()) {
            return false;
        }

        if ($this->max_submissions_per_user && $userId) {
            $count = $this->results()->where('user_id', $userId)->count();

            if ($count >= $this->max_submissions_per_user) {
                return false;
            }
        }

        return true;
    }

    /**
     * Route binding with strict integer validation for id-bound routes. The
     * query is overridable so host apps can relax/extend default global scopes.
     */
    public function resolveRouteBinding($value, $field = null): ?static
    {
        $routeField = $field ?? $this->getRouteKeyName();

        if ($routeField === 'id') {
            if (! is_string($value) && ! is_int($value)) {
                return null;
            }

            $normalizedId = (string) $value;

            if (! ctype_digit($normalizedId)) {
                return null;
            }

            $value = (int) $normalizedId;
        }

        return $this->routeBindingQuery()->where($routeField, $value)->firstOrFail();
    }

    /**
     * Base query used for route-model binding. Overridable by host apps (e.g.
     * to bypass a "hide help forms" global scope).
     */
    protected function routeBindingQuery(): Builder
    {
        return static::query();
    }
}
