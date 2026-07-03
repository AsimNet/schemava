/**
 * Alpine component for the read-only survey response viewer.
 *
 * Registered globally via FilamentAsset (loaded on every panel page) on purpose:
 * the viewer is shown inside Filament/Livewire MODALS, and inline <script> tags
 * injected into modal content by Livewire do NOT execute. An Alpine component —
 * processed by Alpine whenever the modal DOM appears — is the reliable way to run
 * JS there.
 *
 * It lazily loads the SELF-HOSTED survey-core + survey-js-ui bundles (published
 * package assets — CDN tags break behind TLS-inspection proxies) only when a
 * response is actually opened, then renders the stored answers through SurveyJS
 * in display (read-only) mode. The model setup mirrors
 * resources/js/form-builder/survey-runtime.js `createDisplayModel()`
 * (unit-tested in tests/js/form-builder/survey-display.test.js).
 */
document.addEventListener('alpine:init', () => {
    window.Alpine.data('schemavaSurveyResult', (config = {}) => ({
        urls: config.urls || {},
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
            this.loadStyle(this.urls.css);

            // survey-core first; survey.i18n + survey-js-ui augment the global it sets.
            if (!window.Survey || typeof window.Survey.Model !== 'function') {
                await this.loadScript(this.urls.core);
            }
            await this.loadScript(this.urls.i18n);
            if (!window.SurveyUI || typeof window.SurveyUI.renderSurvey !== 'function') {
                await this.loadScript(this.urls.ui);
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

            // Grade-at-a-glance for scored questions (ADMIN-only view — the
            // schema served here still carries correctAnswer; respondent
            // payloads have it stripped). survey-core's isAnswerCorrect()
            // compares the stored answer against the key; we badge each
            // graded question's title with ✓/✗ and the earned points.
            const badgeText = this.locale === 'ar'
                ? { correct: 'إجابة صحيحة', incorrect: 'إجابة خاطئة', points: 'نقطة' }
                : { correct: 'Correct', incorrect: 'Incorrect', points: 'pts' };
            survey.onAfterRenderQuestion.add((sender, options) => {
                const question = options.question;
                if (!question || question.correctAnswer === undefined || question.correctAnswer === null) {
                    return;
                }
                const header = options.htmlElement.querySelector('h5') || options.htmlElement;
                if (header.querySelector('.schemava-grade-badge')) {
                    return;
                }
                let correct = false;
                try {
                    correct = typeof question.isAnswerCorrect === 'function' && question.isAnswerCorrect();
                } catch (e) {
                    correct = false;
                }
                const points = Number(question.score ?? question.jsonObj?.score ?? 1) || 1;
                const badge = document.createElement('span');
                badge.className = 'schemava-grade-badge ' + (correct ? 'schemava-grade-badge--correct' : 'schemava-grade-badge--incorrect');
                badge.textContent = (correct ? '✓ ' + badgeText.correct + ' +' + points + ' ' + badgeText.points : '✗ ' + badgeText.incorrect);
                header.appendChild(badge);
            });

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
