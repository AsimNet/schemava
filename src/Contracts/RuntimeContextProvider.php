<?php

namespace AsimNet\Schemava\Contracts;

/**
 * Supplies the runtime "piping" context a host application exposes to surveys —
 * the variables a respondent's answers can reference (e.g. the current user's
 * name, gender, membership). The package itself is identity-agnostic; the host
 * app binds an implementation that knows about its own user/domain model.
 */
interface RuntimeContextProvider
{
    /**
     * Dotted keys exposed to the builder and injected as SurveyJS calculated
     * values at render time (e.g. ['full_name', 'gender', 'membership.package.slug']).
     *
     * @return list<string>
     */
    public function keys(): array;

    /**
     * Resolve the concrete runtime values for a subject (typically the
     * authenticated user). Keys should match {@see keys()}.
     *
     * @return array<string, mixed>
     */
    public function values(mixed $subject): array;

    /**
     * Typed metadata per key for the builder's logic/piping UI. Each entry is
     * ['kind' => 'enum'|'boolean'|'date'|'number', 'options' => [['value' => ..., 'label' => ...]]].
     *
     * @return array<string, array<string, mixed>>
     */
    public function variableMeta(): array;
}
