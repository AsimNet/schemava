/**
 * Alpine component for the read-only survey response viewer.
 *
 * Registered globally via FilamentAsset (loaded on every panel page) on purpose:
 * the viewer is shown inside Filament/Livewire MODALS, and inline <script> tags
 * injected into modal content by Livewire do NOT execute. An Alpine component —
 * processed by Alpine whenever the modal DOM appears — is the reliable way to run
 * JS there.
 *
 * It lazily loads the pinned survey-core + survey-js-ui from the CDN (only when a
 * response is actually opened), then renders the stored answers through SurveyJS
 * in display (read-only) mode. The model setup mirrors
 * resources/js/form-builder/survey-runtime.js `createDisplayModel()`
 * (unit-tested in tests/js/form-builder/survey-display.test.js).
 */
document.addEventListener('alpine:init', () => {
    window.Alpine.data('schemavaSurveyResult', (config = {}) => ({
        version: config.version,
        surveyJson: config.surveyJson || {},
        responseData: config.data || {},
        locale: config.locale || config.defaultLocale || 'ar',
        defaultLocale: config.defaultLocale || 'ar',
        state: 'loading',

        async init() {
            try {
                await this.ensureRenderer();
                this.renderSurvey();
            } catch (e) {
                this.state = 'error';
            }
        },

        loadStyle(href) {
            if (document.querySelector('link[data-schemava-href="' + href + '"]')) {
                return;
            }
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.dataset.schemavaHref = href;
            document.head.appendChild(link);
        },

        loadScript(src) {
            return new Promise((resolve, reject) => {
                let el = document.querySelector('script[data-schemava-src="' + src + '"]');
                if (el) {
                    if (el.dataset.loaded === '1') {
                        resolve();
                    } else {
                        el.addEventListener('load', () => resolve());
                        el.addEventListener('error', () => reject(new Error('load failed')));
                    }
                    return;
                }
                el = document.createElement('script');
                el.src = src;
                el.dataset.schemavaSrc = src;
                el.addEventListener('load', () => {
                    el.dataset.loaded = '1';
                    resolve();
                });
                el.addEventListener('error', () => reject(new Error('load failed')));
                document.head.appendChild(el);
            });
        },

        async ensureRenderer() {
            const base = 'https://unpkg.com/survey-core@' + this.version;
            const ui = 'https://unpkg.com/survey-js-ui@' + this.version + '/survey-js-ui.min.js';

            this.loadStyle(base + '/survey-core.min.css');

            // survey-core first; survey.i18n + survey-js-ui augment the global it sets.
            if (!window.Survey || typeof window.Survey.Model !== 'function') {
                await this.loadScript(base + '/survey.core.min.js');
            }
            await this.loadScript(base + '/survey.i18n.min.js');
            if (!window.SurveyUI || typeof window.SurveyUI.renderSurvey !== 'function') {
                await this.loadScript(ui);
            }
        },

        renderSurvey() {
            const Survey = window.Survey;

            if (!Survey || typeof Survey.Model !== 'function') {
                this.state = 'error';
                return;
            }

            // Align survey-core's default locale with the schema's storage default
            // BEFORE building the model so an `en` render reads the explicit `en`
            // slot rather than the Arabic `default` slot.
            if (Survey.surveyLocalization) {
                Survey.surveyLocalization.defaultLocale = this.defaultLocale;
            }

            const survey = new Survey.Model(this.surveyJson);
            survey.locale = this.locale || this.defaultLocale;
            survey.data = (this.responseData && typeof this.responseData === 'object') ? this.responseData : {};
            // Read-only: disable inputs, show stored answers, collapse to one page,
            // and hide navigation/progress chrome.
            survey.mode = 'display';
            survey.questionsOnPageMode = 'singlePage';
            survey.showNavigationButtons = 'none';
            survey.showProgressBar = 'off';

            const mount = this.$refs.mount;

            if (!mount) {
                this.state = 'error';
                return;
            }

            mount.innerHTML = '';

            if (window.SurveyUI && typeof window.SurveyUI.renderSurvey === 'function') {
                window.SurveyUI.renderSurvey(survey, mount);
            } else if (typeof survey.render === 'function') {
                survey.render(mount);
            } else {
                this.state = 'error';
                return;
            }

            this.state = 'ready';
        },
    }));
});
