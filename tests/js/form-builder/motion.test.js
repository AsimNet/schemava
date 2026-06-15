// @vitest-environment jsdom

/**
 * Unit coverage for the pure logic in the motion layer: the live reduced-motion
 * resolver and the "no-op when reduced / missing element" guarantees every
 * helper promises. The actual tweening (anime.js) is not asserted here — it
 * needs a real compositor — but we DO assert that under reduced motion the
 * helpers run NO animation and still resolve their `onComplete` so callers that
 * chain off completion never stall.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let matchMediaImpl;

beforeEach(() => {
    vi.resetModules();
    // Default: a controllable matchMedia whose `matches` we flip per test.
    matchMediaImpl = vi.fn((query) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
    }));
    window.matchMedia = matchMediaImpl;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('prefersReducedMotion', () => {
    it('is false when the media query does not match', async () => {
        const { prefersReducedMotion } = await import('../../../resources/js/form-builder/motion.js');
        expect(prefersReducedMotion()).toBe(false);
    });

    it('is true when the media query matches', async () => {
        window.matchMedia = vi.fn((query) => ({
            matches: true,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }));
        const { prefersReducedMotion } = await import('../../../resources/js/form-builder/motion.js');
        expect(prefersReducedMotion()).toBe(true);
    });

    it('queries prefers-reduced-motion: reduce', async () => {
        const { prefersReducedMotion } = await import('../../../resources/js/form-builder/motion.js');
        prefersReducedMotion();
        expect(matchMediaImpl).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    });

    it('reflects a live change to the OS setting (not cached)', async () => {
        const handle = {
            matches: false,
            media: '(prefers-reduced-motion: reduce)',
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        };
        window.matchMedia = vi.fn(() => handle);
        const { prefersReducedMotion } = await import('../../../resources/js/form-builder/motion.js');
        expect(prefersReducedMotion()).toBe(false);
        handle.matches = true;
        expect(prefersReducedMotion()).toBe(true);
    });

    it('falls back to false when matchMedia is unavailable', async () => {
        // @ts-expect-error intentionally remove the API
        delete window.matchMedia;
        const { prefersReducedMotion } = await import('../../../resources/js/form-builder/motion.js');
        expect(prefersReducedMotion()).toBe(false);
    });
});

describe('helpers are inert under reduced motion', () => {
    async function loadWithReducedMotion() {
        window.matchMedia = vi.fn((query) => ({
            matches: true,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }));

        return import('../../../resources/js/form-builder/motion.js');
    }

    it('fadeInUp returns null and calls onComplete without animating', async () => {
        const { fadeInUp } = await loadWithReducedMotion();
        const el = document.createElement('div');
        const onComplete = vi.fn();
        const result = fadeInUp(el, { onComplete });
        expect(result).toBeNull();
        expect(onComplete).toHaveBeenCalledOnce();
        expect(el.style.opacity).toBe('');
    });

    it('collapseOut returns null and calls onComplete', async () => {
        const { collapseOut } = await loadWithReducedMotion();
        const el = document.createElement('div');
        const onComplete = vi.fn();
        expect(collapseOut(el, { onComplete })).toBeNull();
        expect(onComplete).toHaveBeenCalledOnce();
    });

    it('popIn returns null and calls onComplete', async () => {
        const { popIn } = await loadWithReducedMotion();
        const onComplete = vi.fn();
        expect(popIn(document.createElement('div'), { onComplete })).toBeNull();
        expect(onComplete).toHaveBeenCalledOnce();
    });

    it('staggerIn returns null and calls onComplete', async () => {
        const { staggerIn } = await loadWithReducedMotion();
        const onComplete = vi.fn();
        const els = [document.createElement('div'), document.createElement('div')];
        expect(staggerIn(els, { onComplete })).toBeNull();
        expect(onComplete).toHaveBeenCalledOnce();
    });

    it('pulse returns null', async () => {
        const { pulse } = await loadWithReducedMotion();
        expect(pulse(document.createElement('div'))).toBeNull();
    });

    it('crossfadeIn returns null and calls onComplete', async () => {
        const { crossfadeIn } = await loadWithReducedMotion();
        const onComplete = vi.fn();
        expect(crossfadeIn(document.createElement('div'), { onComplete })).toBeNull();
        expect(onComplete).toHaveBeenCalledOnce();
    });
});

describe('helpers no-op on a missing element', () => {
    it('fadeInUp on null returns null and still resolves onComplete', async () => {
        const { fadeInUp } = await import('../../../resources/js/form-builder/motion.js');
        const onComplete = vi.fn();
        expect(fadeInUp(null, { onComplete })).toBeNull();
        expect(onComplete).toHaveBeenCalledOnce();
    });

    it('popIn on undefined returns null', async () => {
        const { popIn } = await import('../../../resources/js/form-builder/motion.js');
        expect(popIn(undefined)).toBeNull();
    });

    it('staggerIn on an empty list returns null and resolves onComplete', async () => {
        const { staggerIn } = await import('../../../resources/js/form-builder/motion.js');
        const onComplete = vi.fn();
        expect(staggerIn([], { onComplete })).toBeNull();
        expect(onComplete).toHaveBeenCalledOnce();
    });

    it('pulse on null returns null', async () => {
        const { pulse } = await import('../../../resources/js/form-builder/motion.js');
        expect(pulse(null)).toBeNull();
    });

    it('stop on null is a safe no-op', async () => {
        const { stop } = await import('../../../resources/js/form-builder/motion.js');
        expect(() => stop(null)).not.toThrow();
    });
});

describe('helpers DO animate when motion is allowed', () => {
    it('fadeInUp returns an anime instance and does not call onComplete synchronously', async () => {
        const { fadeInUp } = await import('../../../resources/js/form-builder/motion.js');
        const el = document.createElement('div');
        const onComplete = vi.fn();
        const instance = fadeInUp(el, { onComplete });
        expect(instance).not.toBeNull();
        // onComplete fires when the tween finishes, not on the same tick.
        expect(onComplete).not.toHaveBeenCalled();
    });

    it('pulse returns an anime instance when allowed', async () => {
        const { pulse } = await import('../../../resources/js/form-builder/motion.js');
        expect(pulse(document.createElement('div'))).not.toBeNull();
    });
});
