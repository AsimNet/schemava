/**
 * Form builder entry point. Reads the boot payload (JSON `<script>` tag written
 * by the blade, with a `window.__FORM_BUILDER__` fallback), hydrates the store
 * and mounts the Vue app into `#form-builder-app`.
 */

import { createApp } from 'vue';
import App from './App.vue';
import { loadFromBoot } from './store.js';
import { setLocale, bootstrapDirection } from './i18n.js';
import './styles.css';

function readBootPayload() {
    const el = document.getElementById('form-builder-boot');
    if (el?.textContent) {
        try {
            return JSON.parse(el.textContent);
        } catch (error) {
            console.error('[form-builder] failed to parse boot payload', error);
        }
    }

    return window.__FORM_BUILDER__ ?? {};
}

const boot = readBootPayload();

loadFromBoot(boot);
// Config-provided default UI language — only until the author explicitly picks
// one in the designer (that stored choice wins on later visits).
if (!window.localStorage?.getItem('formBuilderLocale') && (boot.uiLocale === 'ar' || boot.uiLocale === 'en')) {
    setLocale(boot.uiLocale);
}
bootstrapDirection();

const app = createApp(App, { boot });
app.config.globalProperties.$boot = boot;
app.mount('#form-builder-app');

// Expose for debugging in non-production environments.
if (typeof window !== 'undefined') {
    window.__FORM_BUILDER_BOOT__ = boot;
}

// `setLocale` referenced to keep the persisted UI direction authoritative.
void setLocale;
