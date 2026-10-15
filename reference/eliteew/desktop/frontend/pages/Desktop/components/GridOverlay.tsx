/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Visual grid for icon snapping while dragging desktop icons.
 *
 * Invariants:
 * - Plain mount when visible (no Framer fade) for RDP-safe paint.
 *
 * Related:
 * - utils/desktopSnapGeometry.ts, DesktopIcon.tsx
 */

import { memo } from 'react';
import { readDesktopWorkArea } from '../utils/desktopSnapGeometry';

interface GridOverlayProps {
	visible: boolean;
	gridSize?: number;
	offset?: number;
}

export const GridOverlay = memo(function GridOverlay({
	visible,
	gridSize = 110,
	offset = 20,
}: GridOverlayProps) {
	const wa =
		visible && typeof window !== 'undefined' ? readDesktopWorkArea() : null;
	const areaW = wa?.width ?? 0;
	const areaH = wa?.height ?? 0;

	const cols = areaW > 0 ? Math.ceil((areaW - offset) / gridSize) : 0;
	const rows = areaH > 0 ? Math.ceil((areaH - offset) / gridSize) : 0;

	if (!visible || areaW <= 0 || areaH <= 0) {
		return null;
	}

	return (
		<div
			className="pointer-events-none absolute top-0 left-0 z-10"
			style={{
				width: areaW,
				height: areaH,
			}}
		>
			{Array.from({ length: cols + 1 }, (_, i) => offset + i * gridSize).map(
				(left) => (
					<div
						key={`v-${left}`}
						className="absolute top-0 bottom-0 w-px bg-[rgb(var(--desktop-accent-rgb)/0.1)]"
						style={{ left }}
					/>
				)
			)}

			{Array.from({ length: rows + 1 }, (_, i) => offset + i * gridSize).map(
				(top) => (
					<div
						key={`h-${top}`}
						className="absolute left-0 right-0 h-px bg-[rgb(var(--desktop-accent-rgb)/0.1)]"
						style={{ top }}
					/>
				)
			)}

			{Array.from(
				{ length: cols + 1 },
				(_, col) => offset + col * gridSize - 2
			).map((left) =>
				Array.from(
					{ length: rows + 1 },
					(_, row) => offset + row * gridSize - 2
				).map((top) => (
					<div
						key={`d-${left}-${top}`}
						className="absolute w-1 h-1 rounded-full bg-[rgb(var(--desktop-accent-rgb)/0.3)]"
						style={{
							left,
							top,
						}}
					/>
				))
			)}
		</div>
	);
});
