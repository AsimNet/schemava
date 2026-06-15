<?php

namespace Asimnet\FilamentSurveyjs\Support;

use Asimnet\FilamentSurveyjs\Contracts\RuntimeContextProvider;

/**
 * No-op runtime context: surveys build and render with no host-supplied piping
 * variables. Host apps bind their own provider to expose user/domain context.
 */
class DefaultRuntimeContextProvider implements RuntimeContextProvider
{
    public function keys(): array
    {
        return [];
    }

    public function values(mixed $subject): array
    {
        return [];
    }

    public function variableMeta(): array
    {
        return [];
    }
}
