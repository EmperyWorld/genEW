/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Clears root desktop icon selection (and the Assistant selection rail) on outside
 * pointer down and generic keyboard input.
 *
 * Invariants:
 * - Preserves icon keyboard nav, clipboard shortcuts, rename, and context-menu clicks.
 *
 * Related:
 * - utils/desktopShellOutsideDismiss.ts
 * - components/DesktopAssistantSelectionRail.tsx
 */

import { useEffect } from 'react';
import {
	shouldClearDesktopIconSelectionOnKeyDown,
	shouldClearDesktopIconSelectionOnPointerDown,
} from '../utils/desktopShellOutsideDismiss';
import { shouldDeferDesktopShellKeydownToFocusedSurface } from '../utils/desktopShellKeyboardCapture';

export function useDesktopIconSelectionDismiss(params: {
	selected: Set<string>;
	setSelected: (
		updater: Set<string> | ((prev: Set<string>) => Set<string>)
	) => void;
	renamingId: string | null;
	enabled?: boolean;
}): void {
	const { selected, setSelected, renamingId, enabled = true } = params;
	const hasSelection = selected.size > 0;

	useEffect(() => {
		if (!enabled || !hasSelection) return;

		const clearSelection = () => {
			setSelected(new Set());
		};

		const handlePointerDown = (event: MouseEvent) => {
			const target = event.target instanceof Element ? event.target : null;
			if (
				!shouldClearDesktopIconSelectionOnPointerDown({
					target,
				})
			) {
				return;
			}
			clearSelection();
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				!shouldClearDesktopIconSelectionOnKeyDown({
					event,
					renamingId,
					deferToFocusedSurface:
						shouldDeferDesktopShellKeydownToFocusedSurface(),
				})
			) {
				return;
			}
			clearSelection();
		};

		window.addEventListener('mousedown', handlePointerDown, true);
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('mousedown', handlePointerDown, true);
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [enabled, hasSelection, renamingId, setSelected]);
}
