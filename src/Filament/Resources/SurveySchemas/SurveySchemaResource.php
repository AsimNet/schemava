<?php

namespace AsimNet\Schemava\Filament\Resources\SurveySchemas;

use AsimNet\Schemava\Filament\Resources\SurveySchemas\Pages\CreateSurveySchema;
use AsimNet\Schemava\Filament\Resources\SurveySchemas\Pages\EditSurveySchema;
use AsimNet\Schemava\Filament\Resources\SurveySchemas\Pages\ListSurveySchemas;
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
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

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
                TextColumn::make('updated_at')
                    ->label('Last edited')
                    ->dateTime()
                    ->since()
                    ->sortable(),
            ])
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

    public static function getPages(): array
    {
        return [
            'index' => ListSurveySchemas::route('/'),
            'create' => CreateSurveySchema::route('/create'),
            'edit' => EditSurveySchema::route('/{record}/edit'),
        ];
    }
}
