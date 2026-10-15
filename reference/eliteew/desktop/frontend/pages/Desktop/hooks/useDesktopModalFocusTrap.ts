/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Keeps Tab cycling inside a desktop modal root while `active` is true; focuses first
 * focusable child on open when focus is outside the root.
 *
 * Invariants:
 * - Uses shared `getFocusableElements` / `cycleTabFocusWithinContainer` from `utils/accessibility.ts`.
 * - Does not save/restore focus — pair with `saveFocus`/`restoreFocus` or `useEwaDialogFocusTrap` when needed.
 *
 * Related:
 * - src/utils/accessibility.ts
 * - src/pages/Desktop/components/AppStore.tsx
 * - documentation/product/desktop/DESKTOP-SHELL-A11Y-CHECKLIST.md
 */

import {
	cycleTabFocusWithinContainer,
	getFocusableElements,
} from '@/utils/accessibility';
import { useEffect, type RefObject } from 'react';

/**
 * Keeps Tab cycling inside `rootRef` while `active` is true (modal dialogs).
 */
export function useDesktopModalFocusTrap(
	active: boolean,
	rootRef: RefObject<HTMLElement | null>
): void {
	useEffect(() => {
		if (!active) return;
		const root = rootRef.current;
		if (!root) return;
		const raf = window.requestAnimationFrame(() => {
			const nodes = getFocusableElements(root);
			const first = nodes[0];
			if (first && !root.contains(document.activeElement)) {
				first.focus({ preventScroll: true });
			}
		});
		return () => window.cancelAnimationFrame(raf);
	}, [active, rootRef]);

	useEffect(() => {
		if (!active) return;
		const root = rootRef.current;
		if (!root) return;

		const onKeyDown = (e: KeyboardEvent): void => {
			cycleTabFocusWithinContainer(root, e);
		};

		root.addEventListener('keydown', onKeyDown);
		return () => root.removeEventListener('keydown', onKeyDown);
	}, [active, rootRef]);
}
