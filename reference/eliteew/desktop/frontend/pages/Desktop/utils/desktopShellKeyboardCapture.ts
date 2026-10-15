/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Decide when global desktop shell `window` key handlers should defer to the focused surface.
 *
 * Invariants:
 * - Returns false when focus is on `document.body` or nowhere (shell may handle shortcuts).
 * - Shell overlay surfaces (`data-desktop-shell-keyboard-surface`) always defer.
 *
 * Related:
 * - hooks/useKeyboardShortcuts.ts
 * - hooks/useDesktopClipboard.ts
 */

/**
 * When `true`, global desktop shell `window` key handlers should not run,
 * so the focused surface (embedded app, dialog, text field, iframe) handles the key.
 */
export function shouldDeferDesktopShellKeydownToFocusedSurface(): boolean {
	if (typeof document === 'undefined') return false;

	const ae = document.activeElement;
	if (!ae || ae === document.body) return false;
	if (ae instanceof HTMLIFrameElement) return true;
	if (!(ae instanceof Element)) return false;

	if (ae.closest('[data-desktop-window], .desktop-window-root')) return true;
	if (ae.closest('[role="dialog"]')) return true;
	if (ae.closest('[data-desktop-shell-keyboard-surface]')) return true;

	const el = ae as HTMLElement;
	if (el.isContentEditable) return true;

	const tag = el.tagName;
	if (tag === 'TEXTAREA') {
		return !(el as HTMLTextAreaElement).disabled;
	}
	if (tag === 'SELECT') {
		return !(el as HTMLSelectElement).disabled;
	}
	if (tag === 'INPUT') {
		const inp = el as HTMLInputElement;
		if (inp.disabled) return false;
		const t = inp.type;
		if (
			t === 'checkbox' ||
			t === 'radio' ||
			t === 'button' ||
			t === 'submit' ||
			t === 'reset' ||
			t === 'file' ||
			t === 'hidden' ||
			t === 'range' ||
			t === 'color' ||
			t === 'image'
		) {
			return false;
		}
		return true;
	}

	return false;
}
