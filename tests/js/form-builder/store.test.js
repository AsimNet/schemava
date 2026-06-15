import { describe, it, expect, beforeEach } from 'vitest';
import {
    store,
    loadFromBoot,
    addField,
    addPage,
    movePage,
    addQuestionToPage,
    renameField,
    findField,
    setActiveTab,
    setAiProposal,
    applyAiProposal,
    discardAiProposal,
    previewAiProposal,
    exitProposalPreview,
    undoLastApply,
    toasts,
    pushToast,
    dismissToast,
    DEFAULT_CHOICE_LABELS,
} from '../../../resources/js/form-builder/store.js';
import { toSurveyJson } from '../../../resources/js/form-builder/model/serialize.js';

/** Boot the store with an empty survey before each case. */
beforeEach(() => {
    loadFromBoot({ surveyJson: {}, runtimeContextKeys: [] });
});

describe('store — default choices on creation (fix 1)', () => {
    for (const type of ['single_choice', 'multi_choice', 'dropdown']) {
        it(`seeds ${type} with three Arabic default choices`, () => {
            const field = addField(type);
            expect(field.choices).toHaveLength(3);
            expect(field.choices.map((choice) => choice.label.ar)).toEqual(DEFAULT_CHOICE_LABELS);
            // English starts unset (Arabic-only) and the value mirrors the Arabic label.
            for (const choice of field.choices) {
                expect(choice.label.en).toBeNull();
                expect(choice.value).toBe(choice.label.ar);
            }
        });
    }

    it('keeps non-choice fields with null choices', () => {
        expect(addField('short_text').choices).toBeNull();
        expect(addField('rating').choices).toBeNull();
        expect(addField('yes_no').choices).toBeNull();
    });

    it('serializes the default choices as plain Arabic string items', () => {
        const field = addField('single_choice');
        const json = toSurveyJson(store.state, { runtimeContextKeys: [] });
        const element = json.pages[0].elements.find((el) => el.name === field.name);
        expect(element.choices).toEqual(['الخيار 1', 'الخيار 2', 'الخيار 3']);
    });
});

describe('store — yes_no Arabic defaults (fix 2)', () => {
    it('seeds labelTrue/labelFalse with نعم/لا as LStr on creation', () => {
        const field = addField('yes_no');
        expect(field.typeProps.labelTrue).toEqual({ ar: 'نعم', en: null });
        expect(field.typeProps.labelFalse).toEqual({ ar: 'لا', en: null });
    });

    it('serializes explicit Arabic labelTrue/labelFalse strings', () => {
        const field = addField('yes_no');
        const json = toSurveyJson(store.state, { runtimeContextKeys: [] });
        const element = json.pages[0].elements.find((el) => el.name === field.name);
        expect(element.type).toBe('boolean');
        expect(element.labelTrue).toBe('نعم');
        expect(element.labelFalse).toBe('لا');
    });

    it('does not seed labels onto imported yes_no fields without labels', () => {
        // Imported (not created) — fromSurveyJson must leave labels untouched.
        loadFromBoot({
            surveyJson: { pages: [{ name: 'p1', elements: [{ type: 'boolean', name: 'q1', title: 'موافق؟' }] }] },
            runtimeContextKeys: [],
        });
        const json = toSurveyJson(store.state, { runtimeContextKeys: [] });
        const element = json.pages[0].elements.find((el) => el.name === 'q1');
        expect(element.labelTrue).toBeUndefined();
        expect(element.labelFalse).toBeUndefined();
    });
});

describe('store — movePage (fix 8)', () => {
    /** Build a 3-page survey and return the page names in order. */
    function pageNames() {
        return store.state.pages.map((page) => page.name);
    }

    beforeEach(() => {
        loadFromBoot({ surveyJson: {}, runtimeContextKeys: [] });
        addPage();
        addPage();
    });

    it('moves a page down, shifting the rest', () => {
        const [a, b, c] = pageNames();
        movePage(0, 2);
        expect(pageNames()).toEqual([b, c, a]);
    });

    it('moves a page up', () => {
        const [a, b, c] = pageNames();
        movePage(2, 0);
        expect(pageNames()).toEqual([c, a, b]);
    });

    it('clamps out-of-range indices', () => {
        const [a, b, c] = pageNames();
        movePage(0, 99);
        expect(pageNames()).toEqual([b, c, a]);
        movePage(99, 0);
        expect(pageNames()).toEqual([a, b, c]);
    });

    it('is a no-op when from === to', () => {
        const before = pageNames();
        store.dirty = false;
        movePage(1, 1);
        expect(pageNames()).toEqual(before);
        expect(store.dirty).toBe(false);
    });

    it('keeps the selected field stable across a reorder', () => {
        const field = addField('short_text', 0);
        expect(store.selectedFieldName).toBe(field.name);
        movePage(0, 2);
        // The field travelled with its page; selection (by name) is unchanged.
        expect(store.selectedFieldName).toBe(field.name);
        const movedPage = store.state.pages[2];
        expect(movedPage.fields.some((f) => f.name === field.name)).toBe(true);
    });

    it('does nothing with a single page', () => {
        loadFromBoot({ surveyJson: {}, runtimeContextKeys: [] });
        store.dirty = false;
        movePage(0, 0);
        expect(store.state.pages).toHaveLength(1);
        expect(store.dirty).toBe(false);
    });
});

describe('store — renameField updates references', () => {
    /**
     * Boot a 3-field survey: a source field `src`, a dependent whose visible
     * logic + defaultValueExpression reference `src`, and an advanced-logic
     * field whose raw expression references `src`. An unrelated rule on the
     * dependent must survive the rename untouched.
     */
    beforeEach(() => {
        loadFromBoot({
            surveyJson: {
                pages: [{
                    name: 'p1',
                    elements: [
                        { type: 'text', name: 'other', title: 'آخر', inputType: 'text' },
                        { type: 'text', name: 'src', title: 'مصدر', inputType: 'text' },
                        {
                            type: 'text', name: 'dep', title: 'تابع', inputType: 'text',
                            visibleIf: "({src} = 'yes') and ({other} = 'x')",
                            defaultValueExpression: '{src}',
                        },
                        {
                            type: 'text', name: 'adv', title: 'متقدم', inputType: 'text',
                            visibleIf: 'age({src}) > 18',
                        },
                    ],
                }],
            },
            runtimeContextKeys: [],
        });
    });

    it('rewrites a referencing field logic rule to the new name', () => {
        expect(renameField('src', 'income')).toBeNull();
        const dep = findField('dep').field;
        const rule = dep.logic.rules.find((r) => r.field === 'income');
        expect(rule).toBeTruthy();
        // No rule still points at the old name.
        expect(dep.logic.rules.some((r) => r.field === 'src')).toBe(false);
    });

    it('leaves unrelated rules untouched', () => {
        renameField('src', 'income');
        const dep = findField('dep').field;
        expect(dep.logic.rules.some((r) => r.field === 'other')).toBe(true);
    });

    it('rewrites {oldName} tokens inside a raw advanced expression', () => {
        renameField('src', 'income');
        const adv = findField('adv').field;
        expect(adv.logic.advanced).toBe('age({income}) > 18');
    });

    it('rewrites {oldName} tokens inside defaultValueExpression', () => {
        renameField('src', 'income');
        const dep = findField('dep').field;
        expect(dep.defaultValueExpression).toBe('{income}');
    });

    it('serializes the renamed references into the survey JSON', () => {
        renameField('src', 'income');
        const json = toSurveyJson(store.state, { runtimeContextKeys: [] });
        const dep = json.pages[0].elements.find((el) => el.name === 'dep');
        const adv = json.pages[0].elements.find((el) => el.name === 'adv');
        expect(dep.visibleIf).toContain('{income}');
        expect(dep.visibleIf).not.toContain('{src}');
        expect(dep.defaultValueExpression).toBe('{income}');
        expect(adv.visibleIf).toBe('age({income}) > 18');
    });

    it('does not touch a field that does not reference the renamed field', () => {
        renameField('src', 'income');
        const other = findField('other').field;
        expect(other.logic).toBeNull();
        expect(other.defaultValueExpression).toBeUndefined();
    });

    it('returns an error key for a duplicate name and changes nothing', () => {
        expect(renameField('src', 'other')).toBe('fieldNameDuplicate');
        expect(findField('src')).toBeTruthy();
        const dep = findField('dep').field;
        expect(dep.defaultValueExpression).toBe('{src}');
    });
});

describe('store — renameField updates a field\'s own self-references', () => {
    /**
     * Imported fields can reference themselves: `sref` has a canonical visible
     * rule and a defaultValueExpression both pointing at `{sref}`, and `aref`
     * has a non-canonical (advanced) self-referencing visibleIf. Renaming such
     * a field must rewrite its OWN stale `{oldName}` tokens, not just other
     * fields' references (regression: the renamed field used to be skipped).
     */
    beforeEach(() => {
        loadFromBoot({
            surveyJson: {
                pages: [{
                    name: 'p1',
                    elements: [
                        {
                            type: 'text', name: 'sref', title: 'ذاتي', inputType: 'text',
                            visibleIf: '({sref} notempty)',
                            defaultValueExpression: '{sref}',
                        },
                        {
                            type: 'text', name: 'aref', title: 'ذاتي متقدم', inputType: 'text',
                            visibleIf: "contains({aref}, 'x')",
                        },
                    ],
                }],
            },
            runtimeContextKeys: [],
        });
    });

    it('rewrites a self-referencing logic rule and defaultValueExpression', () => {
        expect(renameField('sref', 'self_q')).toBeNull();
        const field = findField('self_q').field;
        expect(field.logic.rules.some((r) => r.field === 'self_q')).toBe(true);
        expect(field.logic.rules.some((r) => r.field === 'sref')).toBe(false);
        expect(field.defaultValueExpression).toBe('{self_q}');
    });

    it('rewrites a self-referencing advanced expression', () => {
        renameField('aref', 'adv_self');
        const field = findField('adv_self').field;
        expect(field.logic.advanced).toBe("contains({adv_self}, 'x')");
    });

    it('serializes self-references with no stale {oldName} tokens', () => {
        renameField('sref', 'self_q');
        renameField('aref', 'adv_self');
        const json = toSurveyJson(store.state, { runtimeContextKeys: [] });
        const sref = json.pages[0].elements.find((el) => el.name === 'self_q');
        const aref = json.pages[0].elements.find((el) => el.name === 'adv_self');
        expect(sref.visibleIf).toContain('{self_q}');
        expect(sref.visibleIf).not.toContain('{sref}');
        expect(sref.defaultValueExpression).toBe('{self_q}');
        expect(aref.visibleIf).toBe("contains({adv_self}, 'x')");
    });
});

describe('store — addQuestionToPage label-focus request (fix 1)', () => {
    beforeEach(() => {
        loadFromBoot({ surveyJson: {}, runtimeContextKeys: [] });
        addPage();
    });

    it('adds the question to the given page and selects it', () => {
        const field = addQuestionToPage('short_text', 1);
        expect(field).toBeTruthy();
        expect(store.state.pages[1].fields.some((f) => f.name === field.name)).toBe(true);
        expect(store.selectedFieldName).toBe(field.name);
    });

    it('requests label focus for types with an inline label', () => {
        const field = addQuestionToPage('short_text', 0);
        expect(store.focusFieldName).toBe(field.name);
    });

    it('does not request label focus for types without an inline label', () => {
        for (const type of ['statement', 'image', 'hidden_value']) {
            store.focusFieldName = null;
            addQuestionToPage(type, 0);
            expect(store.focusFieldName).toBeNull();
        }
    });
});

describe('store — AI proposal gate (approve / decline / undo)', () => {
    /** A small but non-trivial valid SurveyJS proposal the model might return. */
    function sampleProposal() {
        return {
            title: 'استبيان مقترح',
            pages: [{
                name: 'page1',
                elements: [
                    { type: 'text', name: 'fullName', title: 'الاسم', inputType: 'text' },
                    { type: 'radiogroup', name: 'agree', title: 'موافق؟', choices: ['نعم', 'لا'] },
                ],
            }],
        };
    }

    /** Serialize the current live state to comparable SurveyJS JSON. */
    function liveJson() {
        return toSurveyJson(store.state, { runtimeContextKeys: store.runtimeContextKeys ?? [] });
    }

    /** Seed a distinct existing form so before/after comparisons are meaningful. */
    beforeEach(() => {
        loadFromBoot({
            surveyJson: {
                title: 'النموذج الأصلي',
                pages: [{
                    name: 'p1',
                    elements: [{ type: 'comment', name: 'notes', title: 'ملاحظات' }],
                }],
            },
            runtimeContextKeys: [],
        });
    });

    it('setAiProposal stages the proposal without mutating state', () => {
        const before = liveJson();
        setAiProposal(sampleProposal());

        expect(store.aiProposal).toEqual(sampleProposal());
        expect(store.aiProposalPreview).toBe(false);
        expect(store.undoSnapshot).toBeNull();
        // The live canvas is untouched.
        expect(liveJson()).toEqual(before);
        expect(findField('notes')).toBeTruthy();
        expect(findField('fullName')).toBeNull();
    });

    it('previewAiProposal flips the flag and switches to the preview tab', () => {
        setAiProposal(sampleProposal());
        previewAiProposal();

        expect(store.aiProposalPreview).toBe(true);
        expect(store.activeTab).toBe('preview');
    });

    it('exitProposalPreview / leaving the build tab clears proposal-preview only', () => {
        setAiProposal(sampleProposal());
        previewAiProposal();

        exitProposalPreview();
        expect(store.aiProposalPreview).toBe(false);
        // The proposal itself is still pending — only the preview was exited.
        expect(store.aiProposal).toEqual(sampleProposal());

        previewAiProposal();
        setActiveTab('build');
        expect(store.aiProposalPreview).toBe(false);
        expect(store.activeTab).toBe('build');
        expect(store.aiProposal).toEqual(sampleProposal());
    });

    it('applyAiProposal replaces state AND snapshots the prior state', () => {
        const before = liveJson();
        setAiProposal(sampleProposal());

        const applied = applyAiProposal();
        expect(applied).toBe(true);

        // State now reflects the proposal.
        expect(findField('fullName')).toBeTruthy();
        expect(findField('agree')).toBeTruthy();
        expect(findField('notes')).toBeNull();

        // Proposal + preview cleared; an undo snapshot of the prior state captured.
        expect(store.aiProposal).toBeNull();
        expect(store.aiProposalPreview).toBe(false);
        expect(store.undoSnapshot).toEqual(before);

        // No-op when nothing is pending.
        expect(applyAiProposal()).toBe(false);
    });

    it('discardAiProposal clears the proposal without mutating state or snapshot', () => {
        const before = liveJson();
        setAiProposal(sampleProposal());
        store.undoSnapshot = { sentinel: true };

        discardAiProposal();

        expect(store.aiProposal).toBeNull();
        expect(store.aiProposalPreview).toBe(false);
        // Live state untouched and any pre-existing snapshot left alone.
        expect(liveJson()).toEqual(before);
        expect(store.undoSnapshot).toEqual({ sentinel: true });
    });

    it('undoLastApply restores the exact prior survey JSON, then no-ops', () => {
        const before = liveJson();
        setAiProposal(sampleProposal());
        applyAiProposal();

        // Sanity: state actually changed before undo.
        expect(liveJson()).not.toEqual(before);

        const undone = undoLastApply();
        expect(undone).toBe(true);
        // Round-trip equality: the restored form serializes identically to the original.
        expect(liveJson()).toEqual(before);
        expect(store.undoSnapshot).toBeNull();

        // Single step only — a second undo does nothing.
        expect(undoLastApply()).toBe(false);
        expect(liveJson()).toEqual(before);
    });

    it('a second proposal supersedes the first', () => {
        const first = sampleProposal();
        const second = {
            pages: [{ name: 'page1', elements: [{ type: 'text', name: 'email', title: 'البريد', inputType: 'email' }] }],
        };

        setAiProposal(first);
        previewAiProposal();
        expect(store.aiProposalPreview).toBe(true);

        setAiProposal(second);
        // The pending proposal is now the second one; stale preview is reset.
        expect(store.aiProposal).toEqual(second);
        expect(store.aiProposalPreview).toBe(false);

        // Applying takes the second proposal, not the first.
        applyAiProposal();
        expect(findField('email')).toBeTruthy();
        expect(findField('fullName')).toBeNull();
        expect(findField('agree')).toBeNull();
    });

    it('applying then discarding leaves no orphan proposal but keeps undo available', () => {
        setAiProposal(sampleProposal());
        applyAiProposal();
        expect(store.undoSnapshot).not.toBeNull();

        // A subsequent (no-op) discard must not wipe the undo snapshot.
        discardAiProposal();
        expect(store.aiProposal).toBeNull();
        expect(store.undoSnapshot).not.toBeNull();
        expect(undoLastApply()).toBe(true);
    });
});

describe('store — pushToast action field', () => {
    beforeEach(() => {
        // Drain any toasts left over from a prior case so assertions on the tail
        // of the list are deterministic.
        toasts.items.splice(0, toasts.items.length);
    });

    it('defaults action to null and keeps existing 2-arg callers working', () => {
        const id = pushToast('hello', 'error', 0);
        const toast = toasts.items.find((item) => item.id === id);
        expect(toast).toMatchObject({ id, message: 'hello', kind: 'error', action: null });
    });

    it('stores a normalized { label, handler } action when one is supplied', () => {
        const handler = () => {};
        const id = pushToast('with action', 'info', 0, { label: 'تراجع', handler });
        const toast = toasts.items.find((item) => item.id === id);
        expect(toast.action).toEqual({ label: 'تراجع', handler });
        expect(typeof toast.action.handler).toBe('function');
    });

    it('ignores an action that has no callable handler', () => {
        const id = pushToast('bad action', 'info', 0, { label: 'x' });
        const toast = toasts.items.find((item) => item.id === id);
        expect(toast.action).toBeNull();
    });
});

describe('store — source-agnostic undo toast', () => {
    /** A valid SurveyJS proposal distinct from the seeded form. */
    function sampleProposal() {
        return {
            title: 'استبيان مقترح',
            pages: [{
                name: 'page1',
                elements: [{ type: 'text', name: 'fullName', title: 'الاسم', inputType: 'text' }],
            }],
        };
    }

    /** Serialize the current live state to comparable SurveyJS JSON. */
    function liveJson() {
        return toSurveyJson(store.state, { runtimeContextKeys: store.runtimeContextKeys ?? [] });
    }

    /** The most recently pushed toast (tail of the list). */
    function latestToast() {
        return toasts.items[toasts.items.length - 1] ?? null;
    }

    beforeEach(() => {
        loadFromBoot({
            surveyJson: {
                title: 'النموذج الأصلي',
                pages: [{ name: 'p1', elements: [{ type: 'comment', name: 'notes', title: 'ملاحظات' }] }],
            },
            runtimeContextKeys: [],
        });
        toasts.items.splice(0, toasts.items.length);
    });

    it('applyAiProposal pushes a toast whose action restores the pre-apply state', () => {
        const before = liveJson();
        setAiProposal(sampleProposal());
        applyAiProposal();

        // State reflects the proposal, and a tracked undo toast carrying an action exists.
        expect(findField('fullName')).toBeTruthy();
        const toast = toasts.items.find((item) => item.id === store.undoToastId);
        expect(toast).toBeTruthy();
        expect(toast.kind).toBe('success');
        expect(typeof toast.action?.handler).toBe('function');

        // Running the action restores the exact prior survey JSON.
        toast.action.handler();
        expect(liveJson()).toEqual(before);
        expect(findField('fullName')).toBeNull();
        expect(findField('notes')).toBeTruthy();
    });

    it('a second apply dismisses the prior undo toast (no duplicate undo toasts)', () => {
        setAiProposal(sampleProposal());
        applyAiProposal();
        const firstToastId = store.undoToastId;
        expect(toasts.items.some((item) => item.id === firstToastId)).toBe(true);

        // Stage and apply a second proposal while the first undo toast is showing.
        setAiProposal({
            pages: [{ name: 'page1', elements: [{ type: 'text', name: 'email', title: 'البريد', inputType: 'email' }] }],
        });
        applyAiProposal();

        // The stale undo toast is gone; only the new one remains tracked.
        expect(toasts.items.some((item) => item.id === firstToastId)).toBe(false);
        expect(store.undoToastId).not.toBe(firstToastId);
        const undoToasts = toasts.items.filter((item) => item.action && item.kind === 'success');
        expect(undoToasts).toHaveLength(1);
        expect(undoToasts[0].id).toBe(store.undoToastId);
    });

    it('undoLastApply clears the snapshot, dismisses the undo toast, and pushes the undone toast', () => {
        setAiProposal(sampleProposal());
        applyAiProposal();
        const undoToastId = store.undoToastId;

        const undone = undoLastApply();
        expect(undone).toBe(true);
        expect(store.undoSnapshot).toBeNull();
        // The undo toast is dismissed and its tracking id cleared.
        expect(toasts.items.some((item) => item.id === undoToastId)).toBe(false);
        expect(store.undoToastId).toBeNull();
        // A brief "reverted" info toast is surfaced.
        const last = latestToast();
        expect(last.kind).toBe('info');
        expect(last.action).toBeNull();
    });

    it('the undo toast action is one-shot — re-running it after undo is a no-op', () => {
        const before = liveJson();
        setAiProposal(sampleProposal());
        applyAiProposal();
        const toast = toasts.items.find((item) => item.id === store.undoToastId);

        toast.action.handler();
        expect(liveJson()).toEqual(before);

        // The snapshot is consumed; running the captured handler again does nothing.
        const restored = liveJson();
        toast.action.handler();
        expect(liveJson()).toEqual(restored);
    });
});
