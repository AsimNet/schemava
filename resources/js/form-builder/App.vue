<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { store, selectedField, setActiveTab } from './store.js';
import { isRtl } from './i18n.js';
import { isRtlLocale } from './survey-runtime.js';
import { crossfadeIn } from './motion.js';
import BuilderHeader from './components/BuilderHeader.vue';
import FieldPalette from './components/FieldPalette.vue';
import BuilderCanvas from './components/BuilderCanvas.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import PreviewPane from './components/PreviewPane.vue';
import AiAssistant from './components/AiAssistant.vue';
import JsonPanel from './components/JsonPanel.vue';
import SurveySettings from './components/SurveySettings.vue';
import LogicMap from './components/LogicMap.vue';
import Toaster from './components/Toaster.vue';

const props = defineProps({
    boot: { type: Object, default: () => ({}) },
});

const jsonOpen = ref(false);
const jsonInitialText = ref(null);
const settingsOpen = ref(false);
const logicMapOpen = ref(false);

/** Refs to the two workspace panes, for the tab-switch crossfade. */
const canvasPane = ref(null);
const previewPane = ref(null);

/** Active workspace tab, owned by the store so AI-proposal actions can drive it. */
const activeTab = computed(() => store.activeTab);

/**
 * Crossfade the freshly-shown pane on a build↔preview switch — a short fade plus
 * a faint inline-direction slide (RTL-safe sign). Purely presentational and
 * gated on reduced motion; the v-if/v-show that own each pane's lifecycle (and
 * the PreviewPane mount/dispose) are left untouched. The build pane is wrapped
 * in v-if, so we wait a tick for it to mount before animating.
 */
watch(activeTab, (tab) => {
    const distance = isRtl.value ? -10 : 10;
    nextTick(() => {
        const el = tab === 'preview' ? previewPane.value : canvasPane.value;
        crossfadeIn(el?.$el ?? el, { distance });
    });
});

const contentDir = computed(() => (isRtlLocale(store.state?.contentLocale) ? 'rtl' : 'ltr'));

const current = computed(() => selectedField());
const drawerOpen = computed(() => activeTab.value === 'build' && current.value !== null);

function openJson(initialText = null) {
    jsonInitialText.value = typeof initialText === 'string' ? initialText : null;
    jsonOpen.value = true;
}

function closeJson() {
    jsonOpen.value = false;
    jsonInitialText.value = null;
}
</script>

<template>
    <div class="fb-app" :dir="isRtl ? 'rtl' : 'ltr'">
        <BuilderHeader
            :boot="props.boot"
            :active-tab="activeTab"
            @update:active-tab="setActiveTab"
            @open-json="openJson()"
            @open-settings="settingsOpen = true"
            @open-logic-map="logicMapOpen = true"
        />

        <main class="fb-main">
            <template v-if="activeTab === 'build'">
                <FieldPalette class="fb-palette" />

                <section ref="canvasPane" class="fb-canvas-wrap fb-scroll" :dir="contentDir">
                    <BuilderCanvas />
                </section>

                <SettingsPanel :open="drawerOpen" :field="current" />
            </template>

            <PreviewPane ref="previewPane" v-show="activeTab === 'preview'" :active="activeTab === 'preview'" />
        </main>

        <AiAssistant @open-json="(text) => openJson(text)" />

        <JsonPanel :open="jsonOpen" :initial-text="jsonInitialText" @close="closeJson" />
        <SurveySettings :open="settingsOpen" @close="settingsOpen = false" />
        <LogicMap :open="logicMapOpen" @close="logicMapOpen = false" />
        <Toaster />
    </div>
</template>

<style scoped>
.fb-app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    background: var(--fb-canvas);
}

.fb-main {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    overflow: hidden;
}

.fb-palette {
    flex: 0 0 16rem;
    border-inline-end: 1px solid var(--fb-border);
    background: var(--fb-surface);
    overflow-y: auto;
}

.fb-canvas-wrap {
    flex: 1 1 auto;
    min-width: 0;
    overflow-y: auto;
    padding: 2rem 1.5rem 6rem;
}

@media (max-width: 1024px) {
    .fb-palette {
        flex-basis: 13rem;
    }
}
</style>
