/**
 * Bookkeeping for in-flight per-choice image uploads (see ChoicesEditor).
 *
 * Lives in its own module rather than ui-helpers.js because it needs Vue's
 * reactivity, and that file is deliberately framework-free.
 */

import { shallowReactive, toRaw } from 'vue';

/**
 * Track in-flight uploads as (owner, uid) pairs, so an upload is only ever
 * attributed to the field it started from.
 *
 * Scoped to the owner rather than the choice uid alone because `duplicateField`
 * structuredClones choice `_uid`s and then selects the copy: a uid-only flag
 * would render the original's spinner on the duplicate's choice and disable its
 * upload button until that unrelated request finished — or forever, if it stalls.
 *
 * Two object-identity traps this exists to contain. Both make the comparison
 * silently always-false, which shows up as a spinner that never appears and
 * entries that are never removed (so: no disabled state, concurrent uploads on
 * one choice racing to be last, and an unbounded list):
 *
 * - A deep `reactive([])` proxies the nested `owner` when it is read back, so
 *   `entry.owner === rawField` is false. Hence `shallowReactive`, whose elements
 *   stay raw — plus `toRaw` on both sides, so this stays correct even if someone
 *   later swaps the container.
 * - Callers may hold either a raw field or a reactive proxy of one (`addField`
 *   returns the raw object it spliced in, while reads through `store.state` come
 *   back proxied), so owners are normalised through `toRaw` on the way in and out.
 *
 * @returns {{
 *   entries: Array<{owner: object|null, uid: string}>,
 *   add: (owner: object|null, uid: string) => void,
 *   remove: (owner: object|null, uid: string) => void,
 *   has: (owner: object|null, uid: string) => boolean,
 * }}
 */
export function createPendingUploads() {
    const entries = shallowReactive([]);
    const identity = (owner) => (owner ? toRaw(owner) : null);
    const indexOf = (owner, uid) => {
        const target = identity(owner);

        return entries.findIndex((entry) => entry.uid === uid && identity(entry.owner) === target);
    };

    return {
        entries,

        add(owner, uid) {
            entries.push({ owner: identity(owner), uid });
        },

        remove(owner, uid) {
            const at = indexOf(owner, uid);
            if (at !== -1) {
                entries.splice(at, 1);
            }
        },

        has(owner, uid) {
            return indexOf(owner, uid) !== -1;
        },
    };
}
