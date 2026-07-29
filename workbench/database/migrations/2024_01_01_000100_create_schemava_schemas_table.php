<?php

/*
 * Workbench-only: run the package's publish-first migration stub directly so
 * the standalone workbench (`composer serve`) has the schemava tables without
 * the consumer-app `vendor:publish --tag=schemava-migrations` step.
 */
return require __DIR__.'/../../../database/migrations/create_schemava_schemas_table.php.stub';
