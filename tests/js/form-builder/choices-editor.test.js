// @vitest-environment jsdom

/**
 * Component tests for ChoicesEditor's per-choice image upload (imagepicker).
 *
 * These exist because every defect found in this feature during review was an
 * async completion re-reading identity that had moved while the request was in
 * flight — list position, field name, choice-uid-vs-field, raw-vs-reactive-proxy,
 * and component lifetime. None of those are reachable from the pure-logic suites:
 * they need a real mount, a controllable in-flight request, and the ability to
 * mutate the store mid-flight. So each test here drives the actual race.
 *
 * The pattern throughout: start an upload, mutate the world, THEN resolve the
 * request, and assert where the image landed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ChoicesEditor from '../../../resources/js/form-builder/components/ChoicesEditor.vue';
import {
    store,
    loadFromBoot,
    addField,
    setChoices,
    renameField,
    duplicateField,
    findField,
} from '../../../resources/js/form-builder/store.js';
import { pendingUploads } from '../../../resources/js/form-builder/pending-uploads.js';

const UPLOAD_URL = '/survey-designer/upload-image';

/** Resolve/reject an in-flight upload by hand, so the race can be driven. */
function deferredFetch() {
    let settle;
    const fetchMock = vi.fn(() => new Promise((resolve, reject) => {
        settle = { resolve, reject };
    }));
    global.fetch = fetchMock;

    return {
        fetchMock,
        /** Complete the request with the designer endpoint's success shape. */
        async succeedWith(url) {
            settle.resolve({ ok: true, status: 200, json: async () => ({ status: 'success', url }) });
            await flushPromises();
        },
        async fail() {
            settle.resolve({ ok: false, status: 500, json: async () => ({ message: 'boom' }) });
            await flushPromises();
        },
    };
}

/** Seed a field's choices with predictable uids (imagepicker seeds none itself). */
function seed(name, uids) {
    setChoices(name, uids.map((uid) => ({
        _uid: uid, value: uid, label: { ar: uid, en: null }, raw: {},
    })));
}

/** The store's own reactive handle on a field — what SettingsPanel passes down. */
function live(name) {
    return findField(name).field;
}

function mountEditor(field) {
    return mount(ChoicesEditor, {
        props: { field, withImages: true },
        global: {
            // vuedraggable needs no real drag behaviour here; render the rows.
            stubs: {
                draggable: {
                    props: ['list'],
                    template: '<div><template v-for="(element, index) in list" :key="element._uid"><slot name="item" :element="element" :index="index" /></template></div>',
                },
            },
        },
    });
}

/** Kick off an upload from the row whose choice carries `uid`. */
async function startUpload(wrapper, uid) {
    const rows = wrapper.findAll('.fb-choice-row');
    const row = rows.find((candidate) => candidate.html().includes(uid));
    const input = row.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', {
        value: [new File(['png-bytes'], 'a.png', { type: 'image/png' })],
        configurable: true,
    });
    await input.trigger('change');
}

/** Is the upload button for `uid`'s row showing the in-flight state? */
function rowIsUploading(wrapper, uid) {
    const row = wrapper.findAll('.fb-choice-row').find((c) => c.html().includes(uid));
    const button = row.find('.fb-choice-image-btn');

    return button.attributes('disabled') !== undefined && row.find('.fb-spinner-sm').exists();
}

function imageOf(field, uid) {
    return field.choices.find((choice) => choice._uid === uid)?.raw?.imageLink;
}

beforeEach(() => {
    loadFromBoot({
        surveyJson: {},
        runtimeContextKeys: [],
        csrf: 'test-csrf-token',
        routes: { uploadImage: UPLOAD_URL },
    });
    // Module-level registry: clear it so tests do not leak into each other.
    pendingUploads.entries.length = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
});

describe('ChoicesEditor — image upload happy path', () => {
    it('posts the file to the designer endpoint with the CSRF token', async () => {
        const picker = addField('imagepicker');
        seed(picker.name, ['a1']);
        const { fetchMock, succeedWith } = deferredFetch();
        const wrapper = mountEditor(live(picker.name));

        await startUpload(wrapper, 'a1');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(UPLOAD_URL);
        expect(init.method).toBe('POST');
        expect(init.headers['X-CSRF-TOKEN']).toBe('test-csrf-token');
        expect(init.body.get('files[]')).toBeInstanceOf(File);

        await succeedWith('https://cdn/a.png');
        expect(imageOf(live(picker.name), 'a1')).toBe('https://cdn/a.png');
    });

    it('shows the in-flight state while uploading and clears it after', async () => {
        const picker = addField('imagepicker');
        seed(picker.name, ['a1', 'a2']);
        const { succeedWith } = deferredFetch();
        const wrapper = mountEditor(live(picker.name));

        expect(rowIsUploading(wrapper, 'a1')).toBe(false);

        await startUpload(wrapper, 'a1');
        // Regression guard: a deep reactive() registry made this always false, so
        // the button stayed live and a second upload could race the first.
        expect(rowIsUploading(wrapper, 'a1')).toBe(true);
        expect(rowIsUploading(wrapper, 'a2')).toBe(false);

        await succeedWith('https://cdn/a.png');
        expect(rowIsUploading(wrapper, 'a1')).toBe(false);
        expect(pendingUploads.entries).toHaveLength(0);
    });

    it('leaves the existing image untouched when the upload fails', async () => {
        const picker = addField('imagepicker');
        setChoices(picker.name, [
            { _uid: 'a1', value: 'a1', label: { ar: 'a1', en: null }, raw: { imageLink: 'https://cdn/old.png' } },
        ]);
        const { fail } = deferredFetch();
        const wrapper = mountEditor(live(picker.name));

        await startUpload(wrapper, 'a1');
        await fail();

        expect(imageOf(live(picker.name), 'a1')).toBe('https://cdn/old.png');
        expect(pendingUploads.entries).toHaveLength(0);
    });
});

describe('ChoicesEditor — a response that lands after the world moved', () => {
    it('follows the choice when the list was reordered mid-upload', async () => {
        const picker = addField('imagepicker');
        seed(picker.name, ['a1', 'a2', 'a3']);
        const { succeedWith } = deferredFetch();
        const wrapper = mountEditor(live(picker.name));

        await startUpload(wrapper, 'a1');
        setChoices(picker.name, [...live(picker.name).choices].reverse());
        await succeedWith('https://cdn/a.png');

        expect(imageOf(live(picker.name), 'a1')).toBe('https://cdn/a.png');
        expect(imageOf(live(picker.name), 'a2')).toBeUndefined();
        expect(imageOf(live(picker.name), 'a3')).toBeUndefined();
    });

    it('routes to the originating field when another field was selected', async () => {
        const picker = addField('imagepicker');
        const other = addField('imagepicker');
        seed(picker.name, ['a1']);
        seed(other.name, ['b1']);
        const { succeedWith } = deferredFetch();
        const wrapper = mountEditor(live(picker.name));

        await startUpload(wrapper, 'a1');
        // SettingsPanel does not :key this component, so a field switch is a prop
        // change on the SAME instance — the pending request survives it.
        await wrapper.setProps({ field: live(other.name) });
        await succeedWith('https://cdn/a.png');

        expect(imageOf(live(picker.name), 'a1')).toBe('https://cdn/a.png');
        expect(imageOf(live(other.name), 'b1')).toBeUndefined();
    });

    it('still lands after the originating field was renamed', async () => {
        const picker = addField('imagepicker');
        seed(picker.name, ['a1']);
        const nameAtStart = picker.name;
        const { succeedWith } = deferredFetch();
        const wrapper = mountEditor(live(picker.name));

        await startUpload(wrapper, 'a1');
        expect(renameField(nameAtStart, 'renamed_picker')).toBeNull();
        expect(findField(nameAtStart)).toBeNull();
        await succeedWith('https://cdn/a.png');

        expect(imageOf(live('renamed_picker'), 'a1')).toBe('https://cdn/a.png');
    });

    it('discards the result when the choice was deleted mid-upload', async () => {
        const picker = addField('imagepicker');
        seed(picker.name, ['a1', 'a2']);
        const { succeedWith } = deferredFetch();
        const wrapper = mountEditor(live(picker.name));

        await startUpload(wrapper, 'a1');
        setChoices(picker.name, live(picker.name).choices.filter((c) => c._uid !== 'a1'));
        await succeedWith('https://cdn/a.png');

        const choices = live(picker.name).choices;
        expect(choices).toHaveLength(1);
        expect(choices[0]._uid).toBe('a2');
        // Must not resurrect the deleted choice or graft the link onto its neighbour.
        expect(imageOf(live(picker.name), 'a2')).toBeUndefined();
    });

    it('discards the result when the whole field was deleted mid-upload', async () => {
        const picker = addField('imagepicker');
        const other = addField('imagepicker');
        seed(picker.name, ['a1']);
        seed(other.name, ['b1']);
        const { succeedWith } = deferredFetch();
        const wrapper = mountEditor(live(picker.name));

        await startUpload(wrapper, 'a1');
        const page = store.state.pages[0];
        page.fields.splice(page.fields.findIndex((f) => f.name === picker.name), 1);
        await succeedWith('https://cdn/a.png');

        expect(imageOf(live(other.name), 'b1')).toBeUndefined();
    });
});

describe('ChoicesEditor — in-flight state is scoped and survives remounts', () => {
    it('does not disable a duplicate that shares the choice uid', async () => {
        const picker = addField('imagepicker');
        seed(picker.name, ['a1']);
        const { succeedWith } = deferredFetch();
        const wrapper = mountEditor(live(picker.name));

        await startUpload(wrapper, 'a1');
        // duplicateField structuredClones the uids and selects the copy.
        const copy = duplicateField(picker.name);
        expect(copy.choices[0]._uid).toBe('a1');

        await wrapper.setProps({ field: live(copy.name) });
        // The copy's own upload button must stay usable.
        expect(rowIsUploading(wrapper, 'a1')).toBe(false);

        await succeedWith('https://cdn/a.png');
        expect(imageOf(live(picker.name), 'a1')).toBe('https://cdn/a.png');
        expect(imageOf(live(copy.name), 'a1')).toBeUndefined();
    });

    it('keeps showing the in-flight state after a Preview-tab remount', async () => {
        const picker = addField('imagepicker');
        seed(picker.name, ['a1']);
        const { succeedWith } = deferredFetch();
        const first = mountEditor(live(picker.name));

        await startUpload(first, 'a1');
        expect(rowIsUploading(first, 'a1')).toBe(true);

        // App.vue gates the build pane with v-if, so switching to Preview and back
        // destroys and rebuilds this component while the request is still open.
        first.unmount();
        const second = mountEditor(live(picker.name));

        expect(rowIsUploading(second, 'a1')).toBe(true);

        await succeedWith('https://cdn/a.png');
        expect(rowIsUploading(second, 'a1')).toBe(false);
        expect(imageOf(live(picker.name), 'a1')).toBe('https://cdn/a.png');
        expect(pendingUploads.entries).toHaveLength(0);
    });
});

describe('ChoicesEditor — image removal and gating', () => {
    it('removes only the targeted choice\'s image', async () => {
        const picker = addField('imagepicker');
        setChoices(picker.name, [
            { _uid: 'a1', value: 'a1', label: { ar: 'a1', en: null }, raw: { imageLink: 'https://cdn/a.png', visibleIf: '{q} = 1' } },
            { _uid: 'a2', value: 'a2', label: { ar: 'a2', en: null }, raw: { imageLink: 'https://cdn/b.png' } },
        ]);
        const wrapper = mountEditor(live(picker.name));

        const row = wrapper.findAll('.fb-choice-row').find((c) => c.html().includes('a1'));
        await row.find('.fb-choice-image-remove').trigger('click');

        expect(imageOf(live(picker.name), 'a1')).toBeUndefined();
        expect(imageOf(live(picker.name), 'a2')).toBe('https://cdn/b.png');
        // Unrelated raw props must survive the removal.
        expect(live(picker.name).choices[0].raw.visibleIf).toBe('{q} = 1');
    });

    it('renders no image controls unless withImages is set', () => {
        const picker = addField('imagepicker');
        seed(picker.name, ['a1']);
        const wrapper = mount(ChoicesEditor, {
            props: { field: live(picker.name) },
            global: {
                stubs: {
                    draggable: {
                        props: ['list'],
                        template: '<div><template v-for="(element, index) in list" :key="element._uid"><slot name="item" :element="element" :index="index" /></template></div>',
                    },
                },
            },
        });

        expect(wrapper.find('.fb-choice-image').exists()).toBe(false);
        expect(wrapper.find('input[type="file"]').exists()).toBe(false);
    });
});
