import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    // Needed so component tests can import .vue SFCs. The pure-logic suites are
    // unaffected by it.
    plugins: [vue()],
    test: {
        // `node` stays the default because it is faster and most suites here are
        // pure functions. Component tests opt into jsdom per file with a
        // `// @vitest-environment jsdom` docblock — see
        // tests/js/form-builder/choices-editor.test.js.
        environment: 'node',
        include: ['tests/js/**/*.test.js'],
    },
});
