/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Detect root desktop icons stacked on default cluster anchors (e.g. 20,20) after hydrate and fan them
 * out onto the icon grid without overlapping.
 *
 * Invariants:
 * - Only root, visible collision items participate; folder children and hidden apps are ignored.
 * - Single icon on a default anchor is left unchanged; clusters of two or more are reflowed.
 *
 * Related:
 * - documentation/product/desktop/DESKTOP-ICON-DRAG-INVESTIGATION.md §7
 * - `desktopGrid.ts`, `useDesktopWorkspaceIconInteractions.ts`
 */

import {
	DESKTOP_GRID,
	DESKTOP_GRID_STEPS,
	type GridStepPreference,
} from '../constants';
import type { DesktopItem } from '../types/desktop.types';
import {
	type DesktopIconLayoutMax,
	findNearestFreePosition,
} from './desktopGrid';
import { compareDesktopRootByTypeThenName } from './desktopRootSort';

/** Positions where failed drags / API defaults often stack many icons. */
export const DESKTOP_DEFAULT_ICON_CLUSTER_ANCHORS: ReadonlyArray<{
	x: number;
	y: number;
}> = [
	{ x: DESKTOP_GRID.OFFSET, y: DESKTOP_GRID.OFFSET },
	{ x: 0, y: 0 },
];

export function isDesktopDefaultIconClusterAnchor(
	x: number,
	y: number
): boolean {
	return DESKTOP_DEFAULT_ICON_CLUSTER_ANCHORS.some(
		(anchor) => anchor.x === x && anchor.y === y
	);
}

function desktopRootCollisionItems(
	items: DesktopItem[],
	installedAppIds?: ReadonlySet<string>
): DesktopItem[] {
	return items.filter(
		(item) =>
			!item.parentId &&
			(item.type !== 'app' || !installedAppIds || installedAppIds.has(item.id))
	);
}

function positionKey(x: number, y: number): string {
	return `${x},${y}`;
}

export type SanitizeStackedDesktopIconPositionsParams = {
	items: DesktopItem[];
	gridStepKey: GridStepPreference;
	installedAppIds?: ReadonlySet<string>;
	layoutMax?: DesktopIconLayoutMax;
};

export type SanitizeStackedDesktopIconPositionsResult = {
	items: DesktopItem[];
	changed: boolean;
	changedItemIds: string[];
};

/**
 * Fan out root icons that share a default cluster anchor. Returns the same array reference when no
 * reflow is needed.
 */
export function sanitizeStackedDesktopIconPositions(
	params: SanitizeStackedDesktopIconPositionsParams
): SanitizeStackedDesktopIconPositionsResult {
	const { items, gridStepKey, installedAppIds, layoutMax } = params;
	if (items.length === 0) {
		return { items, changed: false, changedItemIds: [] };
	}

	const gridSize = DESKTOP_GRID_STEPS[gridStepKey];
	const offset = DESKTOP_GRID.OFFSET;
	const rootItems = desktopRootCollisionItems(items, installedAppIds);
	const layoutMaxY = layoutMax?.maxY ?? DESKTOP_GRID.MAX_Y;
	const maxRows = Math.max(1, Math.floor((layoutMaxY - offset) / gridSize));

	const clustersByAnchor = new Map<string, DesktopItem[]>();
	for (const item of rootItems) {
		const { x, y } = item.position;
		if (!isDesktopDefaultIconClusterAnchor(x, y)) {
			continue;
		}
		const key = positionKey(x, y);
		const bucket = clustersByAnchor.get(key);
		if (bucket) {
			bucket.push(item);
		} else {
			clustersByAnchor.set(key, [item]);
		}
	}

	const stackedClusters = [...clustersByAnchor.values()].filter(
		(cluster) => cluster.length >= 2
	);
	if (stackedClusters.length === 0) {
		return { items, changed: false, changedItemIds: [] };
	}

	let nextItems = items;
	let workingCollision = desktopRootCollisionItems(nextItems, installedAppIds);
	const changedItemIds: string[] = [];

	for (const cluster of stackedClusters) {
		const sortedCluster = [...cluster].sort(compareDesktopRootByTypeThenName);
		for (let index = 0; index < sortedCluster.length; index++) {
			const item = sortedCluster[index];
			const row = index % maxRows;
			const col = Math.floor(index / maxRows);
			const seedX = offset + col * gridSize;
			const seedY = offset + row * gridSize;
			const nextPosition = findNearestFreePosition(
				workingCollision,
				item.id,
				seedX,
				seedY,
				gridSize,
				offset,
				layoutMax
			);
			const prev = nextItems.find((entry) => entry.id === item.id)?.position;
			if (prev && (prev.x !== nextPosition.x || prev.y !== nextPosition.y)) {
				changedItemIds.push(item.id);
			}
			nextItems = nextItems.map((entry) =>
				entry.id === item.id ? { ...entry, position: nextPosition } : entry
			);
			workingCollision = workingCollision.map((entry) =>
				entry.id === item.id ? { ...entry, position: nextPosition } : entry
			);
		}
	}

	if (changedItemIds.length === 0) {
		return { items, changed: false, changedItemIds: [] };
	}

	return {
		items: nextItems,
		changed: true,
		changedItemIds,
	};
}
