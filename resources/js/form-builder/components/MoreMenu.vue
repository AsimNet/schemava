<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { t, i18n } from '../i18n.js';
import { popIn } from '../motion.js';

const props = defineProps({
    /**
     * Menu items: `{ id, label, icon }`. `icon` is a heroicons-outline path `d`
     * string rendered inline. `label` is already-translated text.
     *
     * @type {Array<{id: string, label: string, icon: string}>}
     */
    items: { type: Array, default: () => [] },
});

const emit = defineEmits(['select']);

const open = ref(false);
const root = ref(null);
const pop = ref(null);

function toggle() {
    open.value = !open.value;
}

function choose(id) {
    emit('select', id);
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
            popIn(pop.value);
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
    <div ref="root" class="fb-more">
        <button
            type="button"
            class="fb-icon-btn fb-focus"
            :class="{ 'fb-icon-btn--active': open }"
            :title="t('moreActions')"
            :aria-label="t('moreActions')"
            :aria-expanded="open"
            aria-haspopup="menu"
            @click.stop="toggle"
        >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.7" />
                <circle cx="12" cy="12" r="1.7" />
                <circle cx="19" cy="12" r="1.7" />
            </svg>
        </button>

        <div v-if="open" ref="pop" class="fb-more-pop" role="menu" :dir="i18n.locale === 'ar' ? 'rtl' : 'ltr'">
            <button
                v-for="item in items"
                :key="item.id"
                type="button"
                role="menuitem"
                class="fb-more-item fb-focus"
                @click.stop="choose(item.id)"
            >
                <span class="fb-more-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" :d="item.icon" />
                    </svg>
                </span>
                <span class="fb-more-label">{{ item.label }}</span>
            </button>
        </div>
    </div>
</template>

<style scoped>
.fb-more {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
}

.fb-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--fb-border);
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.fb-icon-btn:hover,
.fb-icon-btn--active {
    background: var(--fb-brand-50);
    color: var(--fb-brand-600);
    border-color: var(--fb-brand);
}

.fb-icon-btn svg {
    width: 1.125rem;
    height: 1.125rem;
}

.fb-more-pop {
    position: absolute;
    z-index: 40;
    top: calc(100% + 0.5rem);
    inset-inline-end: 0;
    min-width: 11rem;
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: var(--fb-radius);
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
    padding: 0.375rem;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    transform-origin: top var(--fb-more-origin-x, right);
}

:dir(rtl) .fb-more-pop {
    --fb-more-origin-x: left;
}

.fb-more-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    text-align: start;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 0.5rem;
    padding: 0.4375rem 0.5rem;
    cursor: pointer;
    color: var(--fb-text);
    font-size: 0.8125rem;
    font-weight: 500;
    transition: background-color 0.12s, border-color 0.12s;
}

.fb-more-item:hover {
    background: var(--fb-brand-50);
    border-color: var(--fb-brand);
}

.fb-more-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.625rem;
    height: 1.625rem;
    border-radius: 0.4375rem;
    background: var(--fb-brand-50);
    color: var(--fb-brand-600);
    flex: 0 0 auto;
}

.fb-more-icon svg {
    width: 1rem;
    height: 1rem;
}

.fb-more-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
