/**
 * Root desktop icon ordering + column-major grid layout (same rules as legacy sort in DesktopWorkspaceContent).
 */

import type { DesktopItem } from '../types/desktop.types';
import {
	DESKTOP_GRID,
	DESKTOP_GRID_STEPS,
	type GridStepPreference,
} from '../constants';

export function desktopItemTimeMs(item: DesktopItem): number {
	const raw = item.created_at || item.updated_at;
	if (raw == null || raw === '') return 0;
	if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
	const t = Date.parse(String(raw));
	return Number.isFinite(t) ? t : 0;
}

export function compareDesktopRootByName(
	a: DesktopItem,
	b: DesktopItem
): number {
	return a.name.localeCompare(b.name, 'ru-RU', {
		sensitivity: 'base',
		numeric: true,
	});
}

const TYPE_ORDER: Record<string, number> = { folder: 0, app: 1, file: 2 };

export function compareDesktopRootByTypeThenName(
	a: DesktopItem,
	b: DesktopItem
): number {
	const ta = TYPE_ORDER[a.type] ?? 99;
	const tb = TYPE_ORDER[b.type] ?? 99;
	if (ta !== tb) return ta - tb;
	return compareDesktopRootByName(a, b);
}

/** Новые сверху; без даты — в конце, затем по имени. */
export function compareDesktopRootByDateDesc(
	a: DesktopItem,
	b: DesktopItem
): number {
	const da = desktopItemTimeMs(a);
	const db = desktopItemTimeMs(b);
	if (da !== db) return db - da;
	return compareDesktopRootByName(a, b);
}

/**
 * Как «по типу», но среди файлов — по убыванию размера, затем по имени.
 * Папки и приложения — по имени внутри своего типа.
 */
export function compareDesktopRootByTypeThenFileSizeDesc(
	a: DesktopItem,
	b: DesktopItem
): number {
	const ta = TYPE_ORDER[a.type] ?? 99;
	const tb = TYPE_ORDER[b.type] ?? 99;
	if (ta !== tb) return ta - tb;
	if (a.type === 'file' && b.type === 'file') {
		const sa = a.size ?? 0;
		const sb = b.size ?? 0;
		if (sa !== sb) return sb - sa;
	}
	return compareDesktopRootByName(a, b);
}

export function compareDesktopRootByPinnedThenName(
	a: DesktopItem,
	b: DesktopItem
): number {
	const pa = a.isPinned ? 0 : 1;
	const pb = b.isPinned ? 0 : 1;
	if (pa !== pb) return pa - pb;
	return compareDesktopRootByName(a, b);
}

/** Порядок как на сетке: сверху вниз, слева направо — для «упаковки» без смены логического порядка ярлыков. */
export function compareDesktopRootByGridPosition(
	a: DesktopItem,
	b: DesktopItem
): number {
	const ay = a.position?.y ?? 0;
	const by = b.position?.y ?? 0;
	const ax = a.position?.x ?? 0;
	const bx = b.position?.x ?? 0;
	if (ay !== by) return ay - by;
	if (ax !== bx) return ax - bx;
	return compareDesktopRootByName(a, b);
}

/**
 * Упорядоченный список корневых значков → позиции в сетке (колонки слева направо, сверху вниз в колонке).
 */
export function layoutRootIconsOnGrid(
	sortedRootItems: DesktopItem[],
	gridStepName: GridStepPreference | undefined
): DesktopItem[] {
	const gridSize = DESKTOP_GRID_STEPS[gridStepName ?? 'medium'];
	const offset = DESKTOP_GRID.OFFSET;
	const viewportH = typeof window !== 'undefined' ? window.innerHeight : 900;
	const maxRows = Math.max(1, Math.floor((viewportH - 160) / gridSize));
	return sortedRootItems.map((item, index) => {
		const row = index % maxRows;
		const col = Math.floor(index / maxRows);
		return {
			...item,
			position: {
				x: offset + col * gridSize,
				y: offset + row * gridSize,
			},
		};
	});
}
