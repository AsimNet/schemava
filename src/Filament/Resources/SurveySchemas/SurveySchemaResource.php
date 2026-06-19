<?php

namespace AsimNet\Schemava\Filament\Resources\SurveySchemas;

use AsimNet\Schemava\Contracts\SurveyUrlResolver;
use AsimNet\Schemava\Filament\Resources\SurveySchemas\Pages\CreateSurveySchema;
use AsimNet\Schemava\Filament\Resources\SurveySchemas\Pages\EditSurveySchema;
use AsimNet\Schemava\Filament\Resources\SurveySchemas\Pages\ListSurveySchemas;
use AsimNet\Schemava\Filament\Resources\SurveySchemas\Pages\ViewSurveySchema;
use AsimNet\Schemava\Filament\Resources\SurveySchemas\RelationManagers\ResultsRelationManager;
use AsimNet\Schemava\Models\SurveySchema;
use AsimNet\Schemava\SchemavaPlugin;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Infolists\Components\IconEntry;
use Filament\Infolists\Components\TextEntry;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Support\Facades\Route;

/**
 * Turnkey, generic resource for managing forms. Shipped by {@see SchemavaPlugin}
 * when `surveyResource()` is enabled (the default) so a fresh install gets a
 * working "Forms" panel out of the box. Host apps that need richer behavior
 * (capability gating, exports, domain columns) disable it with
 * `->surveyResource(false)` and register their own resource instead.
 */
class SurveySchemaResource extends Resource
{
    protected static ?string $model = SurveySchema::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedRectangleStack;

    protected static ?string $navigationLabel = 'Forms';

    protected static ?string $modelLabel = 'form';

    protected static ?string $pluralModelLabel = 'forms';

    /**
     * Resolve the configured schema model so host subclasses are used.
     */
    public static function getModel(): string
    {
        return config('schemava.models.schema', SurveySchema::class);
    }

    public static function getNavigationGroup(): ?string
    {
        return SchemavaPlugin::get()->getNavigationGroup();
    }

    public static function getNavigationSort(): ?int
    {
        return SchemavaPlugin::get()->getNavigationSort();
    }

    public static function canAccess(): bool
    {
        return SchemavaPlugin::get()->isAuthorized();
    }

    public static function shouldRegisterNavigation(): bool
    {
        return SchemavaPlugin::get()->isAuthorized();
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            TextInput::make('title')
                ->label('Form title')
                ->required()
                ->maxLength(255),
            Textarea::make('description')
                ->label('Description (optional)')
                ->rows(2)
                ->maxLength(1000),
            Toggle::make('is_active')
                ->label('Active')
                ->default(true),
        ]);
    }

    public static function infolist(Schema $schema): Schema
    {
        return $schema->components([
            TextEntry::make('title')
                ->label('Form title'),
            TextEntry::make('description')
                ->label('Description')
                ->placeholder('—'),
            IconEntry::make('is_active')
                ->label('Active')
                ->boolean(),
            TextEntry::make('responses')
                ->label(__('schemava::surveyjs.responses.count'))
                ->state(fn ($record): int => $record->results()->count())
                ->badge()
                ->color('gray'),
            TextEntry::make('schemava_version')
                ->label('Built with Schemava')
                ->placeholder('—'),
            TextEntry::make('hash')
                ->label('Public link key')
                ->copyable(),
            TextEntry::make('public_url')
                ->label('Public form URL')
                ->state(fn ($record): string => app(SurveyUrlResolver::class)->publicUrl($record))
                ->visible(fn (): bool => Route::has(config('schemava.routes.public.name', 'schemava.public.show')))
                ->url(fn ($record): string => app(SurveyUrlResolver::class)->publicUrl($record), shouldOpenInNewTab: true)
                ->copyable(),
            TextEntry::make('api_url')
                ->label('API endpoint')
                ->state(fn ($record): string => route('schemava.api.show', ['hash' => $record->hash]))
                ->visible(fn (): bool => Route::has('schemava.api.show'))
                ->helperText('Mobile / API — GET to fetch this form · POST {url}/responses to submit (JSON).')
                ->copyable(),
            TextEntry::make('created_at')
                ->label('Created')
                ->dateTime(),
            TextEntry::make('updated_at')
                ->label('Last edited')
                ->dateTime()
                ->since(),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('title')
                    ->label('Form')
                    ->weight('bold')
                    ->searchable()
                    ->sortable(),
                IconColumn::make('is_active')
                    ->label('Active')
                    ->boolean(),
                TextColumn::make('results_count')
                    ->label(__('schemava::surveyjs.responses.count'))
                    ->counts('results')
                    ->badge()
                    ->color('gray')
                    ->sortable(),
                TextColumn::make('updated_at')
                    ->label('Last edited')
                    ->dateTime()
                    ->since()
                    ->sortable(),
            ])
            ->recordUrl(fn ($record): string => static::getUrl('view', ['record' => $record]))
            ->recordActions([
                Action::make('design')
                    ->label('Design')
                    ->icon(Heroicon::OutlinedPencilSquare)
                    ->color('primary')
                    ->url(fn ($record): string => route('survey-designer.show', ['surveySchema' => $record->getKey()])),
                EditAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ])
            ->emptyStateHeading('No forms yet')
            ->emptyStateDescription('Create a form, then open the visual builder to design it.');
    }

    /**
     * Register the read-only responses relation manager when the plugin toggle
     * is enabled (the default). The relation manager additionally gates its own
     * visibility behind the resource's authorization.
     */
    public static function getRelations(): array
    {
        if (! SchemavaPlugin::get()->hasResponsesRelationManager()) {
            return [];
        }

        return [
            ResultsRelationManager::class,
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListSurveySchemas::route('/'),
            'create' => CreateSurveySchema::route('/create'),
            'view' => ViewSurveySchema::route('/{record}'),
            'edit' => EditSurveySchema::route('/{record}/edit'),
        ];
    }
}
