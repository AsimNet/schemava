<?php

namespace AsimNet\Schemava\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * A single submission against a {@see SurveySchema}. The owning user model is
 * resolved from the application's auth config so the package stays agnostic of
 * the host's user class.
 */
class SurveyResult extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'data',
        'status',
        'submitted_at',
        'surveyable_id',
        'surveyable_type',
    ];

    /**
     * The schema foreign key column is configurable, so merge it into the
     * mass-assignable attributes at runtime rather than hard-coding a name.
     *
     * @return array<int, string>
     */
    public function getFillable(): array
    {
        return array_merge($this->fillable, [
            config('schemava.tables.schema_foreign_key', 'schemava_schema_id'),
        ]);
    }

    protected function casts(): array
    {
        return [
            'data' => 'array',
        ];
    }

    public function getTable(): string
    {
        return config('schemava.tables.results', 'schemava_results');
    }

    public function surveySchema(): BelongsTo
    {
        return $this->belongsTo(
            config('schemava.models.schema', SurveySchema::class),
            config('schemava.tables.schema_foreign_key', 'schemava_schema_id'),
        );
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(config('auth.providers.users.model'));
    }

    /**
     * The parent model the submission belongs to (mirrors the schema's
     * surveyable), kept for reporting/context.
     */
    public function surveyable(): MorphTo
    {
        return $this->morphTo();
    }
}
