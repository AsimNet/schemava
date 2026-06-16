<?php

namespace AsimNet\Schemava\Filament\Resources\SurveySchemas\Pages;

use AsimNet\Schemava\Filament\Resources\SurveySchemas\SurveySchemaResource;
use Filament\Actions\Action;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;
use Filament\Support\Icons\Heroicon;

class EditSurveySchema extends EditRecord
{
    protected static string $resource = SurveySchemaResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Action::make('design')
                ->label('Open visual builder')
                ->icon(Heroicon::OutlinedPencilSquare)
                ->url(fn (): string => route('survey-designer.show', ['surveySchema' => $this->record->getKey()])),
            DeleteAction::make(),
        ];
    }
}
