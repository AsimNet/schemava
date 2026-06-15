<script setup>
import { computed, onMounted, ref } from 'vue';
import draggable from 'vuedraggable';
import { FIELD_GROUPS, FIELD_TYPES } from '../model/fieldTypes.js';
import { t, i18n } from '../i18n.js';
import { addFieldSmart } from '../store.js';
import { staggerIn } from '../motion.js';

const locale = computed(() => i18n.locale);

/** Palette root — used for the one-time first-paint stagger of its groups. */
const paletteEl = ref(null);

// One-shot entrance: the palette groups rise + fade in sequence on first paint
// (no-op under reduced motion). Runs once on mount, never on locale/re-render.
onMounted(() => {
    const groupEls = paletteEl.value?.querySelectorAll('.fb-palette-group');
    staggerIn(groupEls, { distance: 6, step: 35 });
});

const groups = computed(() =>
    FIELD_GROUPS.map((group) => ({
        ...group,
        items: Object.entries(FIELD_TYPES)
            .filter(([, def]) => def.group === group.id)
            .map(([id, def]) => ({ id, ...def })),
    })).filter((group) => group.items.length > 0),
);

function labelFor(def) {
    return def.label?.[locale.value] ?? def.label?.ar ?? def.id;
}

function add(typeId) {
    addFieldSmart(typeId);
}
</script>

<template>
    <aside ref="paletteEl" class="fb-palette-inner fb-scroll">
        <p class="fb-palette-hint">{{ t('paletteHint') }}</p>

        <div v-for="group in groups" :key="group.id" class="fb-palette-group">
            <h3 class="fb-palette-group-title">{{ group.label[locale] ?? group.label.ar }}</h3>

            <draggable
                :list="group.items"
                :group="{ name: 'fields', pull: 'clone', put: false }"
                :sort="false"
                :clone="(item) => ({ __paletteType: item.id })"
                item-key="id"
                class="fb-palette-list"
                ghost-class="fb-ghost"
            >
                <template #item="{ element }">
                    <button
                        type="button"
                        class="fb-palette-item fb-focus"
                        :title="labelFor(element)"
                        @click="add(element.id)"
                    >
                        <span class="fb-palette-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" :d="element.icon" />
                            </svg>
                        </span>
                        <span class="fb-palette-label">{{ labelFor(element) }}</span>
                    </button>
                </template>
            </draggable>
        </div>
    </aside>
</template>

<style scoped>
.fb-palette-inner {
    padding: 1rem 0.75rem 2rem;
    height: 100%;
}

.fb-palette-hint {
    font-size: 0.75rem;
    color: var(--fb-text-muted);
    margin: 0 0.25rem 1rem;
    line-height: 1.4;
}

.fb-palette-group {
    margin-bottom: 1.25rem;
}

.fb-palette-group-title {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #9ca3af;
    margin: 0 0.25rem 0.5rem;
}

.fb-palette-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.fb-palette-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    text-align: start;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 0.625rem;
    padding: 0.5rem 0.625rem;
    cursor: grab;
    color: var(--fb-text);
    font-size: 0.8125rem;
    font-weight: 500;
    transition: background-color 0.12s, border-color 0.12s;
}

.fb-palette-item:hover {
    background: var(--fb-canvas);
    border-color: var(--fb-border);
}

.fb-palette-item:active {
    cursor: grabbing;
}

.fb-palette-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 0.5rem;
    background: var(--fb-brand-50);
    color: var(--fb-brand-600);
    flex: 0 0 auto;
}

.fb-palette-icon svg {
    width: 1.0625rem;
    height: 1.0625rem;
}

.fb-palette-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
