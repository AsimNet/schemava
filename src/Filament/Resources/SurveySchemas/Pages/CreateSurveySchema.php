<?php

namespace AsimNet\Schemava\Filament\Resources\SurveySchemas\Pages;

use AsimNet\Schemava\Filament\Resources\SurveySchemas\SurveySchemaResource;
use Filament\Resources\Pages\CreateRecord;

class CreateSurveySchema extends CreateRecord
{
    protected static string $resource = SurveySchemaResource::class;

    /**
     * Drop the user straight into the visual builder after creating the form.
     */
    protected function getRedirectUrl(): string
    {
        return route('survey-designer.show', ['surveySchema' => $this->record->getKey()]);
    }
}
