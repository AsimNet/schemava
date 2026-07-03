<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { FIELD_GROUPS, FIELD_TYPES } from '../model/fieldTypes.js';
import { t, i18n } from '../i18n.js';
import { popIn } from '../motion.js';

const props = defineProps({
    /** Compact variant for the empty-state (centered, dashed). */
    variant: { type: String, default: 'default' },
    /** Builder type ids to hide from the catalog (e.g. to prevent nesting). */
    excludeTypes: { type: Array, default: () => [] },
});

const emit = defineEmits(['select']);

const locale = computed(() => i18n.locale);
const open = ref(false);
const root = ref(null);
const pop = ref(null);

/** Grouped catalog rows (same source as the palette), skipping empty groups. */
const groups = computed(() =>
    FIELD_GROUPS.map((group) => ({
        ...group,
        items: Object.entries(FIELD_TYPES)
            .filter(([id, def]) => def.group === group.id && !props.excludeTypes.includes(id))
            .map(([id, def]) => ({ id, ...def })),
    })).filter((group) => group.items.length > 0),
);

function labelFor(def) {
    return def.label?.[locale.value] ?? def.label?.ar ?? def.id;
}

function toggle() {
    open.value = !open.value;
}

function choose(typeId) {
    emit('select', typeId);
    open.value = false;
}

function onDocumentClick(event) {
    if (root.value && !root.value.contains(event.target)) {
        open.value = false;
    }
}

function onKeydown(event) {
    if (event.key === 'Escape' && open.value) {
        open.value = false;
    }
}

watch(open, (isOpen) => {
    if (isOpen) {
        nextTick(() => {
            // The empty-state variant centres itself with a CSS translateX(-50%);
            // anime.js drives `transform`, which would clobber that centering — so
            // the scale pop-in is reserved for the normal (left-anchored) popover.
            if (props.variant !== 'empty') {
                popIn(pop.value);
            }
            document.addEventListener('click', onDocumentClick, true);
            document.addEventListener('keydown', onKeydown);
        });
    } else {
        document.removeEventListener('click', onDocumentClick, true);
        document.removeEventListener('keydown', onKeydown);
    }
});

onBeforeUnmount(() => {
    document.removeEventListener('click', onDocumentClick, true);
    document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
    <div ref="root" class="fb-addq" :class="{ 'fb-addq--empty': variant === 'empty' }">
        <button
            type="button"
            class="fb-addq-trigger fb-focus"
            :class="{ 'fb-addq-trigger--empty': variant === 'empty', 'fb-addq-trigger--open': open }"
            :aria-expanded="open"
            aria-haspopup="menu"
            @click.stop="toggle"
        >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" class="fb-addq-plus">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>{{ t('addQuestion') }}</span>
        </button>

        <div v-if="open" ref="pop" class="fb-addq-pop" role="menu" :dir="i18n.locale === 'ar' ? 'rtl' : 'ltr'">
            <p class="fb-addq-hint">{{ t('addQuestionHint') }}</p>
            <div v-for="group in groups" :key="group.id" class="fb-addq-group">
                <h4 class="fb-addq-group-title">{{ group.label[locale] ?? group.label.ar }}</h4>
                <div class="fb-addq-items">
                    <button
                        v-for="item in group.items"
                        :key="item.id"
                        type="button"
                        role="menuitem"
                        class="fb-addq-item fb-focus"
                        :title="labelFor(item)"
                        @click.stop="choose(item.id)"
                    >
                        <span class="fb-addq-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" :d="item.icon" />
                            </svg>
                        </span>
                        <span class="fb-addq-label">{{ labelFor(item) }}</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.fb-addq {
    position: relative;
    display: inline-flex;
}

.fb-addq--empty {
    display: flex;
    justify-content: center;
    width: 100%;
}

.fb-addq-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.4375rem;
    border: 1px solid var(--fb-brand);
    background: var(--fb-brand);
    color: #fff;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.4375rem 0.875rem;
    border-radius: 0.625rem;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
}

.fb-addq-trigger:hover {
    background: var(--fb-brand-600);
    border-color: var(--fb-brand-600);
}

.fb-addq-trigger--open {
    background: var(--fb-brand-600);
    border-color: var(--fb-brand-600);
}

.fb-addq-trigger--empty {
    padding: 0.625rem 1.25rem;
    font-size: 0.875rem;
}

.fb-addq-plus {
    width: 1rem;
    height: 1rem;
}

.fb-addq-pop {
    position: absolute;
    z-index: 40;
    top: calc(100% + 0.5rem);
    inset-inline-start: 0;
    width: 20rem;
    max-width: calc(100vw - 2rem);
    max-height: 24rem;
    overflow-y: auto;
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius);
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
    padding: 0.75rem;
    scrollbar-width: thin;
    transform-origin: top var(--fb-addq-origin-x, left);
}

:dir(rtl) .fb-addq-pop {
    --fb-addq-origin-x: right;
}

.fb-addq--empty .fb-addq-pop {
    inset-inline-start: 50%;
    transform: translateX(-50%);
}

:dir(rtl) .fb-addq--empty .fb-addq-pop {
    transform: translateX(50%);
}

.fb-addq-hint {
    font-size: 0.6875rem;
    color: var(--fb-text-muted);
    margin: 0 0.125rem 0.625rem;
    line-height: 1.4;
}

.fb-addq-group {
    margin-bottom: 0.625rem;
}

.fb-addq-group:last-child {
    margin-bottom: 0;
}

.fb-addq-group-title {
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #9ca3af;
    margin: 0 0.125rem 0.375rem;
}

.fb-addq-items {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.25rem;
}

.fb-addq-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-align: start;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 0.5rem;
    padding: 0.4375rem 0.5rem;
    cursor: pointer;
    color: var(--fb-text);
    font-size: 0.75rem;
    font-weight: 500;
    transition: background-color 0.12s, border-color 0.12s;
}

.fb-addq-item:hover {
    background: var(--fb-brand-50);
    border-color: var(--fb-brand);
}

.fb-addq-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.4375rem;
    background: var(--fb-brand-50);
    color: var(--fb-brand-600);
    flex: 0 0 auto;
}

.fb-addq-icon svg {
    width: 0.9375rem;
    height: 0.9375rem;
}

.fb-addq-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
