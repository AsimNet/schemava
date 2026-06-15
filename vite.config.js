import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

/**
 * Self-contained build for the SurveyJS form builder. Produces a single
 * self-booting IIFE bundle plus one stylesheet in `resources/dist/`, which are
 * registered with Filament's asset manager and copied to /public by
 * `php artisan filament:assets`. survey-core/survey-js-ui are loaded separately
 * from a CDN by the host blade (the renderer), so they are NOT bundled here.
 */
export default defineConfig({
    // Library builds don't replace process.env.NODE_ENV, so bundled Vue would
    // reference `process` (undefined in the browser). Define it for a production
    // browser bundle.
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
    plugins: [
        vue(),
        tailwindcss(),
    ],
    build: {
        outDir: 'resources/dist',
        emptyOutDir: true,
        cssCodeSplit: false,
        lib: {
            entry: fileURLToPath(new URL('resources/js/form-builder/main.js', import.meta.url)),
            name: 'FilamentSurveyjsBuilder',
            formats: ['iife'],
            fileName: () => 'filament-surveyjs-builder.js',
        },
        rollupOptions: {
            output: {
                assetFileNames: 'filament-surveyjs-builder.[ext]',
            },
        },
    },
});
