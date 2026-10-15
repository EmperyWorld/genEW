/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Snap-zone state and window snap actions for `useWindowManager` (grid presets on drag).
 *
 * Invariants:
 * - Snap layout uses `getMaximizedWindowBounds().size` as work-area reference.
 * - `snapZone` clears after a successful snap commit.
 *
 * Related:
 * - `hooks/useWindowManager.ts`, `utils/desktopSnapGeometry.ts`, `utils/desktopWindowGeometry.ts`
 */

import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useState,
} from 'react';
import type { SnapZone, WindowState } from '../types/desktop.types';
import { getSnapZoneForClientPosition } from '../utils/desktopSnapGeometry';
import {
	buildSnapWindowStatePatch,
	getMaximizedWindowBounds,
} from '../utils/desktopWindowGeometry';

export function useWindowManagerSnap(
	setWindows: Dispatch<SetStateAction<WindowState[]>>
) {
	const [snapZone, setSnapZone] = useState<SnapZone>(null);

	const updateSnapZone = useCallback((clientX: number, clientY: number) => {
		setSnapZone((prev) => {
			const next = getSnapZoneForClientPosition(clientX, clientY);
			return prev === next ? prev : next;
		});
	}, []);

	const clearSnapZone = useCallback(() => {
		setSnapZone(null);
	}, []);

	const snapWindow = useCallback(
		(id: string, zone: SnapZone) => {
			if (!zone) return;

			const { size: work } = getMaximizedWindowBounds();

			setWindows((prev) =>
				prev.map((w) =>
					w.id === id
						? { ...w, ...buildSnapWindowStatePatch(w, zone, work) }
						: w
				)
			);
			setSnapZone(null);
		},
		[setWindows]
	);

	return {
		snapZone,
		updateSnapZone,
		clearSnapZone,
		snapWindow,
		getSnapZoneForPosition: getSnapZoneForClientPosition,
	};
}
