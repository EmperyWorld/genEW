/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Build `OpenWindowOptions` when duplicating an open desktop shell window.
 *
 * Invariants:
 * - Duplicated windows open with `forceNew` and relaxed instance limits.
 *
 * Related:
 * - hooks/useDesktopWorkspaceHandleAction.ts · hooks/useWindowManager.ts
 */

import type { DesktopItem, WindowState } from '../types/desktop.types';
import type { OpenWindowOptions } from '../hooks/useWindowManager';

const DUPLICATE_OFFSET_PX = 32;

export function resolveDesktopItemForWindow(
	window: WindowState,
	items: DesktopItem[]
): DesktopItem | null {
	if (!window.folderId) return null;
	const existing = items.find((row) => row.id === window.folderId);
	if (existing) return existing;
	return {
		id: window.folderId,
		name: window.title,
		type: window.type === 'app' ? 'app' : 'folder',
		position: { x: 0, y: 0 },
		appComponent: window.appComponent,
		icon: window.icon,
	};
}

export function buildDuplicateWindowOpenOptions(
	window: WindowState
): OpenWindowOptions {
	const offset = DUPLICATE_OFFSET_PX;
	const restoreState =
		window.isMaximized || window.isMinimized
			? undefined
			: {
					position: {
						x: window.position.x + offset,
						y: window.position.y + offset,
					},
					size: { ...window.size },
					isMinimized: false,
					isMaximized: false,
				};

	return {
		forceNew: true,
		instancePolicy: { allowMultiple: true, maxInstances: 32 },
		initialPayload: window.initialPayload
			? { ...window.initialPayload }
			: undefined,
		folderPathPrefix:
			window.type === 'folder' && window.path.length > 1
				? window.path.slice(0, -1)
				: undefined,
		restoreState,
	};
}
