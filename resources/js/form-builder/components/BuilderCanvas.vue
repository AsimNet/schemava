<script setup>
import { computed } from 'vue';
import draggable from 'vuedraggable';
import {
    store,
    addField,
    addQuestionToPage,
    removePage,
    addPage,
    movePage,
    setPageTitle,
    setPageDescription,
    markDirty,
} from '../store.js';
import { t } from '../i18n.js';
import { emptyLStr } from '../model/localized.js';
import { ref } from 'vue';
import FieldCard from './FieldCard.vue';
import PageLogicEditor from './PageLogicEditor.vue';
import AddQuestionMenu from './AddQuestionMenu.vue';

const pages = computed(() => store.state?.pages ?? []);

/** Which page's logic panel is expanded (index), or null. */
const openLogicPage = ref(null);

function togglePageLogic(pageIndex) {
    openLogicPage.value = openLogicPage.value === pageIndex ? null : pageIndex;
}

function pageHasLogic(page) {
    return Boolean(page.logic && (page.logic.advanced || (page.logic.rules ?? []).some((r) => r?.field)));
}
const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');
const multiPage = computed(() => pages.value.length > 1);

function pageTitleValue(page) {
    if (!page.title) {
        return '';
    }

    return (contentLocale.value === 'en' ? page.title.en : page.title.ar) ?? '';
}

function onPageTitleInput(pageIndex, value) {
    const page = pages.value[pageIndex];
    const lstr = page.title ?? emptyLStr();
    if (contentLocale.value === 'en') {
        lstr.en = value === '' ? null : value;
    } else {
        lstr.ar = value;
    }
    setPageTitle(pageIndex, lstr);
}

function pageDescriptionValue(page) {
    if (!page.description) {
        return '';
    }

    return (contentLocale.value === 'en' ? page.description.en : page.description.ar) ?? '';
}

function onPageDescriptionInput(pageIndex, value) {
    const page = pages.value[pageIndex];
    const lstr = page.description ?? emptyLStr();
    if (contentLocale.value === 'en') {
        lstr.en = value === '' ? null : value;
    } else {
        lstr.ar = value;
    }
    setPageDescription(pageIndex, lstr);
}

/**
 * vuedraggable change handler. Palette clones arrive as `{__paletteType}`
 * markers; replace them in-place with a real field built by the store. Plain
 * reorders/moves of existing fields are already reflected in the bound array,
 * so we only need to flag the state dirty.
 */
function onChange(pageIndex, event) {
    if (event.added) {
        const { element, newIndex } = event.added;
        if (element && element.__paletteType) {
            const page = pages.value[pageIndex];
            page.fields.splice(newIndex, 1);
            addField(element.__paletteType, pageIndex, newIndex);

            return;
        }
    }
    markDirty();
}

function insertPageAfter() {
    addPage();
}

/** Add a question of the picked type to a specific page (auto-focuses label). */
function onAddQuestion(pageIndex, typeId) {
    addQuestionToPage(typeId, pageIndex);
}

/**
 * vuedraggable handler for reordering whole page blocks via their handle.
 * The bound `pages` array is already mutated by vuedraggable when @change
 * fires — calling movePage() here would apply the move a second time
 * (PR #599 review). Only mark the store dirty; the up/down arrow buttons
 * keep using movePage().
 */
function onPageReorder(event) {
    if (event.moved) {
        markDirty();
    }
}

function moveUp(pageIndex) {
    movePage(pageIndex, pageIndex - 1);
}

function moveDown(pageIndex) {
    movePage(pageIndex, pageIndex + 1);
}
</script>

<template>
    <div class="fb-canvas">
        <draggable
            :list="pages"
            item-key="name"
            handle=".fb-page-drag"
            class="fb-page-list"
            ghost-class="fb-ghost"
            :animation="150"
            @change="onPageReorder"
        >
            <template #item="{ element: page, index: pageIndex }">
                <div class="fb-page">
                    <div v-if="multiPage" class="fb-page-head">
                        <button
                            type="button"
                            class="fb-page-drag fb-focus"
                            :title="t('dragHandle')"
                            :aria-label="t('dragHandle')"
                            @click.stop
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
                        <span class="fb-page-badge">{{ t('page') }} {{ pageIndex + 1 }}</span>
                        <input
                            :value="pageTitleValue(page)"
                            type="text"
                            class="fb-page-title fb-focus"
                            :placeholder="t('pageTitlePlaceholder')"
                            :aria-label="t('pageTitlePlaceholder')"
                            @input="onPageTitleInput(pageIndex, $event.target.value)"
                        />
                        <button
                            v-if="pageIndex > 0"
                            type="button"
                            class="fb-page-logic-btn fb-focus"
                            :class="{ 'fb-page-logic-btn--on': pageHasLogic(page) }"
                            :title="t('pageLogicTitle')"
                            :aria-label="t('pageLogicTitle')"
                            :aria-expanded="openLogicPage === pageIndex"
                            @click="togglePageLogic(pageIndex)"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>{{ t('pageLogicBtn') }}</span>
                        </button>
                        <div class="fb-page-order">
                            <button
                                type="button"
                                class="fb-page-order-btn fb-focus"
                                :title="t('movePageUp')"
                                :aria-label="t('movePageUp')"
                                :disabled="pageIndex === 0"
                                @click="moveUp(pageIndex)"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                class="fb-page-order-btn fb-focus"
                                :title="t('movePageDown')"
                                :aria-label="t('movePageDown')"
                                :disabled="pageIndex === pages.length - 1"
                                @click="moveDown(pageIndex)"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                </svg>
                            </button>
                        </div>
                        <button
                            type="button"
                            class="fb-page-remove fb-focus"
                            :title="t('removePage')"
                            :aria-label="t('removePage')"
                            @click="removePage(pageIndex)"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                />
                            </svg>
                        </button>
                    </div>

                    <PageLogicEditor v-if="multiPage && openLogicPage === pageIndex" :page-index="pageIndex" />

                    <input
                        v-if="multiPage"
                        :value="pageDescriptionValue(page)"
                        type="text"
                        class="fb-page-desc fb-focus"
                        :placeholder="t('pageDescriptionPlaceholder')"
                        :aria-label="t('pageDescriptionPlaceholder')"
                        @input="onPageDescriptionInput(pageIndex, $event.target.value)"
                    />

                    <draggable
                        :list="page.fields"
                        :group="{ name: 'fields', put: true }"
                        item-key="name"
                        handle=".fb-drag-handle"
                        class="fb-field-list"
                        ghost-class="fb-ghost"
                        chosen-class="fb-chosen"
                        drag-class="fb-drag"
                        :animation="150"
                        @change="(event) => onChange(pageIndex, event)"
                    >
                        <template #item="{ element }">
                            <FieldCard :field="element" />
                        </template>

                        <template #footer>
                            <p v-if="page.fields.length === 0" class="fb-empty">
                                {{ multiPage ? t('emptyPage') : t('emptyForm') }}
                            </p>
                        </template>
                    </draggable>

                    <div class="fb-page-actions">
                        <AddQuestionMenu @select="(typeId) => onAddQuestion(pageIndex, typeId)" />
                    </div>
                </div>
            </template>
        </draggable>

        <button type="button" class="fb-add-page fb-focus" @click="insertPageAfter">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>{{ t('addPage') }}</span>
        </button>
    </div>
</template>

<style scoped>
.fb-canvas {
    max-width: 44rem;
    margin-inline: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.fb-page-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}

.fb-page {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.fb-page-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px dashed var(--fb-border);
}

.fb-page-drag {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.375rem;
    height: 1.625rem;
    border: none;
    background: transparent;
    color: #c4c7cd;
    cursor: grab;
    border-radius: 0.375rem;
    padding: 0;
}

.fb-page-drag:hover {
    color: var(--fb-text-muted);
    background: var(--fb-canvas);
}

.fb-page-drag:active {
    cursor: grabbing;
}

.fb-page-drag svg {
    width: 1rem;
    height: 1rem;
}

.fb-page-badge {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--fb-brand-600);
    background: var(--fb-brand-50);
    padding: 0.25rem 0.5rem;
    border-radius: 0.5rem;
    white-space: nowrap;
    flex: 0 0 auto;
}

.fb-page-logic-btn {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border: 1px solid transparent;
    background: transparent;
    color: var(--fb-text-muted);
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.1875rem 0.4375rem;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.15s, background-color 0.15s, border-color 0.15s;
}

.fb-page-logic-btn:hover {
    color: var(--fb-brand-600);
    background: var(--fb-brand-50);
}

.fb-page-logic-btn--on {
    color: #4338ca;
    background: #eef2ff;
    border-color: #e0e7ff;
}

.fb-page-logic-btn svg {
    width: 0.75rem;
    height: 0.75rem;
}

.fb-page-order {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
}

.fb-page-order-btn {
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

.fb-page-order-btn:hover:not(:disabled) {
    background: var(--fb-brand-50);
    color: var(--fb-brand-600);
}

.fb-page-order-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

.fb-page-order-btn svg {
    width: 0.9375rem;
    height: 0.9375rem;
}

.fb-page-actions {
    display: flex;
    align-items: center;
    margin-top: 0.125rem;
}

.fb-page-title {
    flex: 1 1 auto;
    min-width: 0;
    border: none;
    background: transparent;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--fb-text);
    padding: 0.25rem;
    border-radius: 0.375rem;
}

/* Optional per-page description, shown to respondents under the page title. */
.fb-page-desc {
    border: none;
    background: transparent;
    font-size: 0.8125rem;
    color: var(--fb-text-muted);
    padding: 0 0.25rem 0.25rem;
    margin-top: -0.375rem;
    border-radius: 0.375rem;
}

.fb-page-desc::placeholder {
    color: #b6bac2;
}

.fb-page-remove {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.875rem;
    height: 1.875rem;
    border: none;
    background: transparent;
    color: var(--fb-text-muted);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
}

.fb-page-remove:hover {
    background: #fef2f2;
    color: #dc2626;
}

.fb-page-remove svg {
    width: 1.0625rem;
    height: 1.0625rem;
}

.fb-field-list {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    min-height: 1rem;
}

.fb-empty {
    text-align: center;
    color: var(--fb-text-muted);
    font-size: 0.875rem;
    padding: 2rem 1rem;
    border: 1px dashed var(--fb-border-strong);
    border-radius: var(--fb-radius);
    background: var(--fb-surface);
    margin: 0;
}

.fb-add-page {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    align-self: center;
    border: 1px dashed var(--fb-border-strong);
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.5rem 1rem;
    border-radius: 0.625rem;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
}

.fb-add-page:hover {
    border-color: var(--fb-brand);
    color: var(--fb-brand-600);
}

.fb-add-page svg {
    width: 1rem;
    height: 1rem;
}
</style>
