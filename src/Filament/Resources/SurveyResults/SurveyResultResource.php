<?php

namespace AsimNet\Schemava\Filament\Resources\SurveyResults;

use AsimNet\Schemava\Filament\Resources\SurveyResults\Pages\ListSurveyResults;
use AsimNet\Schemava\Models\SurveyResult;
use AsimNet\Schemava\SchemavaPlugin;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\ViewAction;
use Filament\Resources\Resource;
use Filament\Support\Enums\Width;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Builder;

/**
 * Top-level, read-only browser for submissions across every form. Shipped by
 * {@see SchemavaPlugin} when `surveyResultResource()` is enabled (the default),
 * complementing the per-form Responses tab with a cross-form view. Submissions
 * may carry PII, so it is gated behind the plugin's authorization.
 */
class SurveyResultResource extends Resource
{
    protected static ?string $model = SurveyResult::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedInbox;

    /**
     * Resolve the configured result model so host subclasses are used.
     */
    public static function getModel(): string
    {
        return config('schemava.models.result', SurveyResult::class);
    }

    public static function getNavigationLabel(): string
    {
        return __('schemava::surveyjs.all_responses.navigation_label');
    }

    public static function getModelLabel(): string
    {
        return __('schemava::surveyjs.all_responses.model_label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('schemava::surveyjs.all_responses.plural_model_label');
    }

    // Plugin lookups use getOrNull() with a config/deny fallback: Filament calls
    // these statics while registering panels that may not carry the plugin, and
    // a throwing lookup there takes the whole app down (#4).

    public static function getNavigationGroup(): ?string
    {
        return SchemavaPlugin::getOrNull()?->getNavigationGroup()
            ?? config('schemava.navigation.group');
    }

    public static function getNavigationSort(): ?int
    {
        return (SchemavaPlugin::getOrNull()?->getNavigationSort()
            ?? (int) config('schemava.navigation.sort', 100)) + 1;
    }

    public static function canAccess(): bool
    {
        return SchemavaPlugin::getOrNull()?->isAuthorized() ?? false;
    }

    public static function shouldRegisterNavigation(): bool
    {
        return SchemavaPlugin::getOrNull()?->isAuthorized() ?? false;
    }

    // Read-only: responses are collected via the public form, not created here.
    public static function canCreate(): bool
    {
        return false;
    }

    public static function table(Table $table): Table
    {
        return $table
            ->modifyQueryUsing(fn (Builder $query): Builder => $query->with(['user', 'surveySchema']))
            ->columns([
                TextColumn::make('respondent')
                    ->label(__('schemava::surveyjs.responses.respondent'))
                    ->state(fn (SurveyResult $record): string => static::resolveRespondent($record))
                    ->searchable(query: function ($query, string $search) {
                        return $query->whereHas('user', function ($userQuery) use ($search): void {
                            $userQuery->where('name', 'like', "%{$search}%")
                                ->orWhere('email', 'like', "%{$search}%");
                        });
                    }),
                TextColumn::make('surveySchema.title')
                    ->label(__('schemava::surveyjs.all_responses.form'))
                    ->searchable()
                    ->sortable(),
                TextColumn::make('status')
                    ->label(__('schemava::surveyjs.responses.status'))
                    ->badge()
                    ->sortable(),
                TextColumn::make('submitted_at')
                    ->label(__('schemava::surveyjs.responses.submitted_at'))
                    ->dateTime()
                    ->since()
                    ->sortable(),
            ])
            ->defaultSort('submitted_at', 'desc')
            ->filters([
                SelectFilter::make('survey_schema')
                    ->label(__('schemava::surveyjs.all_responses.form'))
                    ->relationship('surveySchema', 'title')
                    ->searchable()
                    ->preload(),
            ])
            ->recordActions([
                ViewAction::make()
                    ->label(__('schemava::surveyjs.responses.view'))
                    ->modalHeading(__('schemava::surveyjs.responses.modal_title'))
                    ->modalWidth(Width::FiveExtraLarge)
                    ->modalSubmitAction(false)
                    ->modalContent(fn (SurveyResult $record): View => view('schemava::survey-result', [
                        'surveyJson' => $record->surveySchema?->survey_json ?? [],
                        'data' => $record->data ?? [],
                        'locale' => app()->getLocale(),
                        'rendererVersion' => config('schemava.renderer_version'),
                    ])),
                DeleteAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ])
            ->emptyStateHeading(__('schemava::surveyjs.all_responses.empty_heading'))
            ->emptyStateDescription(__('schemava::surveyjs.all_responses.empty_description'));
    }

    /**
     * Human label for the submitter, falling back to a localized "Guest" when the
     * submission has no associated user.
     */
    protected static function resolveRespondent(SurveyResult $record): string
    {
        $user = $record->user;

        if ($user === null) {
            return __('schemava::surveyjs.responses.guest');
        }

        return (string) ($user->getAttribute('name')
            ?: $user->getAttribute('email')
            ?: __('schemava::surveyjs.responses.guest'));
    }

    public static function getPages(): array
    {
        return [
            'index' => ListSurveyResults::route('/'),
        ];
    }
}
