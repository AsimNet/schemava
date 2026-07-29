<?php

namespace AsimNet\Schemava\Filament\Resources\SurveySchemas\Pages;

use AsimNet\Schemava\Contracts\SurveyUrlResolver;
use AsimNet\Schemava\Filament\Resources\SurveySchemas\SurveySchemaResource;
use AsimNet\Schemava\Models\SurveySchema;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Facades\Filament;
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
                // `panel` carries the originating panel into the panel-agnostic
                // designer route — see SurveyDesignerController.
                ->url(fn (): string => route('survey-designer.show', [
                    'surveySchema' => $this->record->getKey(),
                    'panel' => Filament::getCurrentPanel()?->getId(),
                ])),
            Action::make('publicForm')
                ->label('Open public form')
                ->icon(Heroicon::OutlinedLink)
                ->color('gray')
                ->url(fn (): ?string => $this->publicUrl() ?: null)
                // No public form exposed (the resolver returned '') → no action.
                ->visible(fn (): bool => $this->publicUrl() !== '')
                ->openUrlInNewTab(),
            EditAction::make(),
        ];
    }

    protected function publicUrl(): string
    {
        $record = $this->record;

        return $record instanceof SurveySchema
            ? app(SurveyUrlResolver::class)->publicUrl($record)
            : '';
    }
}
