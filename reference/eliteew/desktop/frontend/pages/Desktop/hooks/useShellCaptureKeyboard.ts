/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared capture-phase window keydown registration for desktop shell overlays.
 *
 * Invariants:
 * - Listener runs in capture phase so bubble shell handlers (taskbar, workspace) defer.
 * - Handlers must call preventDefault/stopPropagation when consuming a key.
 *
 * Related:
 * - utils/desktopShellKeyboardCapture.ts
 * - TaskSwitcher.tsx, ShortcutsHelpModal.tsx, CommandPalette.tsx, QuickSearch.tsx, StartMenu.tsx
 * - AppStore.tsx, ClipboardManager.tsx, ModalAdvanced.tsx
 */

import { useEffect, useRef } from 'react';

export type UseShellCaptureEscapeOptions = {
	/** Return true when Escape was consumed without calling `onEscape`. */
	onLayer?: () => boolean;
};

/** Return true when Escape cleared a non-empty search/query field instead of closing. */
export function consumeEscapeForSearchClear(
	search: string,
	clearSearch: () => void
): boolean {
	if (search.trim().length > 0) {
		clearSearch();
		return true;
	}
	return false;
}

/** Bubble-phase Escape on a focused search input (fallback when capture hook is inactive). */
export function handleSearchFieldEscapeKeyDown(
	event: Pick<KeyboardEvent, 'key' | 'preventDefault' | 'stopPropagation'>,
	search: string,
	clearSearch: () => void
): void {
	if (event.key !== 'Escape') return;
	if (consumeEscapeForSearchClear(search, clearSearch)) {
		event.preventDefault();
		event.stopPropagation();
	}
}

/** Capture-phase keydown while a shell overlay is active. */
export function useShellCaptureKeyboard(
	isActive: boolean,
	handler: (event: KeyboardEvent) => void
): void {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useEffect(() => {
		if (!isActive) return;
		const listener = (event: KeyboardEvent) => handlerRef.current(event);
		window.addEventListener('keydown', listener, { capture: true });
		return () =>
			window.removeEventListener('keydown', listener, { capture: true });
	}, [isActive]);
}

/** Capture Escape with preventDefault + stopPropagation, then `onEscape`. */
export function useShellCaptureEscape(
	isActive: boolean,
	onEscape: () => void,
	options?: UseShellCaptureEscapeOptions
): void {
	const onEscapeRef = useRef(onEscape);
	onEscapeRef.current = onEscape;
	const onLayerRef = useRef(options?.onLayer);
	onLayerRef.current = options?.onLayer;

	useShellCaptureKeyboard(isActive, (event) => {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		if (onLayerRef.current?.()) return;
		onEscapeRef.current();
	});
}
