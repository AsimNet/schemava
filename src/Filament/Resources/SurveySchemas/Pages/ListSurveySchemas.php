<?php

namespace AsimNet\Schemava\Filament\Resources\SurveySchemas\Pages;

use AsimNet\Schemava\Filament\Resources\SurveySchemas\SurveySchemaResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListSurveySchemas extends ListRecords
{
    protected static string $resource = SurveySchemaResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make()->label('New form'),
        ];
    }
}
