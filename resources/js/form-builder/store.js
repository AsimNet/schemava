/**
 * Builder store — a single Vue `reactive()` State plus mutating actions.
 * No Pinia. The State shape mirrors the model layer (see model/serialize.js):
 *
 *   State = { meta, pages, surveyTexts, rawSurveyProps, contentLocale }
 *   Page  = { name, title, fields }
 *   Field = { name, type, label, description, placeholder, required, hidden,
 *             defaultValue?, defaultValueExpression?, choices?, quiz?, logic?,
 *             typeProps, raw }
 *
 * Serialization lives in the model layer; the store only owns the editable
 * State and selection/dirty bookkeeping.
 */

import { reactive } from 'vue';
import { fromSurveyJson, toSurveyJson, nextFieldName } from './model/serialize.js';
import { FIELD_TYPES, ADVANCED_TYPE } from './model/fieldTypes.js';
import { emptyLStr, isEmptyLStr } from './model/localized.js';
import { makeChoice } from './ui-helpers.js';
import { t } from './i18n.js';

/**
 * Default Arabic choice labels seeded onto a freshly added choice field, so the
 * canvas card shows what the component outputs the moment it is dropped. Values
 * mirror the Arabic label (the legacy string-item rule, via `makeChoice`).
 * Imported empty-choice fields are untouched — this lives in field creation only.
 *
 * @type {string[]}
 */
export const DEFAULT_CHOICE_LABELS = ['الخيار 1', 'الخيار 2', 'الخيار 3'];

/** Builder types that should be seeded with {@link DEFAULT_CHOICE_LABELS}. */
const SEEDED_CHOICE_TYPES = ['single_choice', 'multi_choice', 'dropdown'];

export const store = reactive({
    state: null,
    selectedFieldName: null,
    dirty: false,
    runtimeContextKeys: [],
    variableMeta: {},
    boot: {},
    /**
     * Name of a field whose inline label input should grab focus on its next
     * render. Set by add-question affordances (fix 1) so the user is nudged to
     * type a title immediately; the card clears it once focus is applied.
     *
     * @type {string|null}
     */
    focusFieldName: null,
    /**
     * Name of a field that was *just* added (palette click, add-question menu,
     * or duplicate) and whose canvas card should play a one-shot enter animation
     * on its next mount. Purely presentational — it never affects serialization,
     * drag order, or any flow; the card clears it once the animation is kicked
     * off. Distinguishes a genuine add from initial paint / reorder re-renders.
     *
     * @type {string|null}
     */
    justAddedFieldName: null,
    /**
     * Active workspace tab — 'build' (palette/canvas/settings) or 'preview'.
     * Lifted into the store so the AI proposal gate can switch to the preview
     * tab from a store action (see {@link previewAiProposal}). App.vue and
     * BuilderHeader read/write it through {@link setActiveTab}.
     *
     * @type {'build'|'preview'}
     */
    activeTab: 'build',
    /**
     * A pending AI-generated SurveyJS proposal awaiting the user's decision,
     * stored verbatim as returned by the model (raw JSON object) — or null when
     * none is pending. Setting it never mutates the live canvas; the user must
     * approve ({@link applyAiProposal}) or decline ({@link discardAiProposal}).
     *
     * @type {object|null}
     */
    aiProposal: null,
    /**
     * Whether the Preview tab is currently showing the pending {@link aiProposal}
     * instead of the live state. Cleared when the proposal is applied/discarded
     * or the user returns to the build tab.
     *
     * @type {boolean}
     */
    aiProposalPreview: false,
    /**
     * A SurveyJS JSON snapshot of the state that an applied proposal replaced,
     * enabling one-step undo ({@link undoLastApply}); null when there is nothing
     * to undo.
     *
     * @type {object|null}
     */
    undoSnapshot: null,
    /**
     * Id of the source-agnostic undo toast currently on screen (the one whose
     * action restores {@link undoSnapshot}), or null. Tracked so a new apply or a
     * completed undo can dismiss the stale toast first — its handler must never
     * restore a snapshot a newer apply has already overwritten.
     *
     * @type {number|null}
     */
    undoToastId: null,
});

/**
 * Request that the inline label of the field named `name` receive focus on its
 * next render (consumed by {@link module:components/FieldCard}).
 *
 * @param {string|null} name
 * @returns {void}
 */
export function requestLabelFocus(name) {
    store.focusFieldName = name ?? null;
}

/** Clear a pending label-focus request once it has been applied. */
export function clearLabelFocus() {
    store.focusFieldName = null;
}

/**
 * Mark the field named `name` as just-added so its card plays a one-shot enter
 * animation on mount (consumed by {@link module:components/FieldCard}). Purely
 * presentational; pass null to clear.
 *
 * @param {string|null} name
 * @returns {void}
 */
export function markFieldAdded(name) {
    store.justAddedFieldName = name ?? null;
}

/** Clear the just-added marker once its enter animation has been kicked off. */
export function clearFieldAdded() {
    store.justAddedFieldName = null;
}

/**
 * Switch the active workspace tab ('build' | 'preview'). Leaving the preview
 * tab also exits AI-proposal-preview mode so the live canvas is what shows the
 * next time preview is opened. Unknown values fall back to 'build'.
 *
 * @param {'build'|'preview'} tab
 * @returns {void}
 */
export function setActiveTab(tab) {
    const next = tab === 'preview' ? 'preview' : 'build';
    if (next !== 'preview') {
        store.aiProposalPreview = false;
    }
    store.activeTab = next;
}

/** Collect every field name currently in use across all pages. */
function collectFieldNames() {
    const names = new Set();
    if (!store.state) {
        return names;
    }
    for (const page of store.state.pages) {
        for (const field of page.fields) {
            if (field.name) {
                names.add(field.name);
            }
        }
    }

    return names;
}

/** Produce a fresh unique field name. */
export function nextName() {
    return nextFieldName(collectFieldNames());
}

/* --------------------------------------------------------------- toasts */

/**
 * Transient toast notifications, rendered by the Toaster component. Each entry
 * is `{ id, message, kind, action? }`; `kind` is 'error' | 'success' | 'info'.
 * `action` (optional) is `{ label, handler }` — when present the Toaster renders
 * an inline button labelled `label` that runs `handler` then dismisses the toast.
 *
 * @typedef {{ label: string, handler: () => void }} ToastAction
 * @type {{ items: Array<{id: number, message: string, kind: string, action: ToastAction|null}> }}
 */
export const toasts = reactive({ items: [] });

let toastId = 0;

/**
 * Push a transient toast that auto-dismisses after `duration` ms.
 *
 * @param {string} message  already-translated message text
 * @param {'error'|'success'|'info'} [kind]
 * @param {number} [duration]
 * @param {ToastAction|null} [action]  optional `{ label, handler }` action button
 * @returns {number} the toast id (for manual dismissal)
 */
export function pushToast(message, kind = 'info', duration = 4000, action = null) {
    toastId += 1;
    const id = toastId;
    const normalizedAction = action && typeof action.handler === 'function'
        ? { label: String(action.label ?? ''), handler: action.handler }
        : null;
    toasts.items.push({ id, message: String(message ?? ''), kind, action: normalizedAction });
    if (duration > 0 && typeof setTimeout === 'function') {
        setTimeout(() => dismissToast(id), duration);
    }

    return id;
}

/** Remove a toast by id. */
export function dismissToast(id) {
    const index = toasts.items.findIndex((toast) => toast.id === id);
    if (index !== -1) {
        toasts.items.splice(index, 1);
    }
}

/** Deep clone via structuredClone with a JSON fallback. */
function clone(value) {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch {
            /* fall through */
        }
    }

    return JSON.parse(JSON.stringify(value));
}

/** Build a brand-new field of the given builder type with sane defaults. */
function makeField(typeId) {
    const def = FIELD_TYPES[typeId];
    const type = def ? typeId : ADVANCED_TYPE;
    const baseTypeProps = def ? clone(def.typeProps ?? {}) : {};

    // yes_no ships with explicit Arabic true/false labels so the mobile renderer
    // shows نعم/لا regardless of locale fallbacks (serialized verbatim).
    if (type === 'yes_no') {
        baseTypeProps.labelTrue = { ar: 'نعم', en: null };
        baseTypeProps.labelFalse = { ar: 'لا', en: null };
    }

    const field = {
        name: nextName(),
        type,
        label: emptyLStr(),
        description: null,
        placeholder: null,
        requiredErrorText: null,
        required: false,
        hidden: typeId === 'hidden_value',
        readOnly: false,
        choices: def?.hasChoices ? defaultChoices(type) : null,
        quiz: null,
        logic: null,
        typeProps: baseTypeProps,
        raw: {},
    };

    return field;
}

/**
 * Initial choices for a freshly created field. Choice fields start with three
 * Arabic defaults so the card immediately reflects the component's output;
 * everything else starts empty.
 *
 * @param {string} type
 * @returns {Array<{value: string, label: {ar: string, en: string|null}, raw: object}>}
 */
function defaultChoices(type) {
    if (!SEEDED_CHOICE_TYPES.includes(type)) {
        return [];
    }

    return DEFAULT_CHOICE_LABELS.map((label) => makeChoice(label));
}

export function loadFromBoot(bootPayload) {
    const json = bootPayload?.surveyJson ?? {};
    store.boot = bootPayload ?? {};
    store.state = reactive(fromSurveyJson(json));
    store.runtimeContextKeys = Array.isArray(bootPayload?.runtimeContextKeys)
        ? bootPayload.runtimeContextKeys
        : [];
    store.variableMeta = bootPayload?.variableMeta && typeof bootPayload.variableMeta === 'object'
        ? bootPayload.variableMeta
        : {};

    // Title/description sourced from the DB columns take precedence on first load
    // (mirrors the legacy view, which overwrote the survey JSON title/description).
    const schema = bootPayload?.schema ?? {};
    if (typeof schema.title === 'string' && schema.title !== '' && isEmptyLStr(store.state.meta.title)) {
        store.state.meta.title = { ar: schema.title, en: null };
    }
    if (
        typeof schema.description === 'string'
        && schema.description !== ''
        && isEmptyLStr(store.state.meta.description)
    ) {
        store.state.meta.description = { ar: schema.description, en: null };
    }

    store.selectedFieldName = null;
    store.dirty = false;
    store.aiProposal = null;
    store.aiProposalPreview = false;
    store.undoSnapshot = null;
    store.undoToastId = null;
}

/**
 * Replace the whole editable State from a parsed SurveyJS JSON object (used by
 * the AI proposal gate, the JSON panel, and undo). Preserves the current
 * selection when the same field name still exists, marks the document dirty,
 * and keeps the active content locale. Any pending AI proposal is dropped so a
 * direct replacement (e.g. JSON-panel apply) never leaves an orphan proposal;
 * the internal callers ({@link applyAiProposal}/{@link undoLastApply}) have
 * already settled the proposal/snapshot state before calling this.
 *
 * @param {object} json  raw SurveyJS JSON
 */
export function replaceStateFromJson(json) {
    const previousSelection = store.selectedFieldName;
    const previousLocale = store.state?.contentLocale ?? 'ar';
    const next = reactive(fromSurveyJson(json));
    next.contentLocale = previousLocale;
    store.state = next;
    store.selectedFieldName = previousSelection && findField(previousSelection)
        ? previousSelection
        : null;
    store.aiProposal = null;
    store.aiProposalPreview = false;
    markDirty();
}

/* ---------------------------------------------------- AI proposal gate */

/**
 * Serialize the *current* live state to a SurveyJS JSON snapshot (lossless
 * serializer round-trip; selection/dirty are not part of the snapshot). Returns
 * null when there is no state to snapshot.
 *
 * @returns {object|null}
 */
function snapshotCurrentState() {
    if (!store.state) {
        return null;
    }

    return toSurveyJson(store.state, { runtimeContextKeys: store.runtimeContextKeys ?? [] });
}

/**
 * Stage an AI-generated SurveyJS JSON object as a pending proposal. Does NOT
 * mutate the live canvas — the user previews then approves or declines it.
 * A new proposal supersedes any prior pending one (and exits a stale preview).
 *
 * @param {object} json  raw SurveyJS JSON as returned by the model
 * @returns {void}
 */
export function setAiProposal(json) {
    store.aiProposal = json && typeof json === 'object' ? json : null;
    store.aiProposalPreview = false;
}

/**
 * Approve the pending proposal: snapshot the current state into `undoSnapshot`
 * (for one-step undo), replace the live state with the proposal, then clear the
 * pending proposal + preview flag. No-op (returns false) when nothing pending.
 *
 * Fires a source-agnostic undo toast (carrying a `تراجع` action) so undo is
 * reachable regardless of which surface applied the proposal (chat card or
 * preview banner), which tab is active, or whether the AI panel is open. Any
 * stale undo toast is dismissed first so its action can never restore an
 * outdated snapshot.
 *
 * @returns {boolean} whether a proposal was applied
 */
export function applyAiProposal() {
    if (!store.aiProposal) {
        return false;
    }
    dismissUndoToast();
    const proposal = store.aiProposal;
    store.undoSnapshot = snapshotCurrentState();
    store.aiProposal = null;
    store.aiProposalPreview = false;
    replaceStateFromJson(proposal);

    store.undoToastId = pushToast(t('aiApplied'), 'success', 8000, {
        label: t('aiUndo'),
        handler: () => undoLastApply(),
    });

    return true;
}

/**
 * Decline the pending proposal: clear it and exit preview mode. The live state
 * and any existing `undoSnapshot` are left untouched.
 *
 * @returns {void}
 */
export function discardAiProposal() {
    store.aiProposal = null;
    store.aiProposalPreview = false;
}

/**
 * Enter preview-of-proposal mode and switch to the Preview tab so the pending
 * proposal renders there. No-op when nothing is pending.
 *
 * @returns {void}
 */
export function previewAiProposal() {
    if (!store.aiProposal) {
        return;
    }
    store.aiProposalPreview = true;
    setActiveTab('preview');
}

/** Exit preview-of-proposal mode, falling back to the live state in preview. */
export function exitProposalPreview() {
    store.aiProposalPreview = false;
}

/** Dismiss the tracked undo toast (if any) and forget its id. */
function dismissUndoToast() {
    if (store.undoToastId != null) {
        dismissToast(store.undoToastId);
        store.undoToastId = null;
    }
}

/**
 * Undo the most recently applied proposal by restoring the captured snapshot,
 * then clear the snapshot (single step only). Selection resets as part of the
 * restore. Dismisses the undo toast and surfaces a brief "reverted" toast. No-op
 * (returns false) when there is nothing to undo.
 *
 * @returns {boolean} whether an apply was undone
 */
export function undoLastApply() {
    if (!store.undoSnapshot) {
        return false;
    }
    dismissUndoToast();
    const snapshot = store.undoSnapshot;
    store.undoSnapshot = null;
    replaceStateFromJson(snapshot);

    pushToast(t('aiUndone'), 'info');

    return true;
}

/**
 * Set a survey-level text override (`completeText`, `completedHtml`, …) as an
 * LStr; an empty LStr removes the override so the Arabic default re-applies.
 *
 * @param {string} key
 * @param {{ar?: string, en?: string|null}} lstr
 */
export function setSurveyText(key, lstr) {
    if (!store.state) {
        return;
    }
    if (!store.state.surveyTexts) {
        store.state.surveyTexts = {};
    }
    if (isEmptyLStr(lstr)) {
        delete store.state.surveyTexts[key];
    } else {
        store.state.surveyTexts[key] = lstr;
    }
    markDirty();
}

export function markDirty() {
    store.dirty = true;
}

export function markClean() {
    store.dirty = false;
}

/** Locate a field plus its page index/field index by name. */
export function findField(name) {
    if (!store.state) {
        return null;
    }
    for (let p = 0; p < store.state.pages.length; p += 1) {
        const fields = store.state.pages[p].fields;
        for (let f = 0; f < fields.length; f += 1) {
            if (fields[f].name === name) {
                return { field: fields[f], pageIndex: p, fieldIndex: f };
            }
        }
    }

    return null;
}

export function selectedField() {
    if (!store.selectedFieldName) {
        return null;
    }
    const found = findField(store.selectedFieldName);

    return found ? found.field : null;
}

export function selectField(name) {
    store.selectedFieldName = name;
}

/**
 * Add a new field of `typeId` to `pageIndex`. When `index` is omitted it is
 * appended; otherwise it is inserted at that position. Returns the new field.
 */
export function addField(typeId, pageIndex = 0, index = null) {
    if (!store.state) {
        return null;
    }
    const page = store.state.pages[pageIndex] ?? store.state.pages[0];
    if (!page) {
        return null;
    }
    const field = makeField(typeId);
    const at = index === null || index === undefined ? page.fields.length : index;
    page.fields.splice(at, 0, field);
    store.selectedFieldName = field.name;
    store.justAddedFieldName = field.name;
    markDirty();

    return field;
}

/**
 * Builder types whose canvas card has NO inline label input, so an auto-focus
 * request would be a no-op (statement edits html; image/hidden_value have no
 * title row). Used to skip the focus nudge for those types.
 *
 * @type {string[]}
 */
const NO_INLINE_LABEL_TYPES = ['statement', 'image', 'hidden_value'];

/**
 * Add a question of `typeId` to `pageIndex` (appended) and, when the type has an
 * inline label input, request that it auto-focus so the user names it right away
 * (fix 1 — the Google-Forms-style "add question" affordance). Returns the field.
 *
 * @param {string} typeId
 * @param {number} pageIndex
 * @returns {object|null}
 */
export function addQuestionToPage(typeId, pageIndex = 0) {
    const field = addField(typeId, pageIndex, null);
    if (field && !NO_INLINE_LABEL_TYPES.includes(field.type)) {
        requestLabelFocus(field.name);
    }

    return field;
}

/** Add a field after the currently-selected one, or at the end of its page. */
export function addFieldSmart(typeId) {
    if (!store.state) {
        return null;
    }
    const found = store.selectedFieldName ? findField(store.selectedFieldName) : null;
    if (found) {
        return addField(typeId, found.pageIndex, found.fieldIndex + 1);
    }

    return addField(typeId, 0, null);
}

export function duplicateField(name) {
    const found = findField(name);
    if (!found) {
        return null;
    }
    const copy = clone(found.field);
    copy.name = nextName();
    store.state.pages[found.pageIndex].fields.splice(found.fieldIndex + 1, 0, copy);
    store.selectedFieldName = copy.name;
    store.justAddedFieldName = copy.name;
    markDirty();

    return copy;
}

export function removeField(name) {
    const found = findField(name);
    if (!found) {
        return;
    }
    store.state.pages[found.pageIndex].fields.splice(found.fieldIndex, 1);
    if (store.selectedFieldName === name) {
        store.selectedFieldName = null;
    }
    markDirty();
}

/** Patch arbitrary props on a field; nested objects are merged shallowly. */
export function updateField(name, patch) {
    const found = findField(name);
    if (!found) {
        return;
    }
    Object.assign(found.field, patch);
    markDirty();
}

/** Patch a single key inside a field's `typeProps`. */
export function updateTypeProp(name, key, value) {
    const found = findField(name);
    if (!found) {
        return;
    }
    found.field.typeProps = { ...found.field.typeProps, [key]: value };
    markDirty();
}

/**
 * Replace a field's choices wholesale. `choices` is an array of
 * `{value, label:{ar,en}, raw?}`. No-op for an unknown field.
 */
export function setChoices(name, choices) {
    const found = findField(name);
    if (!found) {
        return;
    }
    found.field.choices = Array.isArray(choices) ? choices : [];
    markDirty();
}

/**
 * Replace a field's logic block (`{action,match,rules}` | `{advanced}` | null).
 */
export function setLogic(name, logic) {
    const found = findField(name);
    if (!found) {
        return;
    }
    found.field.logic = logic ?? null;
    markDirty();
}

/**
 * Replace a field's quiz block (`{correct, score}` | null).
 */
export function setQuiz(name, quiz) {
    const found = findField(name);
    if (!found) {
        return;
    }
    found.field.quiz = quiz ?? null;
    markDirty();
}

/**
 * Set the field prefill, routing it to `defaultValueExpression` when the value
 * contains a `{variable}` reference, or `defaultValue` otherwise. Clears the
 * other slot so only one ever serializes. An empty value clears both.
 */
export function setPrefill(name, value, isExpression) {
    const found = findField(name);
    if (!found) {
        return;
    }
    const field = found.field;
    const empty = value === '' || value === null || value === undefined;

    if (empty) {
        field.defaultValue = undefined;
        field.defaultValueExpression = undefined;
    } else if (isExpression) {
        field.defaultValueExpression = value;
        field.defaultValue = undefined;
    } else {
        field.defaultValue = value;
        field.defaultValueExpression = undefined;
    }
    markDirty();
}

/**
 * Fields (excluding `name`, in document order) whose logic references `name`.
 * Used to confirm before deleting a referenced field.
 *
 * @param {string} name
 * @returns {Array<{name: string, label: {ar: string, en: string|null}}>}
 */
export function fieldsReferencing(name) {
    if (!store.state) {
        return [];
    }
    const dependents = [];
    for (const page of store.state.pages) {
        for (const field of page.fields) {
            if (field.name === name) {
                continue;
            }
            if (logicReferencesField(field.logic, name)) {
                dependents.push({ name: field.name, label: field.label });
            }
        }
    }

    return dependents;
}

/** Does a logic block reference `targetName` in any of its rules? */
function logicReferencesField(logic, targetName) {
    if (!logic || typeof logic !== 'object' || !Array.isArray(logic.rules)) {
        return false;
    }

    return logic.rules.some((rule) => rule && rule.field === targetName);
}

/**
 * Remove a field and drop any rules in *other* fields' logic that referenced
 * it (emptying logic that becomes ruleless). Mirrors `removeField` selection
 * bookkeeping.
 */
export function removeFieldCascade(name) {
    const found = findField(name);
    if (!found) {
        return;
    }

    for (const page of store.state.pages) {
        for (const field of page.fields) {
            if (field.name === name) {
                continue;
            }
            if (!logicReferencesField(field.logic, name)) {
                continue;
            }
            const rules = field.logic.rules.filter((rule) => rule && rule.field !== name);
            field.logic = rules.length > 0 ? { ...field.logic, rules } : null;
        }
    }

    store.state.pages[found.pageIndex].fields.splice(found.fieldIndex, 1);
    if (store.selectedFieldName === name) {
        store.selectedFieldName = null;
    }
    markDirty();
}

/**
 * Prior fields (across all pages, in document order) that appear before
 * `name`, for use as logic-rule targets. Excludes the field itself, hidden
 * advanced fields without a name, and the target field.
 *
 * @param {string} name
 * @returns {Array<{name: string, type: string, label: {ar: string, en: string|null}}>}
 */
export function priorFields(name) {
    if (!store.state) {
        return [];
    }
    const out = [];
    for (const page of store.state.pages) {
        for (const field of page.fields) {
            if (field.name === name) {
                return out;
            }
            if (field.name) {
                out.push({ name: field.name, type: field.type, label: field.label });
            }
        }
    }

    return out;
}

/**
 * Replace every exact `{oldName}` token with `{newName}` inside a SurveyJS
 * expression string (the canonical piping/logic token format). Other tokens are
 * left untouched; non-strings pass through unchanged.
 *
 * @param {unknown} expression
 * @param {string} oldName
 * @param {string} newName
 * @returns {unknown}
 */
function replaceFieldToken(expression, oldName, newName) {
    if (typeof expression !== 'string' || expression === '') {
        return expression;
    }

    return expression.split(`{${oldName}}`).join(`{${newName}}`);
}

/**
 * Rewrite references to a renamed field across ALL fields: visual logic rule
 * targets, raw `logic.advanced` expression tokens, and `defaultValueExpression`
 * tokens. Keeps logic/piping pointing at the field after a rename instead of
 * silently dangling.
 *
 * The renamed field itself is included: an imported field may carry a
 * self-reference (e.g. `visibleIf: "{self} notempty"` or
 * `defaultValueExpression: "{self}"`), and since `oldName` is freed by the
 * rename and names are unique, an `{oldName}` token can only mean this field —
 * so rewriting it to `{newName}` is correct (and idempotent).
 *
 * @param {string} oldName
 * @param {string} newName
 * @returns {void}
 */
function updateFieldReferences(oldName, newName) {
    if (!store.state || oldName === newName) {
        return;
    }
    for (const page of store.state.pages) {
        for (const field of page.fields) {
            const logic = field.logic;
            if (logic && Array.isArray(logic.rules)) {
                for (const rule of logic.rules) {
                    if (rule && rule.field === oldName) {
                        rule.field = newName;
                    }
                }
            }
            if (logic && typeof logic.advanced === 'string') {
                logic.advanced = replaceFieldToken(logic.advanced, oldName, newName);
            }

            if (typeof field.defaultValueExpression === 'string') {
                field.defaultValueExpression = replaceFieldToken(field.defaultValueExpression, oldName, newName);
            }
        }
    }
}

/**
 * Rename a field. Returns an error key when the name is invalid/duplicate,
 * or null on success. Caller surfaces the message via i18n. On success, every
 * field's logic rules / advanced expressions / defaultValueExpression are
 * updated to track the new name — including the renamed field's own
 * self-references (fix: no stale `{oldName}` references anywhere).
 */
export function renameField(name, nextValue) {
    const trimmed = (nextValue ?? '').trim();
    if (trimmed === '') {
        return 'fieldNameRequired';
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
        return 'fieldNameInvalid';
    }
    const names = collectFieldNames();
    names.delete(name);
    if (names.has(trimmed)) {
        return 'fieldNameDuplicate';
    }
    const found = findField(name);
    if (!found) {
        return null;
    }
    found.field.name = trimmed;
    updateFieldReferences(name, trimmed);
    if (store.selectedFieldName === name) {
        store.selectedFieldName = trimmed;
    }
    markDirty();

    return null;
}

export function addPage() {
    if (!store.state) {
        return null;
    }
    const names = new Set(store.state.pages.map((p) => p.name));
    let n = store.state.pages.length + 1;
    let pageName = `page${n}`;
    while (names.has(pageName)) {
        n += 1;
        pageName = `page${n}`;
    }
    const page = { name: pageName, title: null, fields: [] };
    store.state.pages.push(page);
    markDirty();

    return page;
}

export function removePage(pageIndex) {
    if (!store.state || store.state.pages.length <= 1) {
        return;
    }
    const [removed] = store.state.pages.splice(pageIndex, 1);
    if (removed && store.selectedFieldName) {
        const stillExists = findField(store.selectedFieldName);
        if (!stillExists) {
            store.selectedFieldName = null;
        }
    }
    markDirty();
}

/**
 * Move a page from `from` to `to`, clamping both indices to the valid range.
 * Selection is keyed by field name so it stays stable across the reorder.
 * No-op when the move would change nothing or there is no state.
 *
 * @param {number} from
 * @param {number} to
 * @returns {void}
 */
export function movePage(from, to) {
    if (!store.state) {
        return;
    }
    const pages = store.state.pages;
    const last = pages.length - 1;
    if (last < 1) {
        return;
    }
    const a = Math.max(0, Math.min(last, from));
    const b = Math.max(0, Math.min(last, to));
    if (a === b) {
        return;
    }
    const [moved] = pages.splice(a, 1);
    pages.splice(b, 0, moved);
    markDirty();
}

export function setPageTitle(pageIndex, lstr) {
    const page = store.state?.pages[pageIndex];
    if (!page) {
        return;
    }
    page.title = isEmptyLStr(lstr) ? null : lstr;
    markDirty();
}

export function setContentLocale(locale) {
    if (!store.state) {
        return;
    }
    store.state.contentLocale = locale === 'en' ? 'en' : 'ar';
}

/** Count fields flagged as quiz questions (used for the header points badge). */
export function quizFieldCount() {
    if (!store.state) {
        return 0;
    }
    let count = 0;
    for (const page of store.state.pages) {
        for (const field of page.fields) {
            if (field.quiz) {
                count += 1;
            }
        }
    }

    return count;
}

/** Sum of quiz points across all quiz fields. */
export function totalQuizPoints() {
    if (!store.state) {
        return 0;
    }
    let total = 0;
    for (const page of store.state.pages) {
        for (const field of page.fields) {
            if (field.quiz) {
                total += Number(field.quiz.score ?? 1) || 0;
            }
        }
    }

    return total;
}
