import { describe, it, expect } from 'vitest';
import { reactive } from 'vue';
import { createPendingUploads } from '../../../resources/js/form-builder/pending-uploads.js';

describe('pending uploads — (owner, uid) tracking', () => {
    it('reports an upload as pending for its own owner only', () => {
        const pending = createPendingUploads();
        const picker = { name: 'q1' };
        const other = { name: 'q2' };

        pending.add(picker, 'a1');

        expect(pending.has(picker, 'a1')).toBe(true);
        expect(pending.has(other, 'a1')).toBe(false);
        expect(pending.has(picker, 'a2')).toBe(false);
    });

    // duplicateField structuredClones choice _uids and selects the copy, so the
    // duplicate's choice shares 'a1'. Its upload button must stay live.
    it('does not mark a duplicate that shares the choice uid as pending', () => {
        const pending = createPendingUploads();
        const original = { name: 'q1' };
        const duplicate = { name: 'q2' };

        pending.add(original, 'a1');

        expect(pending.has(original, 'a1')).toBe(true);
        expect(pending.has(duplicate, 'a1')).toBe(false);
    });

    it('removes only the matching pair', () => {
        const pending = createPendingUploads();
        const picker = { name: 'q1' };
        const other = { name: 'q2' };
        pending.add(picker, 'a1');
        pending.add(other, 'a1');

        pending.remove(picker, 'a1');

        expect(pending.has(picker, 'a1')).toBe(false);
        expect(pending.has(other, 'a1')).toBe(true);
        expect(pending.entries).toHaveLength(1);
    });

    it('leaves the list untouched when removing something absent', () => {
        const pending = createPendingUploads();
        const picker = { name: 'q1' };
        pending.add(picker, 'a1');

        pending.remove(picker, 'nope');
        pending.remove({ name: 'other' }, 'a1');

        expect(pending.entries).toHaveLength(1);
    });

    // The regression this module was extracted for. A caller may hold a reactive
    // proxy of the field while the stored owner is raw (or vice versa) — a plain
    // `===` is then always false, so the spinner never showed and entries were
    // never removed. Identity must survive the wrapper in every direction.
    it('matches a raw owner against a reactive proxy of the same field', () => {
        const pending = createPendingUploads();
        const raw = { name: 'q1' };
        const proxy = reactive(raw);

        pending.add(raw, 'a1');
        expect(pending.has(proxy, 'a1')).toBe(true);

        pending.remove(proxy, 'a1');
        expect(pending.entries).toHaveLength(0);
    });

    it('matches a proxy owner against the raw field', () => {
        const pending = createPendingUploads();
        const raw = { name: 'q1' };
        const proxy = reactive(raw);

        pending.add(proxy, 'a1');
        expect(pending.has(raw, 'a1')).toBe(true);
        expect(pending.has(proxy, 'a1')).toBe(true);
    });

    // Elements must stay raw: a deep reactive() container would proxy `owner` on
    // read and break every comparison above.
    it('keeps stored owners raw so identity comparison holds', () => {
        const pending = createPendingUploads();
        const raw = { name: 'q1' };

        pending.add(reactive(raw), 'a1');

        expect(pending.entries[0].owner).toBe(raw);
        expect(pending.entries.some((e) => e.owner === raw)).toBe(true);
    });

    it('supports the null owner used by the alias/items modes', () => {
        const pending = createPendingUploads();

        pending.add(null, 'a1');

        expect(pending.has(null, 'a1')).toBe(true);
        expect(pending.has({ name: 'q1' }, 'a1')).toBe(false);
        pending.remove(null, 'a1');
        expect(pending.entries).toHaveLength(0);
    });
});
