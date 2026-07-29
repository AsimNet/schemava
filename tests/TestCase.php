<?php

namespace AsimNet\Schemava\Tests;

use AsimNet\Schemava\SchemavaPlugin;
use AsimNet\Schemava\SchemavaServiceProvider;
use AsimNet\Schemava\Tests\Fixtures\AdminPanelProvider;
use BladeUI\Heroicons\BladeHeroiconsServiceProvider;
use BladeUI\Icons\BladeIconsServiceProvider;
use Filament\Actions\ActionsServiceProvider;
use Filament\FilamentServiceProvider;
use Filament\Forms\FormsServiceProvider;
use Filament\Infolists\InfolistsServiceProvider;
use Filament\Notifications\NotificationsServiceProvider;
use Filament\Schemas\SchemasServiceProvider;
use Filament\Support\SupportServiceProvider;
use Filament\Tables\TablesServiceProvider;
use Filament\Widgets\WidgetsServiceProvider;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Application;
use Livewire\LivewireServiceProvider;
use Orchestra\Testbench\TestCase as Orchestra;

/**
 * Base test case for the package's PHP suite, booted through Orchestra Testbench
 * with Filament, Livewire and a minimal admin panel that registers the bundled
 * {@see SchemavaPlugin}. The schema/result tables are created
 * in-memory so model-backed tests have a database.
 */
abstract class TestCase extends Orchestra
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->createSchemaTables();
    }

    /**
     * @param  Application  $app
     * @return array<int, class-string>
     */
    protected function getPackageProviders($app): array
    {
        return [
            BladeIconsServiceProvider::class,
            BladeHeroiconsServiceProvider::class,
            LivewireServiceProvider::class,
            SupportServiceProvider::class,
            ActionsServiceProvider::class,
            FormsServiceProvider::class,
            InfolistsServiceProvider::class,
            NotificationsServiceProvider::class,
            SchemasServiceProvider::class,
            TablesServiceProvider::class,
            WidgetsServiceProvider::class,
            FilamentServiceProvider::class,
            SchemavaServiceProvider::class,
            AdminPanelProvider::class,
        ];
    }

    /**
     * @param  Application  $app
     */
    protected function defineEnvironment($app): void
    {
        $app['config']->set('database.default', 'testing');
        $app['config']->set('database.connections.testing', [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => '',
        ]);
        $app['config']->set('app.key', 'base64:'.base64_encode(random_bytes(32)));

        // The submit routes run through `throttle:schemava-submit`, so the rate
        // limiter needs a working cache store. Laravel's default is `database`,
        // whose `cache` table the in-memory test schema does not create — use the
        // array store instead: it lives for the app instance, so repeated calls
        // within one test still accumulate hits and can trip the limit.
        $app['config']->set('cache.default', 'array');
    }

    /**
     * Minimal schema/result tables mirroring the package migration stubs, scoped
     * to the columns the responses viewer touches.
     */
    protected function createSchemaTables(): void
    {
        $schema = $this->app['db']->connection()->getSchemaBuilder();

        $schemasTable = config('schemava.tables.schemas', 'schemava_schemas');
        $resultsTable = config('schemava.tables.results', 'schemava_results');
        $foreignKey = config('schemava.tables.schema_foreign_key', 'schemava_schema_id');

        if (! $schema->hasTable($schemasTable)) {
            $schema->create($schemasTable, function (Blueprint $table): void {
                $table->id();
                $table->string('title')->nullable();
                $table->text('description')->nullable();
                $table->json('survey_json')->nullable();
                $table->boolean('is_active')->default(true);
                $table->unsignedInteger('submission_limit_per_user')->nullable();
                $table->string('hash')->nullable();
                $table->string('schemava_version')->nullable();
                $table->nullableMorphs('surveyable');
                $table->timestamps();
            });
        }

        if (! $schema->hasTable($resultsTable)) {
            $schema->create($resultsTable, function (Blueprint $table) use ($foreignKey): void {
                $table->id();
                $table->foreignId($foreignKey);
                $table->unsignedBigInteger('user_id')->nullable();
                $table->string('submitter_fingerprint', 64)->nullable();
                $table->json('data')->nullable();
                $table->string('status')->nullable();
                $table->timestamp('submitted_at')->nullable();
                $table->nullableMorphs('surveyable');
                $table->timestamps();
            });
        }
    }
}
