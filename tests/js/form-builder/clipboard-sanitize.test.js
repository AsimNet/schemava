import { describe, it, expect, afterEach, vi } from 'vitest';
import {
    copyTextToClipboard,
    sanitizeStatementHtml,
} from '../../../resources/js/form-builder/ui-helpers.js';

describe('sanitizeStatementHtml', () => {
    it('strips <script> blocks but keeps inline formatting', () => {
        const dirty = '<p>مرحبا <b>بك</b></p><script>alert(1)</script>';
        expect(sanitizeStatementHtml(dirty)).toBe('<p>مرحبا <b>بك</b></p>');
    });

    it('strips stray script open/close tags (any attributes)', () => {
        expect(sanitizeStatementHtml('<a href="x">link</a><script src="evil.js"></script>'))
            .toBe('<a href="x">link</a>');
        expect(sanitizeStatementHtml('before</script>after')).toBe('beforeafter');
    });

    it('preserves links, headings and lists verbatim', () => {
        const html = '<h2>عنوان</h2><ul><li><a href="https://x.test">رابط</a></li></ul>';
        expect(sanitizeStatementHtml(html)).toBe(html);
    });

    it('returns an empty string for non-strings / empty input', () => {
        expect(sanitizeStatementHtml(null)).toBe('');
        expect(sanitizeStatementHtml(undefined)).toBe('');
        expect(sanitizeStatementHtml(42)).toBe('');
        expect(sanitizeStatementHtml('')).toBe('');
    });

    it('is case-insensitive about the script tag', () => {
        expect(sanitizeStatementHtml('<p>ok</p><SCRIPT>bad()</SCRIPT>')).toBe('<p>ok</p>');
    });
});

describe('copyTextToClipboard', () => {
    /** A fake `<textarea>` element captured for assertions. */
    function makeTextarea() {
        return {
            value: '',
            style: {},
            setAttribute: vi.fn(),
            focus: vi.fn(),
            select: vi.fn(),
        };
    }

    /** Build a fake `document` whose `execCommand('copy')` returns `ok`. */
    function makeDocument(textarea, ok) {
        return {
            createElement: vi.fn(() => textarea),
            body: { appendChild: vi.fn(), removeChild: vi.fn() },
            execCommand: vi.fn(() => ok),
        };
    }

    afterEach(() => {
        // `navigator` is a read-only global in modern Node, so stub/unstub rather
        // than assigning it directly.
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('returns false for empty text without touching the clipboard', async () => {
        const writeText = vi.fn();
        vi.stubGlobal('navigator', { clipboard: { writeText } });

        await expect(copyTextToClipboard('')).resolves.toBe(false);
        await expect(copyTextToClipboard(null)).resolves.toBe(false);
        expect(writeText).not.toHaveBeenCalled();
    });

    it('uses the async Clipboard API when available', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { clipboard: { writeText } });

        await expect(copyTextToClipboard('https://x.test/survey/abc')).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith('https://x.test/survey/abc');
    });

    it('falls back to a textarea + execCommand when the Clipboard API rejects', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('denied'));
        vi.stubGlobal('navigator', { clipboard: { writeText } });
        const textarea = makeTextarea();
        const doc = makeDocument(textarea, true);
        vi.stubGlobal('document', doc);

        await expect(copyTextToClipboard('link')).resolves.toBe(true);
        expect(textarea.value).toBe('link');
        expect(doc.execCommand).toHaveBeenCalledWith('copy');
        expect(doc.body.removeChild).toHaveBeenCalledWith(textarea);
    });

    it('uses the textarea fallback when there is no Clipboard API at all', async () => {
        const textarea = makeTextarea();
        vi.stubGlobal('navigator', {});
        vi.stubGlobal('document', makeDocument(textarea, true));

        await expect(copyTextToClipboard('link')).resolves.toBe(true);
        expect(textarea.value).toBe('link');
    });

    it('returns false when no clipboard mechanism exists', async () => {
        vi.stubGlobal('navigator', {});
        vi.stubGlobal('document', undefined);

        await expect(copyTextToClipboard('link')).resolves.toBe(false);
    });

    it('reports failure when execCommand reports failure', async () => {
        const textarea = makeTextarea();
        vi.stubGlobal('navigator', {});
        vi.stubGlobal('document', makeDocument(textarea, false));

        await expect(copyTextToClipboard('link')).resolves.toBe(false);
    });
});
