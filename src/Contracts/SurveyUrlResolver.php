<?php

namespace Asimnet\FilamentSurveyjs\Contracts;

use Asimnet\FilamentSurveyjs\Models\SurveySchema;

/**
 * Resolves the public, shareable URL where respondents fill out a survey. Host
 * apps that serve forms from a custom domain/route bind their own resolver.
 */
interface SurveyUrlResolver
{
    public function publicUrl(SurveySchema $schema): string;

    /**
     * The admin/return URL the builder's "back" control navigates to (e.g. the
     * schema's admin view page), or null when there is none.
     */
    public function adminUrl(SurveySchema $schema): ?string;
}
