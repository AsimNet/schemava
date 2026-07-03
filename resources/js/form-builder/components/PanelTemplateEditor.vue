<script setup>
import { computed } from 'vue';
import draggable from 'vuedraggable';
import {
    store,
    addTemplateField,
    removeTemplateField,
    updateTemplateField,
    setTemplateFieldChoices,
    reorderTemplateFields,
} from '../store.js';
import { t, i18n } from '../i18n.js';
import { FIELD_TYPES } from '../model/fieldTypes.js';
import AddQuestionMenu from './AddQuestionMenu.vue';
import ChoicesEditor from './ChoicesEditor.vue';

const props = defineProps({
    /** The panel_dynamic field being authored (its `typeProps.templateElements` is the panel template). */
    field: { type: Object, required: true },
});

const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');
const uiLocale = computed(() => i18n.locale);

const templateElements = computed(() => props.field.typeProps?.templateElements ?? []);

/** Repeating panels within a repeating panel is not supported by this editor. */
const EXCLUDED_SUB_TYPES = ['panel_dynamic'];

function typeDef(sub) {
    return FIELD_TYPES[sub.type] ?? null;
}

function typeLabel(sub) {
    const def = typeDef(sub);

    return def?.label?.[uiLocale.value] ?? def?.label?.ar ?? sub.type;
}

function labelValue(sub) {
    const lstr = sub.label;
    if (!lstr) {
        return '';
    }

    return (contentLocale.value === 'en' ? lstr.en : lstr.ar) ?? '';
}

function onLabelInput(sub, value) {
    const lstr = sub.label ? { ...sub.label } : { ar: '', en: null };
    if (contentLocale.value === 'en') {
        lstr.en = value === '' ? null : value;
    } else {
        lstr.ar = value;
    }
    updateTemplateField(props.field.name, sub.name, { label: lstr });
}

function onRequiredChange(sub, checked) {
    updateTemplateField(props.field.name, sub.name, { required: checked });
}

function onChoicesChange(sub, next) {
    setTemplateFieldChoices(props.field.name, sub.name, next);
}

function onAdd(typeId) {
    addTemplateField(props.field.name, typeId);
}

function onRemove(sub) {
    removeTemplateField(props.field.name, sub.name);
}

function onReorder() {
    // vuedraggable mutates the bound array in place; persist via
    // reorderTemplateFields so the store's dirty flag stays honest.
    reorderTemplateFields(props.field.name, [...templateElements.value]);
}
</script>

<template>
    <div class="fb-panel-template">
        <span class="fb-field-label">{{ t('panelTemplateLabel') }}</span>
        <p class="fb-hint">{{ t('panelTemplateHint') }}</p>

        <p v-if="templateElements.length === 0" class="fb-panel-template-empty">
            {{ t('panelTemplateEmpty') }}
        </p>

        <draggable
            v-else
            :list="templateElements"
            item-key="name"
            handle=".fb-panel-row-handle"
            class="fb-panel-row-list"
            ghost-class="fb-ghost"
            :animation="150"
            @end="onReorder"
        >
            <template #item="{ element: sub }">
                <div class="fb-panel-row">
                    <div class="fb-panel-row-head">
                        <button
                            type="button"
                            class="fb-panel-row-handle"
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
                        <span class="fb-panel-row-type">{{ typeLabel(sub) }}</span>
                        <label class="fb-panel-row-required">
                            <input
                                type="checkbox"
                                class="fb-checkbox"
                                :checked="sub.required"
                                @change="onRequiredChange(sub, $event.target.checked)"
                            />
                            <span>{{ t('required') }}</span>
                        </label>
                        <button
                            type="button"
                            class="fb-panel-row-remove fb-focus"
                            :title="t('removeTemplateQuestion')"
                            :aria-label="t('removeTemplateQuestion')"
                            @click="onRemove(sub)"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <input
                        :value="labelValue(sub)"
                        type="text"
                        class="fb-input fb-focus"
                        :placeholder="t('fieldLabelPlaceholder')"
                        :aria-label="t('labelField')"
                        @input="onLabelInput(sub, $event.target.value)"
                    />

                    <ChoicesEditor
                        v-if="typeDef(sub)?.hasChoices"
                        :field="sub"
                        :on-change="(next) => onChoicesChange(sub, next)"
                    />
                </div>
            </template>
        </draggable>

        <div class="fb-panel-template-add">
            <AddQuestionMenu :exclude-types="EXCLUDED_SUB_TYPES" @select="onAdd" />
        </div>
    </div>
</template>

<style scoped>
.fb-panel-template {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.fb-panel-template-empty {
    font-size: 0.75rem;
    color: var(--fb-text-muted);
    background: var(--fb-canvas);
    border: 1px dashed var(--fb-border-strong);
    border-radius: 0.5rem;
    padding: 0.625rem 0.75rem;
    margin: 0;
    text-align: center;
}

.fb-panel-row-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.fb-panel-row {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    border: 1px solid var(--fb-border);
    border-radius: 0.5rem;
    background: var(--fb-canvas);
    padding: 0.5rem;
}

.fb-panel-row-head {
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

.fb-panel-row-handle {
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

.fb-panel-row-handle:hover {
    color: var(--fb-text-muted);
}

.fb-panel-row-handle:active {
    cursor: grabbing;
}

.fb-panel-row-handle svg {
    width: 0.9375rem;
    height: 0.9375rem;
}

.fb-panel-row-type {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--fb-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.fb-panel-row-required {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    cursor: pointer;
    white-space: nowrap;
}

.fb-panel-row-remove {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

.fb-panel-row-remove:hover {
    background: #fef2f2;
    color: #dc2626;
}

.fb-panel-row-remove svg {
    width: 0.8125rem;
    height: 0.8125rem;
}

.fb-panel-template-add {
    display: flex;
    margin-top: 0.125rem;
}
</style>
