<?php

namespace AsimNet\Schemava\Filament\Resources\SurveySchemas\Pages;

use AsimNet\Schemava\Contracts\SurveyUrlResolver;
use AsimNet\Schemava\Filament\Resources\SurveySchemas\SurveySchemaResource;
use AsimNet\Schemava\Models\SurveySchema;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Resources\Pages\ViewRecord;
use Filament\Support\Icons\Heroicon;

/**
 * Read-only overview of a form: its details plus the Responses relation manager.
 * The default landing when a form is opened (the table links rows here), so
 * editing the form/builder is a deliberate action rather than the default.
 */
class ViewSurveySchema extends ViewRecord
{
    protected static string $resource = SurveySchemaResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Action::make('design')
                ->label('Open visual builder')
                ->icon(Heroicon::OutlinedPencilSquare)
                ->color('primary')
                ->url(fn (): string => route('survey-designer.show', ['surveySchema' => $this->record->getKey()])),
            Action::make('publicForm')
                ->label('Open public form')
                ->icon(Heroicon::OutlinedLink)
                ->color('gray')
                ->url(function (): ?string {
                    $record = $this->record;

                    return $record instanceof SurveySchema
                        ? app(SurveyUrlResolver::class)->publicUrl($record)
                        : null;
                })
                ->openUrlInNewTab(),
            EditAction::make(),
        ];
    }
}
