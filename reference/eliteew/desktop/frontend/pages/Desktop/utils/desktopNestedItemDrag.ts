/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * HTML5 drag payload for nested desktop shortcuts inside folder windows.
 *
 * Invariants:
 * - MIME type distinct from Content Manager library drag (`contentManagerDrag.ts`).
 *
 * Related:
 * - DesktopFolderNestedItems.tsx · DesktopFolderExplorerSidebar.tsx · desktopNestedItemDrop.ts
 */

import type * as React from 'react';
import { setContentManagerDragGhost } from '@/pages/ContentManager/utils/contentManagerDrag';

export const DESKTOP_NESTED_ITEM_DRAG_MIME =
	'application/x-eliteew-desktop-item-ids';

export function stringifyDesktopNestedItemDragIds(ids: string[]): string {
	return JSON.stringify(ids.filter((id) => id.length > 0));
}

export function parseDesktopNestedItemDragIds(
	dt: DataTransfer | null
): string[] {
	if (!dt) return [];
	const raw = dt.getData(DESKTOP_NESTED_ITEM_DRAG_MIME);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(x): x is string => typeof x === 'string' && x.length > 0
		);
	} catch {
		return [];
	}
}

export function dataTransferHasDesktopNestedItemDrag(
	dt: DataTransfer | null
): boolean {
	if (!dt?.types) return false;
	return Array.from(dt.types as unknown as string[]).includes(
		DESKTOP_NESTED_ITEM_DRAG_MIME
	);
}

export function setDesktopNestedItemDragGhost(
	e: React.DragEvent,
	options: { title: string; count: number }
): void {
	setContentManagerDragGhost(e, options);
}
