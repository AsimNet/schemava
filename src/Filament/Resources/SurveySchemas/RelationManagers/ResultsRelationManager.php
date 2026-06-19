<?php

namespace AsimNet\Schemava\Filament\Resources\SurveySchemas\RelationManagers;

use AsimNet\Schemava\Filament\Resources\SurveySchemas\SurveySchemaResource;
use AsimNet\Schemava\Models\SurveyResult;
use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\SchemavaPlugin;
use AsimNet\Schemava\Services\SurveyScoreCalculator;
use Filament\Actions\ViewAction;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Support\Enums\Width;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Read-only log of a schema's submissions ({@see SurveyResult}),
 * shipped on the bundled {@see SurveySchemaResource}.
 *
 * It is a viewer, not an editor: no create/edit/delete/bulk actions, only a
 * {@see ViewAction} that renders a single submission back through the SurveyJS
 * renderer in display mode (the `schemava::survey-result` view). Submissions may
 * carry PII, so visibility is gated behind the resource's own authorization.
 */
class ResultsRelationManager extends RelationManager
{
    protected static string $relationship = 'results';

    public static function getTitle(Model $ownerRecord, string $pageClass): string
    {
        return __('schemava::surveyjs.responses.title');
    }

    /**
     * Gate the whole relation manager behind the bundled resource's
     * authorization: the plugin toggle must be on, and the plugin's authorize
     * check (which the host configures, alongside any `schemava.policy`) must
     * pass. Mirrors {@see SurveySchemaResource::canAccess()}
     * so responses never surface to users who cannot access the resource.
     */
    public static function canViewForRecord(Model $ownerRecord, string $pageClass): bool
    {
        $plugin = SchemavaPlugin::get();

        return $plugin->hasResponsesRelationManager() && $plugin->isAuthorized();
    }

    public function table(Table $table): Table
    {
        return $table
            ->modifyQueryUsing(fn (Builder $query): Builder => $query->with('user'))
            ->columns([
                TextColumn::make('respondent')
                    ->label(__('schemava::surveyjs.responses.respondent'))
                    ->state(fn (Model $record): string => $this->resolveRespondent($record))
                    ->searchable(query: function ($query, string $search) {
                        return $query->whereHas('user', function ($userQuery) use ($search): void {
                            $userQuery->where('name', 'like', "%{$search}%")
                                ->orWhere('email', 'like', "%{$search}%");
                        });
                    }),
                TextColumn::make('status')
                    ->label(__('schemava::surveyjs.responses.status'))
                    ->badge()
                    ->sortable(),
                TextColumn::make('score')
                    ->label(__('schemava::surveyjs.responses.score'))
                    ->state(fn (Model $record): ?string => $this->resolveScore($record))
                    ->visible(fn (): bool => $this->ownerSchemaIsScored())
                    ->placeholder('—'),
                TextColumn::make('submitted_at')
                    ->label(__('schemava::surveyjs.responses.submitted_at'))
                    ->dateTime()
                    ->since()
                    ->sortable(),
            ])
            ->defaultSort('submitted_at', 'desc')
            ->filters([
                SelectFilter::make('status')
                    ->label(__('schemava::surveyjs.responses.status'))
                    ->options(fn (): array => $this->statusOptions()),
            ])
            ->recordActions([
                ViewAction::make()
                    ->label(__('schemava::surveyjs.responses.view'))
                    ->modalHeading(__('schemava::surveyjs.responses.modal_title'))
                    ->modalWidth(Width::FiveExtraLarge)
                    ->modalSubmitAction(false)
                    ->modalContent(fn (Model $record): View => $this->renderSubmission($record)),
            ])
            ->emptyStateHeading(__('schemava::surveyjs.responses.empty_heading'))
            ->emptyStateDescription(__('schemava::surveyjs.responses.empty_description'));
    }

    /**
     * Resolve a human label for the submitter, falling back to a localized
     * "Guest" when the submission has no associated user (user_id is null).
     */
    protected function resolveRespondent(Model $record): string
    {
        $user = $record->user;

        if ($user === null) {
            return __('schemava::surveyjs.responses.guest');
        }

        $name = $user->getAttribute('name');
        $email = $user->getAttribute('email');

        return (string) ($name ?: $email ?: __('schemava::surveyjs.responses.guest'));
    }

    /**
     * Compute the submission's score string ("score/max") when the owner schema
     * is graded, reusing {@see SurveyScoreCalculator}.
     */
    protected function resolveScore(Model $record): ?string
    {
        $schema = $this->ownerSchema();

        if ($schema === null) {
            return null;
        }

        $scored = app(SurveyScoreCalculator::class)->appendScores($schema, $record->data ?? []);

        return ($scored['totalScore'] ?? 0).' / '.($scored['maxScore'] ?? 0);
    }

    protected function ownerSchemaIsScored(): bool
    {
        $schema = $this->ownerSchema();

        return $schema !== null && app(SurveyScoreCalculator::class)->isScored($schema);
    }

    /**
     * Distinct status values present on this schema's submissions, mapped to
     * themselves so the filter only ever offers statuses that actually exist.
     *
     * @return array<string, string>
     */
    protected function statusOptions(): array
    {
        $schema = $this->ownerSchema();

        if ($schema === null) {
            return [];
        }

        $statuses = $schema->results()
            ->whereNotNull('status')
            ->distinct()
            ->pluck('status')
            ->filter()
            ->values()
            ->all();

        return array_combine($statuses, $statuses) ?: [];
    }

    /**
     * Render the stored submission read-only through the SurveyJS renderer,
     * passing the PARENT schema's survey_json, the record's data, the active
     * locale, and the pinned renderer version.
     */
    protected function renderSubmission(Model $record): View
    {
        $schema = $this->ownerSchema();

        return view('schemava::survey-result', [
            'surveyJson' => $schema?->survey_json ?? [],
            'data' => $record->data ?? [],
            'locale' => app()->getLocale(),
            'rendererVersion' => config('schemava.renderer_version'),
        ]);
    }

    /**
     * The owning schema, resolved through the configured schema model.
     */
    protected function ownerSchema(): ?SurveySchema
    {
        $owner = $this->getOwnerRecord();

        return $owner instanceof SurveySchema ? $owner : null;
    }
}
