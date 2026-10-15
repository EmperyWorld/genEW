/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Open windows from a saved layout preset on the active virtual desktop — replace or add mode.
 *
 * Invariants:
 * - At most 12 windows per preset apply (matches preset capture limit).
 * - Replace closes only the supplied window ids before opening preset windows.
 *
 * Related:
 * - `DesktopWorkspaceContent.tsx`, `useDesktopExpansionSettings.ts`
 */

import type { OpenWindowOptions } from '../hooks/useWindowManager';
import type { DesktopItem } from '../types/desktop.types';
import type { DesktopWindowLayoutPreset } from '../types/desktopExpansion.types';

export const DESKTOP_WINDOW_LAYOUT_PRESET_APPLY_LIMIT = 12;

export type ApplyDesktopWindowLayoutPresetMode = 'replace' | 'add';

export type ApplyDesktopWindowLayoutPresetParams = {
	preset: DesktopWindowLayoutPreset;
	catalog: DesktopItem[];
	openWindow: (item: DesktopItem, options?: OpenWindowOptions) => void;
	mode: ApplyDesktopWindowLayoutPresetMode;
	/** Required when mode is `replace`. */
	closeWindow?: (windowId: string) => void;
	currentDesktopWindowIds?: readonly string[];
};

export type ApplyDesktopWindowLayoutPresetResult = {
	openedCount: number;
	skippedCount: number;
};

/**
 * Applies a window layout preset: optionally closes current desktop windows, then opens preset entries.
 */
export function applyDesktopWindowLayoutPresetWindows(
	params: ApplyDesktopWindowLayoutPresetParams
): ApplyDesktopWindowLayoutPresetResult {
	const {
		preset,
		catalog,
		openWindow,
		mode,
		closeWindow,
		currentDesktopWindowIds,
	} = params;

	if (mode === 'replace') {
		if (!closeWindow || !currentDesktopWindowIds) {
			throw new Error(
				'applyDesktopWindowLayoutPresetWindows: replace mode requires closeWindow and currentDesktopWindowIds'
			);
		}
		for (const windowId of currentDesktopWindowIds) {
			closeWindow(windowId);
		}
	}

	let openedCount = 0;
	let skippedCount = 0;

	for (const snapshot of preset.windows.slice(
		0,
		DESKTOP_WINDOW_LAYOUT_PRESET_APPLY_LIMIT
	)) {
		const app =
			snapshot.appComponent != null
				? catalog.find(
						(candidate) => candidate.appComponent === snapshot.appComponent
					)
				: undefined;
		const folder =
			snapshot.folderId != null
				? catalog.find((candidate) => candidate.id === snapshot.folderId)
				: undefined;
		const item = app ?? folder;
		if (!item) {
			skippedCount += 1;
			continue;
		}
		openWindow(item, {
			forceNew: true,
			restoreState: {
				position: snapshot.position,
				size: snapshot.size,
				isMinimized: snapshot.isMinimized,
				isMaximized: snapshot.isMaximized,
			},
			initialPayload: snapshot.initialPayload,
		});
		openedCount += 1;
	}

	return { openedCount, skippedCount };
}

/**
 * Whether applying a preset should prompt replace/add when windows exist on the desktop.
 */
export function shouldPromptDesktopWindowLayoutPresetApply(
	currentDesktopWindowCount: number
): boolean {
	return currentDesktopWindowCount > 0;
}
