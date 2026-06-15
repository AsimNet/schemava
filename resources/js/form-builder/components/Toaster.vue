<script setup>
import { toasts, dismissToast } from '../store.js';
import { i18n, isRtl } from '../i18n.js';
import { fadeInUp, animate, prefersReducedMotion } from '../motion.js';

/** Run a toast's action then dismiss it (the body click-to-dismiss is stopped). */
function runAction(toast) {
    if (typeof toast.action?.handler === 'function') {
        toast.action.handler();
    }
    dismissToast(toast.id);
}

/**
 * Toast entrance: slide in from the inline-end edge (the corner the toaster
 * lives in) with a fade. RTL-safe sign. JS hooks (with `:css="false"`) so the
 * motion is fully gated on reduced motion — `fadeInUp` no-ops there and we call
 * `done()` immediately so the toast still appears instantly.
 */
function onToastEnter(el, done) {
    const distance = isRtl.value ? -16 : 16;
    const instance = fadeInUp(el, { axis: 'x', distance, onComplete: done });
    if (!instance) {
        done();
    }
}

/** Toast leave: fade + drift down, then resolve. Instant under reduced motion. */
function onToastLeave(el, done) {
    if (prefersReducedMotion()) {
        done();

        return;
    }
    animate(el, {
        opacity: [1, 0],
        translateY: [0, 8],
        duration: 160,
        ease: 'inOut(2)',
        onComplete: done,
    });
}
</script>

<template>
    <Teleport to="body">
        <div class="fb-toaster" :dir="i18n.locale === 'ar' ? 'rtl' : 'ltr'" aria-live="polite">
            <TransitionGroup :css="false" @enter="onToastEnter" @leave="onToastLeave">
                <div
                    v-for="toast in toasts.items"
                    :key="toast.id"
                    class="fb-toast"
                    :class="`fb-toast--${toast.kind}`"
                    role="status"
                    @click="dismissToast(toast.id)"
                >
                    <span class="fb-toast-icon" aria-hidden="true">
                        <svg v-if="toast.kind === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                        <svg v-else-if="toast.kind === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                        </svg>
                    </span>
                    <span class="fb-toast-text">{{ toast.message }}</span>
                    <button
                        v-if="toast.action"
                        type="button"
                        class="fb-toast-action"
                        @click.stop="runAction(toast)"
                    >
                        {{ toast.action.label }}
                    </button>
                </div>
            </TransitionGroup>
        </div>
    </Teleport>
</template>

<style scoped>
.fb-toaster {
    position: fixed;
    z-index: 200;
    bottom: 1.25rem;
    inset-inline-end: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: min(24rem, calc(100vw - 2rem));
    font-family: "IBM Plex Sans Arabic", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    pointer-events: none;
}

.fb-toast {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
    padding: 0.625rem 0.875rem;
    font-size: 0.8125rem;
    color: #111827;
    cursor: pointer;
    pointer-events: auto;
}

.fb-toast--error {
    border-color: #fecaca;
    background: #fef2f2;
    color: #991b1b;
}

.fb-toast--success {
    border-color: #a7f3d0;
    background: #ecfdf5;
    color: #065f46;
}

.fb-toast-icon {
    flex: 0 0 auto;
    display: inline-flex;
}

.fb-toast-icon svg {
    width: 1.125rem;
    height: 1.125rem;
}

.fb-toast-text {
    line-height: 1.4;
}

.fb-toast-action {
    flex: 0 0 auto;
    margin-inline-start: auto;
    align-self: center;
    border: 1px solid currentColor;
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.1875rem 0.5rem;
    cursor: pointer;
    white-space: nowrap;
    opacity: 0.85;
    transition: opacity 0.15s, background-color 0.15s;
}

.fb-toast-action:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.06);
}
</style>
