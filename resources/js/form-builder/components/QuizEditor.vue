<script setup>
import { computed } from 'vue';
import { t } from '../i18n.js';
import { store, setQuiz } from '../store.js';

const props = defineProps({
    field: { type: Object, required: true },
});

const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');

const enabled = computed({
    get: () => Boolean(props.field.quiz),
    set(value) {
        if (value) {
            setQuiz(props.field.name, { correct: defaultCorrect(), score: 1 });
        } else {
            setQuiz(props.field.name, null);
        }
    },
});

/** Sensible empty "correct" value for the field type. */
function defaultCorrect() {
    if (props.field.type === 'multi_choice') {
        return [];
    }

    return '';
}

const score = computed({
    get: () => {
        const value = Number(props.field.quiz?.score);

        return Number.isFinite(value) ? value : 1;
    },
    set(value) {
        const num = Number(value);
        patch({ score: Number.isFinite(num) && num >= 0 ? num : 1 });
    },
});

const correct = computed(() => props.field.quiz?.correct ?? defaultCorrect());

const choicesQuizMode = computed(() => {
    if (props.field.type === 'multi_choice') {
        return 'checkbox';
    }
    if (props.field.type === 'single_choice' || props.field.type === 'dropdown') {
        return 'radio';
    }

    return null;
});

const choiceItems = computed(() => {
    if (!Array.isArray(props.field.choices)) {
        return [];
    }

    return props.field.choices.map((choice, index) => ({
        // Stable per-row key so blank choices (value === '') don't collide.
        uid: choice._uid ?? `idx_${index}`,
        value: choice.value,
        label: (contentLocale.value === 'en' ? choice.label?.en : choice.label?.ar) ?? choice.label?.ar ?? String(choice.value),
    }));
});

function isChoiceCorrect(value) {
    if (choicesQuizMode.value === 'checkbox') {
        return Array.isArray(correct.value) && correct.value.includes(value);
    }

    return correct.value === value;
}

function patch(partial) {
    const base = {
        correct: props.field.quiz?.correct ?? defaultCorrect(),
        score: Number.isFinite(Number(props.field.quiz?.score)) ? Number(props.field.quiz.score) : 1,
    };
    setQuiz(props.field.name, { ...base, ...partial });
}

/** Radio (single/dropdown): set the single correct value. */
function setSingleCorrect(value) {
    patch({ correct: value });
}

/** Checkbox (multi): toggle a value in the correct array. */
function toggleMultiCorrect(value) {
    const current = Array.isArray(correct.value) ? correct.value : [];
    const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
    patch({ correct: next });
}

function onChoiceToggle(value) {
    if (choicesQuizMode.value === 'checkbox') {
        toggleMultiCorrect(value);
    } else {
        setSingleCorrect(value);
    }
}

/* yes_no */
const boolCorrect = computed(() => correct.value === true || correct.value === 'true');

function setBool(value) {
    patch({ correct: value });
}

/* short_text */
const textCorrect = computed({
    get: () => (typeof correct.value === 'string' ? correct.value : ''),
    set: (value) => patch({ correct: value }),
});

const hasChoices = computed(() => Array.isArray(props.field.choices) && props.field.choices.length > 0);
</script>

<template>
    <div class="fb-quiz">
        <label class="fb-toggle">
            <input v-model="enabled" type="checkbox" class="fb-checkbox" />
            <span>{{ t('quizToggle') }}</span>
        </label>
        <p class="fb-hint">{{ t('quizToggleHint') }}</p>

        <template v-if="enabled">
            <!-- Choice-based: pick the correct answer(s). Choices are edited in Options. -->
            <template v-if="choicesQuizMode">
                <span class="fb-field-label">{{ t('quizCorrectAnswer') }}</span>
                <p v-if="!hasChoices" class="fb-hint">{{ t('quizNoChoices') }}</p>
                <ul v-else class="fb-quiz-choices">
                    <li v-for="choice in choiceItems" :key="choice.uid">
                        <label class="fb-quiz-choice">
                            <input
                                :type="choicesQuizMode === 'checkbox' ? 'checkbox' : 'radio'"
                                class="fb-checkbox"
                                :checked="isChoiceCorrect(choice.value)"
                                @change="onChoiceToggle(choice.value)"
                            />
                            <span>{{ choice.label }}</span>
                        </label>
                    </li>
                </ul>
                <p class="fb-hint">{{ t('quizCorrectHint') }}</p>
            </template>

            <!-- yes/no -->
            <template v-else-if="field.type === 'yes_no'">
                <span class="fb-field-label">{{ t('quizCorrectAnswer') }}</span>
                <div class="fb-segment-inline">
                    <button
                        type="button"
                        class="fb-seg-btn"
                        :class="{ 'fb-seg-btn--active': boolCorrect }"
                        @click="setBool(true)"
                    >{{ t('logicTrue') }}</button>
                    <button
                        type="button"
                        class="fb-seg-btn"
                        :class="{ 'fb-seg-btn--active': correct === false }"
                        @click="setBool(false)"
                    >{{ t('logicFalse') }}</button>
                </div>
            </template>

            <!-- short_text -->
            <template v-else>
                <label class="fb-field">
                    <span class="fb-field-label">{{ t('quizCorrectAnswer') }}</span>
                    <input
                        v-model="textCorrect"
                        type="text"
                        class="fb-input fb-focus"
                        :placeholder="t('quizExpectedPlaceholder')"
                    />
                </label>
            </template>

            <label class="fb-field fb-quiz-points">
                <span class="fb-field-label">{{ t('quizPoints') }}</span>
                <input
                    v-model.number="score"
                    type="number"
                    min="0"
                    step="0.5"
                    class="fb-input fb-focus"
                />
            </label>
        </template>
    </div>
</template>

<style scoped>
.fb-quiz {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
}

.fb-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--fb-text);
    cursor: pointer;
}

.fb-checkbox {
    width: 1rem;
    height: 1rem;
    accent-color: var(--fb-brand);
    cursor: pointer;
}

.fb-field {
    display: flex;
    flex-direction: column;
    gap: 0.3125rem;
}

.fb-field-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--fb-text);
}

.fb-input {
    width: 100%;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.4375rem 0.625rem;
    font-size: 0.8125rem;
    color: var(--fb-text);
    background: var(--fb-surface);
    font-family: inherit;
}

.fb-quiz-points {
    max-width: 8rem;
}

.fb-quiz-choices {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3125rem;
}

.fb-quiz-choice {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--fb-text);
    cursor: pointer;
}

.fb-segment-inline {
    display: inline-flex;
    align-self: flex-start;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    overflow: hidden;
}

.fb-seg-btn {
    border: none;
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.3125rem 0.75rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

.fb-seg-btn--active {
    background: var(--fb-brand);
    color: #fff;
}

.fb-hint {
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    margin: 0;
    line-height: 1.4;
}
</style>
