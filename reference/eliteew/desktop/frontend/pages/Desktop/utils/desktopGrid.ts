/**
 * Desktop icon grid: snap to grid and find nearest free slot to avoid collisions.
 */

import type { DesktopItem } from '../types/desktop.types';
import { DESKTOP_GRID } from '../constants';

/** Hint: keep drag feedback motion near `DESKTOP_WORKSPACE_MOTION.iconDrag` in `desktopVisualSystem.tsx`. */
export const DESKTOP_GRID_DRAG_MOTION_MS = 180;

const { GRID_SIZE, OFFSET, MAX_X, MAX_Y } = DESKTOP_GRID;

/** Upper-right clamp for icon top-left (layout px); derive from `readDesktopWorkArea()`. */
export type DesktopIconLayoutMax = {
	maxX: number;
	maxY: number;
};

/** Clamp position to desktop bounds so icons never leave the visible area (min = OFFSET). */
function clampPosition(
	x: number,
	y: number,
	maxX: number = MAX_X,
	maxY: number = MAX_Y
): { x: number; y: number } {
	return {
		x: Math.max(OFFSET, Math.min(maxX, x)),
		y: Math.max(OFFSET, Math.min(maxY, y)),
	};
}

/**
 * Snap (x, y) to grid. Optional gridSize/offset override the default.
 * Result is clamped to desktop bounds so icons never leave the visible area.
 */
export function snapToGrid(
	x: number,
	y: number,
	gridSize: number = GRID_SIZE,
	offset: number = OFFSET,
	layoutMax?: DesktopIconLayoutMax
): { x: number; y: number } {
	const snapped = {
		x: Math.round(x / gridSize) * gridSize + offset,
		y: Math.round(y / gridSize) * gridSize + offset,
	};
	const maxX = layoutMax?.maxX ?? MAX_X;
	const maxY = layoutMax?.maxY ?? MAX_Y;
	return clampPosition(snapped.x, snapped.y, maxX, maxY);
}

function positionToCell(
	x: number,
	y: number,
	gridSize: number = GRID_SIZE,
	offset: number = OFFSET
): { cx: number; cy: number } {
	return {
		cx: Math.round((x - offset) / gridSize),
		cy: Math.round((y - offset) / gridSize),
	};
}

function cellToPosition(
	cx: number,
	cy: number,
	gridSize: number = GRID_SIZE,
	offset: number = OFFSET
): { x: number; y: number } {
	return {
		x: cx * gridSize + offset,
		y: cy * gridSize + offset,
	};
}

interface FindNearestFreeGroupDeltaOptions {
	gridSize?: number;
	offset?: number;
	minDx?: number;
	maxDx?: number;
	minDy?: number;
	maxDy?: number;
	maxRadius?: number;
}

function clampWithinRange(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/**
 * Returns a grid position that does not collide with other items.
 * If the requested (x, y) is free, returns it; otherwise finds the nearest free cell.
 * Optional gridSize/offset for configurable grid step.
 */
export function findNearestFreePosition(
	items: DesktopItem[],
	excludeId: string,
	x: number,
	y: number,
	gridSize: number = GRID_SIZE,
	offset: number = OFFSET,
	layoutMax?: DesktopIconLayoutMax
): { x: number; y: number } {
	const maxX = layoutMax?.maxX ?? MAX_X;
	const maxY = layoutMax?.maxY ?? MAX_Y;
	const occupied = new Set<string>();
	for (const it of items) {
		if (it.id === excludeId) continue;
		const { cx, cy } = positionToCell(
			it.position.x,
			it.position.y,
			gridSize,
			offset
		);
		occupied.add(`${cx},${cy}`);
	}

	const clamped = clampPosition(x, y, maxX, maxY);
	const { cx: startCx, cy: startCy } = positionToCell(
		clamped.x,
		clamped.y,
		gridSize,
		offset
	);
	if (!occupied.has(`${startCx},${startCy}`)) return clamped;

	for (let r = 1; r <= 15; r++) {
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
				const cx = startCx + dx;
				const cy = startCy + dy;
				if (!occupied.has(`${cx},${cy}`)) {
					const pos = cellToPosition(cx, cy, gridSize, offset);
					return clampPosition(pos.x, pos.y, maxX, maxY);
				}
			}
		}
	}
	return clamped;
}

/**
 * Resolves a snapped delta for dragging a group of icons.
 * The returned delta keeps the whole group collision-free and within optional bounds.
 */
export function findNearestFreeGroupDelta(
	startPositions: Record<string, { x: number; y: number }>,
	items: DesktopItem[],
	proposedDx: number,
	proposedDy: number,
	options: FindNearestFreeGroupDeltaOptions = {}
): { dx: number; dy: number } {
	const {
		gridSize = GRID_SIZE,
		offset = OFFSET,
		minDx = Number.NEGATIVE_INFINITY,
		maxDx = Number.POSITIVE_INFINITY,
		minDy = Number.NEGATIVE_INFINITY,
		maxDy = Number.POSITIVE_INFINITY,
		maxRadius = 15,
	} = options;
	const entries = Object.entries(startPositions);
	if (entries.length === 0) {
		return {
			dx: clampWithinRange(proposedDx, minDx, maxDx),
			dy: clampWithinRange(proposedDy, minDy, maxDy),
		};
	}

	const occupied = new Set<string>();
	for (const item of items) {
		if (startPositions[item.id]) continue;
		const { cx, cy } = positionToCell(
			item.position.x,
			item.position.y,
			gridSize,
			offset
		);
		occupied.add(`${cx},${cy}`);
	}

	const groupCells = entries.map(([id, position]) => ({
		id,
		...positionToCell(position.x, position.y, gridSize, offset),
	}));
	const targetCellDx = Math.round(proposedDx / gridSize);
	const targetCellDy = Math.round(proposedDy / gridSize);

	const canPlaceGroupAtDelta = (cellDx: number, cellDy: number): boolean => {
		const dx = cellDx * gridSize;
		const dy = cellDy * gridSize;
		if (dx < minDx || dx > maxDx || dy < minDy || dy > maxDy) {
			return false;
		}

		return groupCells.every(
			({ cx, cy }) => !occupied.has(`${cx + cellDx},${cy + cellDy}`)
		);
	};

	const candidates: Array<{
		cellDx: number;
		cellDy: number;
		radius: number;
		directionPenalty: number;
		axisPenalty: number;
		distancePenalty: number;
	}> = [];

	for (let radius = 0; radius <= maxRadius; radius++) {
		for (let dy = -radius; dy <= radius; dy++) {
			for (let dx = -radius; dx <= radius; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
				const cellDx = targetCellDx + dx;
				const cellDy = targetCellDy + dy;
				const directionPenalty =
					(targetCellDx === 0
						? cellDx === 0
							? 0
							: 1
						: Math.sign(cellDx) === Math.sign(targetCellDx)
							? 0
							: 2) +
					(targetCellDy === 0
						? cellDy === 0
							? 0
							: 1
						: Math.sign(cellDy) === Math.sign(targetCellDy)
							? 0
							: 2);
				const axisPenalty =
					(targetCellDx === 0 ? Math.abs(cellDx) : 0) +
					(targetCellDy === 0 ? Math.abs(cellDy) : 0);
				const distancePenalty = Math.abs(dx) + Math.abs(dy);
				candidates.push({
					cellDx,
					cellDy,
					radius,
					directionPenalty,
					axisPenalty,
					distancePenalty,
				});
			}
		}
	}

	candidates.sort(
		(left, right) =>
			left.radius - right.radius ||
			left.directionPenalty - right.directionPenalty ||
			left.axisPenalty - right.axisPenalty ||
			left.distancePenalty - right.distancePenalty ||
			left.cellDy - right.cellDy ||
			left.cellDx - right.cellDx
	);

	for (const candidate of candidates) {
		if (canPlaceGroupAtDelta(candidate.cellDx, candidate.cellDy)) {
			return {
				dx: candidate.cellDx * gridSize,
				dy: candidate.cellDy * gridSize,
			};
		}
	}

	return {
		dx: clampWithinRange(targetCellDx * gridSize, minDx, maxDx),
		dy: clampWithinRange(targetCellDy * gridSize, minDy, maxDy),
	};
}
