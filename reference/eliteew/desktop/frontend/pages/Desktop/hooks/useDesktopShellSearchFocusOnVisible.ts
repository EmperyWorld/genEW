/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Focus Start Menu / Quick Search input on open and when the tab becomes visible again.
 *
 * Invariants:
 * - Respects touch-primary no-autofocus policy via `focusDesktopShellSearchInput`.
 *
 * Related:
 * - utils/desktopShellSearchAutofocus.ts
 * - components/StartMenu.tsx, components/QuickSearch.tsx
 */

import { useEffect, type RefObject } from 'react';

import { focusDesktopShellSearchInput } from '../utils/desktopShellSearchAutofocus';
import { subscribeDocumentVisibleSync } from '../utils/subscribeDocumentVisibleSync';

export function useDesktopShellSearchFocusOnVisible(
	inputRef: RefObject<HTMLInputElement | null>,
	isOpen: boolean
): void {
	useEffect(() => {
		if (!isOpen) return;

		const focus = () => focusDesktopShellSearchInput(inputRef.current);

		focus();
		return subscribeDocumentVisibleSync(focus);
	}, [isOpen, inputRef]);
}
