<script setup>
import { computed, reactive, ref } from 'vue';
import draggable from 'vuedraggable';
import { t } from '../i18n.js';
import { store, setChoices, pushToast } from '../store.js';
import {
    makeChoice,
    renameChoiceLabel,
    splitBulkLines,
    choiceValueDiverged,
} from '../ui-helpers.js';

const props = defineProps({
    field: { type: Object, required: true },
    /**
     * Per-choice image upload (imagepicker): shows an image thumbnail + upload
     * control on each row, reusing the same upload endpoint as the `image`
     * field type. The image link is stored as `choice.raw.imageLink`, which the
     * serializer already round-trips verbatim (an unknown choice-item prop).
     */
    withImages: { type: Boolean, default: false },
});

const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');

const choices = computed(() => props.field.choices ?? []);

const draftInput = ref('');

/* ------------------------------------------------ per-choice image upload */

const imageInputs = ref([]);
const uploadingIndex = reactive({});
const errorIndex = reactive({});

function setImageInputRef(el, index) {
    if (el) {
        imageInputs.value[index] = el;
    }
}

function choiceImageLink(choice) {
    return choice.raw?.imageLink ?? null;
}

function triggerImageUpload(index) {
    imageInputs.value[index]?.click();
}

async function onImageSelected(event, index) {
    const file = event.target?.files?.[0];
    if (!file) {
        return;
    }
    errorIndex[index] = false;
    uploadingIndex[index] = true;

    const csrf = store.boot?.csrf ?? '';
    const url = store.boot?.routes?.uploadImage ?? '';

    const form = new FormData();
    form.append('files[]', file);
    form.append('_token', csrf);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': csrf,
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            body: form,
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.status === 'success' && typeof data.url === 'string' && data.url.trim() !== '') {
            const next = [...choices.value];
            next[index] = { ...next[index], raw: { ...(next[index].raw ?? {}), imageLink: data.url } };
            setChoices(props.field.name, next);
        } else {
            throw new Error(data.message || `HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('[form-builder] choice image upload failed', error);
        errorIndex[index] = true;
        pushToast(t('imageUploadFailed'), 'error');
    } finally {
        uploadingIndex[index] = false;
        if (event.target) {
            event.target.value = '';
        }
    }
}

function removeChoiceImage(index) {
    const next = [...choices.value];
    const raw = { ...(next[index].raw ?? {}) };
    delete raw.imageLink;
    next[index] = { ...next[index], raw };
    setChoices(props.field.name, next);
}

function labelText(choice) {
    const lstr = choice.label ?? { ar: '', en: null };

    return (contentLocale.value === 'en' ? lstr.en : lstr.ar) ?? '';
}

function isMissingTranslation(choice) {
    const lstr = choice.label ?? { ar: '', en: null };

    return (lstr.ar ?? '').trim() !== '' && (lstr.en ?? '').trim() === '';
}

function onLabelInput(index, value) {
    const next = [...choices.value];
    next[index] = renameChoiceLabel(next[index], contentLocale.value, value);
    setChoices(props.field.name, next);
}

function removeChoice(index) {
    const next = choices.value.filter((_, i) => i !== index);
    setChoices(props.field.name, next);
}

function addFromDraft() {
    const lines = splitBulkLines(draftInput.value);
    if (lines.length === 0) {
        return;
    }
    const next = [...choices.value, ...lines.map((line) => makeChoice(line))];
    setChoices(props.field.name, next);
    draftInput.value = '';
}

function onDraftPaste(event) {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!/\r?\n/.test(text)) {
        return; // single line — let the normal input flow handle it
    }
    event.preventDefault();
    const lines = splitBulkLines(text);
    if (lines.length === 0) {
        return;
    }
    const next = [...choices.value, ...lines.map((line) => makeChoice(line))];
    setChoices(props.field.name, next);
    draftInput.value = '';
}

function onReorder() {
    // vuedraggable mutates field.choices in place; persist via setChoices to
    // keep the dirty flag honest.
    setChoices(props.field.name, [...choices.value]);
}

function diverged(choice) {
    return choiceValueDiverged(choice);
}
</script>

<template>
    <div class="fb-choices">
        <span class="fb-field-label">{{ t('choicesLabel') }}</span>

        <p v-if="choices.length === 0" class="fb-choices-empty">{{ t('emptyChoices') }}</p>

        <draggable
            v-else
            :list="props.field.choices"
            item-key="_uid"
            handle=".fb-choice-handle"
            class="fb-choice-list"
            ghost-class="fb-ghost"
            :animation="150"
            @end="onReorder"
        >
            <template #item="{ element, index }">
                <div class="fb-choice-row">
                    <button
                        type="button"
                        class="fb-choice-handle"
                        :title="t('dragHandle')"
                        :aria-label="t('dragHandle')"
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <circle cx="9" cy="6" r="1.6" />
                            <circle cx="15" cy="6" r="1.6" />
                            <circle cx="9" cy="12" r="1.6" />
                            <circle cx="15" cy="12" r="1.6" />
                            <circle cx="9" cy="18" r="1.6" />
                            <circle cx="15" cy="18" r="1.6" />
                        </svg>
                    </button>

                    <div v-if="withImages" class="fb-choice-image">
                        <img v-if="choiceImageLink(element)" :src="choiceImageLink(element)" :alt="t('imagePreviewAlt')" />
                        <button
                            type="button"
                            class="fb-choice-image-btn fb-focus"
                            :disabled="uploadingIndex[index]"
                            :title="choiceImageLink(element) ? t('imageReplace') : t('imageUploadButton')"
                            @click="triggerImageUpload(index)"
                        >
                            <span v-if="uploadingIndex[index]" class="fb-spinner-sm" aria-hidden="true"></span>
                            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                            </svg>
                        </button>
                        <button
                            v-if="choiceImageLink(element) && !uploadingIndex[index]"
                            type="button"
                            class="fb-choice-image-remove fb-focus"
                            :title="t('imageRemove')"
                            :aria-label="t('imageRemove')"
                            @click="removeChoiceImage(index)"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        <input
                            :ref="(el) => setImageInputRef(el, index)"
                            type="file"
                            accept="image/*"
                            class="fb-hidden-file"
                            @change="onImageSelected($event, index)"
                        />
                    </div>

                    <div class="fb-choice-main">
                        <input
                            :value="labelText(element)"
                            type="text"
                            class="fb-input fb-focus fb-choice-input"
                            @input="onLabelInput(index, $event.target.value)"
                        />
                        <span
                            v-if="diverged(element)"
                            class="fb-choice-value"
                            :title="t('choiceValueHint') + ' ' + element.value"
                            dir="ltr"
                        >{{ element.value }}</span>
                    </div>

                    <span
                        v-if="isMissingTranslation(element)"
                        class="fb-choice-missing"
                        :title="t('missingTranslation')"
                        :aria-label="t('missingTranslation')"
                    ></span>

                    <button
                        type="button"
                        class="fb-choice-remove fb-focus"
                        :title="t('removeChoice')"
                        :aria-label="t('removeChoice')"
                        @click="removeChoice(index)"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </template>
        </draggable>

        <div class="fb-choice-add">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" class="fb-choice-add-icon">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <input
                v-model="draftInput"
                type="text"
                class="fb-input fb-focus fb-choice-add-input"
                :placeholder="t('addChoicePlaceholder')"
                @keydown.enter.prevent="addFromDraft"
                @paste="onDraftPaste"
            />
        </div>
        <p class="fb-hint">{{ t('bulkPasteHint') }}</p>
    </div>
</template>

<style scoped>
.fb-choices {
    display: flex;
    flex-direction: column;
    gap: 0.4375rem;
}

.fb-field-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--fb-text);
}

.fb-choices-empty {
    font-size: 0.75rem;
    color: var(--fb-text-muted);
    margin: 0.25rem 0;
}

.fb-choice-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.fb-choice-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

.fb-choice-handle {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.125rem;
    height: 1.5rem;
    border: none;
    background: transparent;
    color: #c4c7cd;
    cursor: grab;
    padding: 0;
}

.fb-choice-handle:hover {
    color: var(--fb-text-muted);
}

.fb-choice-handle:active {
    cursor: grabbing;
}

.fb-choice-handle svg {
    width: 0.9375rem;
    height: 0.9375rem;
}

.fb-choice-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

.fb-input {
    width: 100%;
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.375rem 0.5625rem;
    font-size: 0.8125rem;
    color: var(--fb-text);
    background: var(--fb-surface);
    font-family: inherit;
}

.fb-choice-input {
    flex: 1 1 auto;
    min-width: 0;
}

.fb-choice-value {
    flex: 0 0 auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.625rem;
    color: var(--fb-text-muted);
    background: var(--fb-canvas);
    border: 1px solid var(--fb-border);
    padding: 0.0625rem 0.25rem;
    border-radius: 0.25rem;
    max-width: 6rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.fb-choice-missing {
    flex: 0 0 auto;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 9999px;
    background: #f59e0b;
}

.fb-choice-remove {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.625rem;
    height: 1.625rem;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    border-radius: 0.4375rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

.fb-choice-remove:hover {
    background: #fef2f2;
    color: #dc2626;
}

.fb-choice-remove svg {
    width: 0.875rem;
    height: 0.875rem;
}

.fb-choice-image {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
}

.fb-choice-image img {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 0.375rem;
    object-fit: cover;
    border: 1px solid var(--fb-border);
}

.fb-choice-image-btn {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 1px dashed var(--fb-border-strong);
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    border-radius: 0.375rem;
    cursor: pointer;
    padding: 0;
    transition: border-color 0.15s, color 0.15s;
}

.fb-choice-image-btn:hover:not(:disabled) {
    border-color: var(--fb-brand);
    color: var(--fb-brand-600);
}

.fb-choice-image-btn svg {
    width: 0.9375rem;
    height: 0.9375rem;
}

.fb-choice-image-remove {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.375rem;
    height: 1.375rem;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    border-radius: 0.375rem;
    cursor: pointer;
}

.fb-choice-image-remove:hover {
    background: #fef2f2;
    color: #dc2626;
}

.fb-choice-image-remove svg {
    width: 0.75rem;
    height: 0.75rem;
}

.fb-hidden-file {
    display: none;
}

.fb-spinner-sm {
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid var(--fb-border-strong);
    border-top-color: var(--fb-brand);
    border-radius: 9999px;
    animation: fb-spin 0.6s linear infinite;
}

@keyframes fb-spin {
    to {
        transform: rotate(360deg);
    }
}

.fb-choice-add {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.125rem;
}

.fb-choice-add-icon {
    flex: 0 0 auto;
    width: 0.9375rem;
    height: 0.9375rem;
    color: var(--fb-text-muted);
    margin-inline-start: 0.0625rem;
}

.fb-choice-add-input {
    flex: 1 1 auto;
    min-width: 0;
}

.fb-hint {
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    margin: 0;
    line-height: 1.4;
}
</style>
