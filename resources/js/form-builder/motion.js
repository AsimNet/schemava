/**
 * Form-builder motion layer — the ONLY module that imports anime.js.
 *
 * Goals (see the motion spec): quick (120–260ms), subtle, purposeful motion that
 * makes building feel alive without being gimmicky. Every helper:
 *   - no-ops when the user prefers reduced motion (gated on a live media query), and
 *   - no-ops when handed a missing element,
 * so callers never have to branch on either case.
 *
 * All durations/easings live here (see {@link DURATION}/{@link EASING}) so the
 * feel is consistent and tunable from one place. We animate only `transform` and
 * `opacity` (compositor-friendly); the one exception is a contained height
 * collapse on card removal, which is explicitly bounded.
 *
 * anime.js v4 named-export API: `animate(targets, params)`, `stagger(...)`,
 * `utils.remove(targets)`. Callbacks are `onComplete`/`onBegin`; the per-element
 * delay helper is `stagger(ms)`.
 */

import { animate, stagger as animeStagger, utils } from 'animejs';

/**
 * Shared durations (ms). Kept short and within the spec's 120–260ms band; the
 * collapse-on-leave is a touch quicker so removal feels crisp.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const DURATION = Object.freeze({
    micro: 140,
    short: 180,
    base: 200,
    enter: 220,
    leave: 180,
    drawer: 240,
});

/**
 * Shared easings. anime.js accepts these string tokens (cubic-bezier presets);
 * `outQuad`/`outCubic` read as natural "settle" curves for entrances, `outBack`
 * adds a faint overshoot for pop-ins.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const EASING = Object.freeze({
    out: 'out(2)',
    outCubic: 'out(3)',
    inOut: 'inOut(2)',
    pop: 'outBack(1.2)',
});

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Live media-query handle. Read once, then kept current via a change listener so
 * toggling the OS setting mid-session is honoured without a reload.
 *
 * @type {MediaQueryList|null}
 */
let reducedMotionMql = null;

function reducedMotionMedia() {
    if (reducedMotionMql) {
        return reducedMotionMql;
    }
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return null;
    }
    reducedMotionMql = window.matchMedia(REDUCED_MOTION_QUERY);

    return reducedMotionMql;
}

/**
 * Whether the user has asked for reduced motion right now. Resolved live (not
 * cached) so a mid-session OS toggle is respected. Falls back to `false` when no
 * `matchMedia` is available (SSR/tests) — i.e. motion is allowed by default.
 *
 * @returns {boolean}
 */
export function prefersReducedMotion() {
    const mql = reducedMotionMedia();

    return mql ? mql.matches : false;
}

/** True when motion should run: an element exists AND reduced-motion is off. */
function shouldAnimate(el) {
    return Boolean(el) && !prefersReducedMotion();
}

/**
 * Cancel any in-flight anime.js animation on an element (or array of elements)
 * and leave its inline styles as-is. Safe to call with a missing target.
 *
 * @param {Element|Element[]|null|undefined} target
 * @returns {void}
 */
export function stop(target) {
    if (!target) {
        return;
    }
    try {
        utils.remove(target);
    } catch {
        /* a target anime never touched — nothing to remove */
    }
}

/**
 * Fade + slide a single element in from a small offset. The default direction is
 * a gentle upward rise (translateY); pass `axis: 'x'` with a signed `distance`
 * for inline-direction entrances (the caller resolves RTL sign).
 *
 * @param {Element|null|undefined} el
 * @param {{ distance?: number, axis?: 'x'|'y', duration?: number, delay?: number,
 *          easing?: string, onComplete?: () => void }} [opts]
 * @returns {object|null} the anime instance, or null when skipped
 */
export function fadeInUp(el, opts = {}) {
    if (!shouldAnimate(el)) {
        opts.onComplete?.();

        return null;
    }
    const {
        distance = 8,
        axis = 'y',
        duration = DURATION.enter,
        delay = 0,
        easing = EASING.out,
        onComplete,
    } = opts;
    const from = axis === 'x'
        ? { translateX: [distance, 0] }
        : { translateY: [distance, 0] };

    return animate(el, {
        opacity: [0, 1],
        ...from,
        duration,
        delay,
        ease: easing,
        onComplete,
    });
}

/**
 * Collapse + fade a single element out for removal. Animates `opacity`,
 * `translateY` and a contained `height`/`marginBlockEnd` to 0 so neighbours
 * close the gap smoothly. `gap` is the list gap (px) folded into the collapse so
 * the row's spacing disappears with it.
 *
 * @param {Element|null|undefined} el
 * @param {{ duration?: number, gap?: number, onComplete?: () => void }} [opts]
 * @returns {object|null}
 */
export function collapseOut(el, opts = {}) {
    const { duration = DURATION.leave, gap = 0, onComplete } = opts;
    if (!shouldAnimate(el)) {
        onComplete?.();

        return null;
    }
    const height = el.offsetHeight;
    // Clip content to the shrinking box so it folds away instead of spilling.
    el.style.overflow = 'hidden';

    return animate(el, {
        opacity: [1, 0],
        translateY: [0, -6],
        height: [height, 0],
        marginBlockEnd: [gap, 0],
        duration,
        ease: EASING.inOut,
        onComplete,
    });
}

/**
 * Subtle scale + fade pop-in for popovers/menus. A faint overshoot (`outBack`)
 * gives it life without bouncing. Set the element's `transform-origin` in CSS so
 * it grows from the right edge.
 *
 * @param {Element|null|undefined} el
 * @param {{ duration?: number, onComplete?: () => void }} [opts]
 * @returns {object|null}
 */
export function popIn(el, opts = {}) {
    if (!shouldAnimate(el)) {
        opts.onComplete?.();

        return null;
    }
    const { duration = DURATION.micro, onComplete } = opts;

    return animate(el, {
        opacity: [0, 1],
        scale: [0.96, 1],
        duration,
        ease: EASING.pop,
        onComplete,
    });
}

/**
 * One-time staggered entrance for a group of elements (palette groups / first
 * canvas paint). Each element rises + fades with a small per-item delay. No-op
 * (and resolves `onComplete`) under reduced motion or with an empty list.
 *
 * @param {Iterable<Element>|null|undefined} els
 * @param {{ distance?: number, duration?: number, step?: number, baseDelay?: number,
 *          easing?: string, onComplete?: () => void }} [opts]
 * @returns {object|null}
 */
export function staggerIn(els, opts = {}) {
    const list = els ? Array.from(els).filter(Boolean) : [];
    if (list.length === 0 || prefersReducedMotion()) {
        opts.onComplete?.();

        return null;
    }
    const {
        distance = 8,
        duration = DURATION.enter,
        step = 40,
        baseDelay = 0,
        easing = EASING.out,
        onComplete,
    } = opts;

    return animate(list, {
        opacity: [0, 1],
        translateY: [distance, 0],
        duration,
        delay: animeStagger(step, { start: baseDelay }),
        ease: easing,
        onComplete,
    });
}

/**
 * A brief attention pulse (scale up then settle) for confirmations — the Save
 * checkmark, an applied-proposal cue, the points badge ticking. Returns the
 * element to its resting transform on completion.
 *
 * @param {Element|null|undefined} el
 * @param {{ scale?: number, duration?: number }} [opts]
 * @returns {object|null}
 */
export function pulse(el, opts = {}) {
    if (!shouldAnimate(el)) {
        return null;
    }
    const { scale = 1.18, duration = DURATION.base } = opts;

    return animate(el, {
        scale: [1, scale, 1],
        duration,
        ease: EASING.inOut,
    });
}

/**
 * Crossfade a single pane in (used for the build↔preview tab switch). A faint
 * inline-direction slide accompanies the fade; the caller passes a signed
 * `distance` so RTL slides from the correct edge.
 *
 * @param {Element|null|undefined} el
 * @param {{ distance?: number, duration?: number, easing?: string,
 *          onComplete?: () => void }} [opts]
 * @returns {object|null}
 */
export function crossfadeIn(el, opts = {}) {
    if (!shouldAnimate(el)) {
        opts.onComplete?.();

        return null;
    }
    const {
        distance = 0,
        duration = DURATION.base,
        easing = EASING.out,
        onComplete,
    } = opts;

    return animate(el, {
        opacity: [0, 1],
        translateX: distance ? [distance, 0] : undefined,
        duration,
        ease: easing,
        onComplete,
    });
}

/**
 * Re-export the raw anime.js primitives for the few call sites that compose
 * their own one-off tweens (e.g. a list-transition leave hook). Keeping these
 * funnelled through this module preserves the rule that anime.js is imported in
 * exactly one place — callers should still gate on {@link prefersReducedMotion}.
 */
export { animeStagger as stagger, animate };
