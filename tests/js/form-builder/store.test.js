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
    addCalculatedValue,
    updateCalculatedValue,
    removeCalculatedValue,
    renameCalculatedValue,
    allFieldEntries,
    addTemplateField,
    removeTemplateField,
    updateTemplateField,
    setTemplateFieldChoices,
    reorderTemplateFields,
    addTemplateQuestion,
    addFieldSmart,
    updateField,
    setChoices,
    removeField,
    duplicateField,
} from '../../../resources/js/form-builder/store.js';
import { toSurveyJson } from '../../../resources/js/form-builder/model/serialize.js';
import { renameChoiceLabel as renameChoiceLabelHelper } from '../../../resources/js/form-builder/ui-helpers.js';

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

describe('store — calculated values (HSB-45)', () => {
    it('addCalculatedValue appends an entry with a fresh unique name', () => {
        const a = addCalculatedValue();
        const b = addCalculatedValue();
        expect(a.name).toBe('calc_1');
        expect(b.name).toBe('calc_2');
        expect(store.state.calculatedValues).toEqual([
            { name: 'calc_1', expression: '', includeIntoResult: false, raw: {} },
            { name: 'calc_2', expression: '', includeIntoResult: false, raw: {} },
        ]);
    });

    it('a fresh name never collides with an existing field name', () => {
        const field = addField('short_text', 0);
        renameField(field.name, 'calc_1');
        const cv = addCalculatedValue();
        expect(cv.name).toBe('calc_2');
    });

    it('updateCalculatedValue patches expression/includeIntoResult in place', () => {
        addCalculatedValue();
        updateCalculatedValue(0, { expression: '{q_1} * 2', includeIntoResult: true });
        expect(store.state.calculatedValues[0]).toMatchObject({
            expression: '{q_1} * 2',
            includeIntoResult: true,
        });
    });

    it('removeCalculatedValue drops the entry at index', () => {
        addCalculatedValue();
        addCalculatedValue();
        removeCalculatedValue(0);
        expect(store.state.calculatedValues.map((c) => c.name)).toEqual(['calc_2']);
    });

    it('renameCalculatedValue rejects an empty/invalid/duplicate name', () => {
        addCalculatedValue();
        addCalculatedValue();
        expect(renameCalculatedValue(0, '')).toBe('fieldNameRequired');
        expect(renameCalculatedValue(0, '1bad')).toBe('fieldNameInvalid');
        expect(renameCalculatedValue(0, 'calc_2')).toBe('fieldNameDuplicate');
    });

    it('renameCalculatedValue rejects a name already used by a field', () => {
        const field = addField('short_text', 0);
        addCalculatedValue();
        expect(renameCalculatedValue(0, field.name)).toBe('fieldNameDuplicate');
    });

    it('renameCalculatedValue succeeds with a valid unique name', () => {
        addCalculatedValue();
        expect(renameCalculatedValue(0, 'total_score')).toBeNull();
        expect(store.state.calculatedValues[0].name).toBe('total_score');
    });

    it('allFieldEntries lists every named field across all pages in document order', () => {
        const f1 = addField('short_text', 0);
        addPage();
        const f2 = addField('number', 1);
        expect(allFieldEntries().map((f) => f.name)).toEqual([f1.name, f2.name]);
    });
});

describe('store — panel_dynamic template authoring', () => {
    it('a fresh panel seeds one starter template question (no dead preview)', () => {
        const panel = addField('panel_dynamic');
        expect(panel.typeProps.templateElements).toHaveLength(1);
        expect(panel.typeProps.templateElements[0].type).toBe('short_text');
        expect(panel.typeProps.templateElements[0].name).not.toBe(panel.name);
    });

    it('addTemplateField appends a new sub-question and marks dirty', () => {
        const panel = addField('panel_dynamic');
        store.dirty = false;

        const sub = addTemplateField(panel.name, 'short_text');

        expect(sub).toBeTruthy();
        expect(panel.typeProps.templateElements).toHaveLength(2);
        expect(panel.typeProps.templateElements[1]).toBe(sub);
        expect(store.dirty).toBe(true);
    });

    it('addTemplateField is a no-op for a non-panel_dynamic field', () => {
        const field = addField('short_text');
        expect(addTemplateField(field.name, 'number')).toBeNull();
    });

    it('template question names stay unique against top-level field names', () => {
        const panel = addField('panel_dynamic');
        const sub = addTemplateField(panel.name, 'short_text');
        // Adding a top-level field must not collide with the nested name.
        const other = addField('short_text');
        expect(other.name).not.toBe(sub.name);
        expect(other.name).not.toBe(panel.name);
    });

    it('updateTemplateField patches props on the sub-question in place', () => {
        const panel = addField('panel_dynamic');
        const sub = addTemplateField(panel.name, 'short_text');

        updateTemplateField(panel.name, sub.name, { required: true });

        expect(panel.typeProps.templateElements[1].required).toBe(true);
    });

    it('setTemplateFieldChoices replaces a sub-question\'s choices wholesale', () => {
        const panel = addField('panel_dynamic');
        const sub = addTemplateField(panel.name, 'single_choice');

        const next = [{ value: 'a', label: { ar: 'أ', en: null }, raw: {} }];
        setTemplateFieldChoices(panel.name, sub.name, next);

        expect(panel.typeProps.templateElements[1].choices).toEqual(next);
    });

    it('removeTemplateField removes only the targeted sub-question', () => {
        const panel = addField('panel_dynamic');
        const first = addTemplateField(panel.name, 'short_text');
        const second = addTemplateField(panel.name, 'number');

        removeTemplateField(panel.name, first.name);

        expect(panel.typeProps.templateElements).toHaveLength(2);
        expect(panel.typeProps.templateElements[1]).toBe(second);
    });

    it('reorderTemplateFields replaces the whole template list (drag reorder)', () => {
        const panel = addField('panel_dynamic');
        const first = addTemplateField(panel.name, 'short_text');
        const second = addTemplateField(panel.name, 'number');

        reorderTemplateFields(panel.name, [second, first]);

        expect(panel.typeProps.templateElements.map((f) => f.name)).toEqual([second.name, first.name]);
    });
});

describe('store — template sub-questions are first-class fields', () => {
    it('findField resolves a template sub-question with its parent panel', () => {
        const panel = addField('panel_dynamic');
        const sub = addTemplateField(panel.name, 'short_text');

        const found = findField(sub.name);

        expect(found).toBeTruthy();
        // Name identity (not object identity): findField walks the reactive
        // store, so it returns the proxy wrapper of the same underlying field.
        expect(found.field.name).toBe(sub.name);
        expect(found.parent?.name).toBe(panel.name);
        // Index 1: index 0 is the starter question seeded on panel creation.
        expect(found.fieldIndex).toBe(1);
    });

    it('findField returns parent: null for top-level fields', () => {
        const field = addField('short_text');
        expect(findField(field.name).parent).toBeNull();
    });

    it('addTemplateQuestion inserts at an index, selects, and requests focus', () => {
        const panel = addField('panel_dynamic');
        const [seeded] = panel.typeProps.templateElements;
        const first = addTemplateField(panel.name, 'short_text');

        const sub = addTemplateQuestion(panel.name, 'number', 0);

        expect(panel.typeProps.templateElements.map((f) => f.name)).toEqual([sub.name, seeded.name, first.name]);
        expect(store.selectedFieldName).toBe(sub.name);
        expect(store.justAddedFieldName).toBe(sub.name);
        expect(store.focusFieldName).toBe(sub.name);
    });

    it('updateField / setChoices reach template sub-questions by name', () => {
        const panel = addField('panel_dynamic');
        const sub = addTemplateField(panel.name, 'single_choice');

        updateField(sub.name, { required: true });
        const next = [{ value: 'x', label: { ar: 'س', en: null }, raw: {} }];
        setChoices(sub.name, next);

        expect(sub.required).toBe(true);
        expect(sub.choices).toEqual(next);
    });

    it('removeField removes a template sub-question from its panel', () => {
        const panel = addField('panel_dynamic');
        const [seeded] = panel.typeProps.templateElements;
        const first = addTemplateField(panel.name, 'short_text');
        const second = addTemplateField(panel.name, 'number');
        store.selectedFieldName = first.name;

        removeField(first.name);

        expect(panel.typeProps.templateElements.map((f) => f.name)).toEqual([seeded.name, second.name]);
        expect(store.selectedFieldName).toBeNull();
        // Top-level fields are untouched (the panel itself survives).
        expect(findField(panel.name)).toBeTruthy();
    });

    it('duplicateField duplicates a sub-question inside the same panel with a fresh name', () => {
        const panel = addField('panel_dynamic');
        const sub = addTemplateField(panel.name, 'short_text');
        sub.label.ar = 'الاسم';

        const copy = duplicateField(sub.name);

        expect(panel.typeProps.templateElements).toHaveLength(3);
        expect(panel.typeProps.templateElements[2]).toBe(copy);
        expect(copy.name).not.toBe(sub.name);
        expect(copy.label.ar).toBe('الاسم');
        expect(store.selectedFieldName).toBe(copy.name);
    });

    it('duplicating a whole panel renames its template children (no collisions)', () => {
        const panel = addField('panel_dynamic');
        addTemplateField(panel.name, 'short_text');
        addTemplateField(panel.name, 'number');

        const copy = duplicateField(panel.name);

        const originalNames = [panel.name, ...panel.typeProps.templateElements.map((f) => f.name)];
        const copyNames = [copy.name, ...copy.typeProps.templateElements.map((f) => f.name)];
        // Every copied name is fresh…
        for (const name of copyNames) {
            expect(originalNames).not.toContain(name);
        }
        // …and unique within the copy.
        expect(new Set(copyNames).size).toBe(copyNames.length);
        // Structure and content survive the clone (seeded starter + two adds).
        expect(copy.typeProps.templateElements).toHaveLength(3);
        expect(copy.typeProps.templateElements[1].type).toBe('short_text');
        expect(copy.typeProps.templateElements[2].type).toBe('number');
    });

    it('addFieldSmart inserts after the selected sub-question inside the panel', () => {
        const panel = addField('panel_dynamic');
        const first = addTemplateField(panel.name, 'short_text');
        addTemplateField(panel.name, 'number');
        store.selectedFieldName = first.name;

        const added = addFieldSmart('yes_no');

        // [seeded, first, added, number]
        expect(panel.typeProps.templateElements.map((f) => f.name)[2]).toBe(added.name);
        expect(panel.typeProps.templateElements).toHaveLength(4);
    });

    it('addFieldSmart falls back to after the parent panel for a panel_dynamic pick', () => {
        const panel = addField('panel_dynamic');
        const sub = addTemplateField(panel.name, 'short_text');
        store.selectedFieldName = sub.name;

        const added = addFieldSmart('panel_dynamic');

        // No panel-in-panel: the new panel lands top-level, right after its
        // would-be host (seeded starter + sub stay inside the original).
        expect(panel.typeProps.templateElements).toHaveLength(2);
        const names = store.state.pages[0].fields.map((f) => f.name);
        expect(names).toEqual([panel.name, added.name]);
    });

    it('renameField renames a sub-question and rejects duplicates across scopes', () => {
        const panel = addField('panel_dynamic');
        const sub = addTemplateField(panel.name, 'short_text');
        const top = addField('short_text');

        expect(renameField(sub.name, top.name)).toBe('fieldNameDuplicate');
        expect(renameField(sub.name, 'employee_name')).toBeNull();
        expect(sub.name).toBe('employee_name');
    });
});

describe('store — multipletext default items', () => {
    it('seeds two items with unique names so a fresh question actually renders', () => {
        const field = addField('multipletext');
        const items = field.typeProps.items;
        expect(items).toHaveLength(2);
        expect(items.map((item) => item.name)).toEqual(['item_1', 'item_2']);
        expect(items[0].title.ar).not.toBe('');
        // Serializes with the items attached (the pre-fix output had none).
        const json = toSurveyJson(store.state, { runtimeContextKeys: [] });
        const element = json.pages[0].elements[0];
        expect(element.items).toHaveLength(2);
        expect(element.items[0].name).toBe('item_1');
    });
});

describe('store — static panel (question group) container', () => {
    it('a fresh group seeds one starter question and accepts more', () => {
        const group = addField('panel');
        expect(group.typeProps.templateElements).toHaveLength(1);

        const sub = addTemplateField(group.name, 'dropdown');
        expect(group.typeProps.templateElements).toHaveLength(2);
        expect(findField(sub.name).parent?.name).toBe(group.name);
    });

    it('nested-aware ops work inside a group (update/duplicate/remove)', () => {
        const group = addField('panel');
        const sub = addTemplateField(group.name, 'short_text');

        updateField(sub.name, { required: true });
        expect(sub.required).toBe(true);

        const copy = duplicateField(sub.name);
        expect(group.typeProps.templateElements.map((f) => f.name)).toContain(copy.name);

        removeField(copy.name);
        expect(group.typeProps.templateElements.map((f) => f.name)).not.toContain(copy.name);
    });

    it('addFieldSmart refuses containers inside a group (adds after it instead)', () => {
        const group = addField('panel');
        const sub = addTemplateField(group.name, 'short_text');
        store.selectedFieldName = sub.name;

        const addedPanel = addFieldSmart('panel_dynamic');
        const addedGroup = addFieldSmart('panel');

        const topNames = store.state.pages[0].fields.map((f) => f.name);
        expect(topNames).toContain(addedPanel.name);
        expect(topNames).toContain(addedGroup.name);
        // Only the seeded starter + sub stayed inside.
        expect(group.typeProps.templateElements).toHaveLength(2);
    });

    it('a group serializes its children as SurveyJS `elements`', () => {
        const group = addField('panel');
        const json = toSurveyJson(store.state, { runtimeContextKeys: [] });
        const element = json.pages[0].elements.find((el) => el.name === group.name);
        expect(element.type).toBe('panel');
        expect(Array.isArray(element.elements)).toBe(true);
        expect(element.elements).toHaveLength(1);
    });
});

describe('store — EN content locale: seeds and edits stay in sync across locales', () => {
    beforeEach(() => {
        loadFromBoot({ surveyJson: {}, runtimeContextKeys: [] });
        store.state.contentLocale = 'en';
    });

    it('seeds choice defaults into the EN slot with mirrored values', () => {
        const field = addField('single_choice');
        for (const choice of field.choices) {
            expect(choice.label.ar).toBe('');
            expect(choice.label.en).toMatch(/^Option /);
            expect(choice.value).toBe(choice.label.en);
        }
    });

    it('matrix seeded rows/columns land in the EN slot', () => {
        const field = addField('matrix');
        expect(field.typeProps.rows[0].label.en).toBe('Row 1');
        expect(field.typeProps.rows[0].label.ar).toBe('');
        expect(field.typeProps.columns[0].label.en).toBe('Column 1');
    });

    it('EN-authored choices serialize with a non-empty default (Arabic preview shows them)', () => {
        const field = addField('single_choice');
        const json = toSurveyJson(store.state, { runtimeContextKeys: [] });
        const element = json.pages[0].elements.find((el) => el.name === field.name);
        for (const item of element.choices) {
            const text = typeof item === 'string' ? item : item.text;
            const def = typeof text === 'string' ? text : text.default;
            expect(def).toBeTruthy();
            expect(def).not.toBe('');
        }
    });

    it('renaming an EN-slot choice keeps the value mirrored while ar is empty', () => {
        const field = addField('single_choice');
        const renamed = [...field.choices];
        renamed[0] = { ...renamed[0] };
        // simulate the card's rename path
        const next = renameChoiceLabelHelper(renamed[0], 'en', 'Strongly agree');
        expect(next.value).toBe('Strongly agree');
        expect(next.label.en).toBe('Strongly agree');
    });
});
