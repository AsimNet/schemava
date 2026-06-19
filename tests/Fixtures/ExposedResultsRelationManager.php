<?php

namespace AsimNet\Schemava\Tests\Fixtures;

use AsimNet\Schemava\Filament\Resources\SurveySchemas\RelationManagers\ResultsRelationManager;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Model;

/**
 * Test-only subclass that exposes the relation manager's protected resolution
 * helpers so they can be asserted directly, without a full Livewire render.
 */
class ExposedResultsRelationManager extends ResultsRelationManager
{
    public function exposedRespondent(Model $record): string
    {
        return $this->resolveRespondent($record);
    }

    public function exposedScore(Model $record): ?string
    {
        return $this->resolveScore($record);
    }

    public function exposedOwnerSchemaIsScored(): bool
    {
        return $this->ownerSchemaIsScored();
    }

    public function exposedRenderSubmission(Model $record): View
    {
        return $this->renderSubmission($record);
    }
}
