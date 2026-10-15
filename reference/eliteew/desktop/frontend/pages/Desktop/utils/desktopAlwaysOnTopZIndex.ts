/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Keeps `alwaysOnTop` desktop windows above normal windows after z-index changes.
 *
 * Invariants:
 * - Runtime-only flag on `WindowState`; not persisted in `windows_snapshot`.
 *
 * Related:
 * - hooks/useWindowManager.ts
 */

import type { WindowState } from '../types/desktop.types';

export function applyAlwaysOnTopLayer(windows: WindowState[]): WindowState[] {
	const pinned = windows.filter((w) => w.alwaysOnTop);
	if (pinned.length === 0) return windows;

	const nonPinnedMax = windows
		.filter((w) => !w.alwaysOnTop)
		.reduce((max, w) => Math.max(max, w.zIndex), 0);

	let nextZ = nonPinnedMax;
	const zById = new Map<string, number>();
	for (const row of [...pinned].sort((a, b) => a.zIndex - b.zIndex)) {
		nextZ += 1;
		zById.set(row.id, nextZ);
	}

	let changed = false;
	const next = windows.map((w) => {
		if (!w.alwaysOnTop) return w;
		const zIndex = zById.get(w.id);
		if (zIndex == null || zIndex === w.zIndex) return w;
		changed = true;
		return { ...w, zIndex };
	});
	return changed ? next : windows;
}
