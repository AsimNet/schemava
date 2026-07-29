<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { t, i18n } from '../i18n.js';
import { store } from '../store.js';
import { variableOptions } from '../ui-helpers.js';

const props = defineProps({
    /** Runtime-context keys to offer. Defaults to the boot list on the store. */
    keys: { type: Array, default: null },
    /**
     * Question-reference options (`{key, label}`, see `fieldReferenceOptions`)
     * to offer above the variables group — used by expression-formula inputs
     * (expression questions, calculated values) so authors can reference other
     * questions by name, consistent with the `visibleIf` field picker.
     */
    fields: { type: Array, default: () => [] },
    /**
     * Calculated-value-reference options (`{key, label}`, see
     * `calculatedValueOptions`) offered as their own group.
     */
    calculatedValues: { type: Array, default: () => [] },
});

const emit = defineEmits(['insert']);

const open = ref(false);
const rootEl = ref(null);

const uiLocale = computed(() => i18n.locale);
const contentLocale = computed(() => store.state?.contentLocale ?? 'ar');

const variableOpts = computed(() => {
    const keys = props.keys ?? store.runtimeContextKeys ?? [];

    return variableOptions(keys, contentLocale.value);
});

/** Grouped option lists, skipping empty groups; falls back to a single implicit variables group when only `keys` is used (backward compatible). */
const groups = computed(() => {
    const list = [];
    if (props.fields.length > 0) {
        list.push({ key: 'fields', title: t('logicFieldsGroup'), items: props.fields });
    }
    if (props.calculatedValues.length > 0) {
        list.push({ key: 'calc', title: t('calculatedValuesGroup'), items: props.calculatedValues });
    }
    if (variableOpts.value.length > 0) {
        list.push({ key: 'vars', title: t('variablesTitle'), items: variableOpts.value });
    }

    return list;
});

function toggle() {
    open.value = !open.value;
    if (open.value) {
        window.addEventListener('pointerdown', onOutside, true);
        window.addEventListener('keydown', onEsc, true);
    } else {
        teardown();
    }
}

function pick(key) {
    emit('insert', key);
    open.value = false;
    teardown();
}

function onOutside(event) {
    if (rootEl.value && !rootEl.value.contains(event.target)) {
        open.value = false;
        teardown();
    }
}

function onEsc(event) {
    if (event.key === 'Escape') {
        open.value = false;
        teardown();
    }
}

function teardown() {
    window.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('keydown', onEsc, true);
}

onBeforeUnmount(teardown);
</script>

<template>
    <span ref="rootEl" class="fb-varmenu">
        <button
            type="button"
            class="fb-varmenu-btn fb-focus"
            :class="{ 'fb-varmenu-btn--open': open }"
            :title="t('insertVariable')"
            :aria-label="t('insertVariable')"
            :aria-expanded="open"
            @click.stop="toggle"
        >
            <span aria-hidden="true">{ }</span>
        </button>

        <div v-if="open" class="fb-varmenu-pop" :dir="uiLocale === 'ar' ? 'rtl' : 'ltr'">
            <p v-if="groups.length === 0" class="fb-varmenu-title">{{ t('variablesTitle') }}</p>
            <p v-if="groups.length === 0" class="fb-varmenu-empty">{{ t('noVariables') }}</p>
            <div v-for="group in groups" :key="group.key" class="fb-varmenu-group">
                <p class="fb-varmenu-title">{{ group.title }}</p>
                <ul class="fb-varmenu-list">
                    <li v-for="opt in group.items" :key="opt.key">
                        <button type="button" class="fb-varmenu-item fb-focus" @click.stop="pick(opt.key)">
                            <span class="fb-varmenu-item-label">{{ opt.label }}</span>
                            <code class="fb-varmenu-item-key" dir="ltr">{{ '{' + opt.key + '}' }}</code>
                        </button>
                    </li>
                </ul>
            </div>
        </div>
    </span>
</template>

<style scoped>
.fb-varmenu {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
}

.fb-varmenu-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 1.75rem;
    min-width: 1.75rem;
    padding: 0 0.375rem;
    border: 1px solid var(--fb-border-strong);
    background: var(--fb-surface);
    color: var(--fb-text-muted);
    border-radius: 0.4375rem;
    cursor: pointer;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1;
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}

.fb-varmenu-btn:hover,
.fb-varmenu-btn--open {
    background: var(--fb-brand-50);
    color: var(--fb-brand-600);
    border-color: var(--fb-brand);
}

.fb-varmenu-pop {
    position: absolute;
    top: calc(100% + 0.25rem);
    inset-inline-end: 0;
    z-index: 20;
    width: 15rem;
    max-height: 16rem;
    overflow-y: auto;
    background: var(--fb-surface);
    border: 1px solid var(--fb-border-strong);
    border-radius: 0.625rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    padding: 0.375rem;
}

.fb-varmenu-group {
    margin-bottom: 0.5rem;
}

.fb-varmenu-group:last-child {
    margin-bottom: 0;
}

.fb-varmenu-title {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #9ca3af;
    margin: 0.25rem 0.375rem 0.375rem;
}

.fb-varmenu-empty {
    font-size: 0.75rem;
    color: var(--fb-text-muted);
    margin: 0.5rem 0.375rem;
}

.fb-varmenu-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.0625rem;
}

.fb-varmenu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    text-align: start;
    border: none;
    background: transparent;
    border-radius: 0.4375rem;
    padding: 0.375rem 0.5rem;
    cursor: pointer;
    color: var(--fb-text);
    font-size: 0.8125rem;
}

.fb-varmenu-item:hover {
    background: var(--fb-canvas);
}

.fb-varmenu-item-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.fb-varmenu-item-key {
    flex: 0 0 auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.6875rem;
    color: var(--fb-brand-600);
    background: var(--fb-brand-50);
    padding: 0.0625rem 0.25rem;
    border-radius: 0.25rem;
}
</style>
