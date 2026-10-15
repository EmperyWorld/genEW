/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Relocate nested desktop shortcuts onto the root grid when dropped from folder windows.
 *
 * Invariants:
 * - Only items with a non-empty `parentId` are moved; root items are left unchanged.
 * - Positions use the same snap / collision rules as Content Manager → desktop drops.
 *
 * Related:
 * - desktopNestedItemDrag.ts · desktopExternalContentDrop.ts · DesktopWorkspaceContent.tsx
 */

import {
	DESKTOP_GRID,
	DESKTOP_GRID_STEPS,
	DESKTOP_ICON_SIZES,
	type GridStepPreference,
	type IconSizePreference,
} from '../constants';
import type { DesktopItem } from '../types/desktop.types';
import { findNearestFreePosition, snapToGrid } from './desktopGrid';
import { readDesktopWorkArea } from './desktopSnapGeometry';

const EXCLUDE_NONE = '__desktop_nested_drop_exclude__';

export function relocateNestedDesktopItemsToRootAtPosition(
	currentItems: DesktopItem[],
	itemIds: string[],
	dropLayoutPoint: { x: number; y: number },
	gridStepKey: GridStepPreference,
	iconSize: IconSizePreference
): DesktopItem[] {
	const orderedIds = itemIds.filter((id) => {
		const row = currentItems.find((item) => item.id === id);
		return Boolean(row?.parentId);
	});
	if (orderedIds.length === 0) return currentItems;

	const gridSize = DESKTOP_GRID_STEPS[gridStepKey];
	const wa = readDesktopWorkArea();
	const iconMetrics = DESKTOP_ICON_SIZES[iconSize] ?? DESKTOP_ICON_SIZES.medium;
	const layoutMax = {
		maxX: Math.max(DESKTOP_GRID.OFFSET, wa.width - iconMetrics.width),
		maxY: Math.max(DESKTOP_GRID.OFFSET, wa.height - iconMetrics.height),
	};

	let working = [...currentItems];
	let changed = false;

	for (const id of orderedIds) {
		const collisionItems = working.filter(
			(item) => !item.parentId && item.id !== id
		);
		const rawPos = findNearestFreePosition(
			collisionItems,
			EXCLUDE_NONE,
			dropLayoutPoint.x,
			dropLayoutPoint.y,
			gridSize,
			DESKTOP_GRID.OFFSET,
			layoutMax
		);
		const snapped = snapToGrid(
			rawPos.x,
			rawPos.y,
			gridSize,
			DESKTOP_GRID.OFFSET,
			layoutMax
		);

		const idx = working.findIndex((item) => item.id === id);
		if (idx < 0) continue;
		const row = working[idx];
		if (!row.parentId) continue;

		working = working.map((item, index) =>
			index === idx ? { ...item, parentId: undefined, position: snapped } : item
		);
		changed = true;
	}

	return changed ? working : currentItems;
}
