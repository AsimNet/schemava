<?php

namespace AsimNet\Schemava;

use Composer\InstalledVersions;
use OutOfBoundsException;

/**
 * Package-level helpers for Schemava.
 */
final class Schemava
{
    /**
     * The installed Schemava package version, read from Composer's runtime
     * metadata. Persisted onto every schema as `schemava_version` so the version
     * that produced (or last saved) a schema is always known — future
     * compatibility/migration logic keys off this, never off the SurveyJS
     * renderer version. Falls back to "dev" for path/source installs where no
     * released version is recorded (e.g. while developing the package itself).
     */
    public static function version(): string
    {
        if (! class_exists(InstalledVersions::class)) {
            return 'dev';
        }

        try {
            return InstalledVersions::getPrettyVersion('asimnet/schemava') ?? 'dev';
        } catch (OutOfBoundsException) {
            return 'dev';
        }
    }
}
