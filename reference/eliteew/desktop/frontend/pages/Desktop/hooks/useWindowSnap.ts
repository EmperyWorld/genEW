/**
 * 🪟 useWindowSnap - Hook для привязки окон к краям экрана
 *
 * Поддерживает:
 * - Snap к левому/правому краю (50% ширины)
 * - Snap к верхнему краю (максимизация)
 * - Snap к углам (25% экрана)
 * - Визуальный preview зоны
 */

import { useState, useCallback, useRef } from 'react';

export type SnapZone =
	| 'left'
	| 'right'
	| 'top'
	| 'bottom-left'
	| 'bottom-right'
	| 'top-left'
	| 'top-right'
	| 'maximize'
	| null;

export interface SnapPosition {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface UseWindowSnapOptions {
	edgeThreshold?: number; // Pixels from edge to trigger snap
	cornerThreshold?: number; // Pixels from corner to trigger corner snap
	taskbarHeight?: number; // Height of taskbar to exclude
}

const DEFAULT_OPTIONS: UseWindowSnapOptions = {
	edgeThreshold: 20,
	cornerThreshold: 50,
	taskbarHeight: 56,
};

export function useWindowSnap(options: UseWindowSnapOptions = {}) {
	const { edgeThreshold, cornerThreshold, taskbarHeight } = {
		...DEFAULT_OPTIONS,
		...options,
	};

	const [activeZone, setActiveZone] = useState<SnapZone>(null);
	const [showPreview, setShowPreview] = useState(false);
	const originalPositionRef = useRef<SnapPosition | null>(null);

	// Detect which snap zone the cursor is in
	const detectSnapZone = useCallback(
		(x: number, y: number): SnapZone => {
			const screenWidth = window.innerWidth;
			const screenHeight = window.innerHeight - (taskbarHeight || 0);

			const nearLeft = x <= (edgeThreshold || 20);
			const nearRight = x >= screenWidth - (edgeThreshold || 20);
			const nearTop = y <= (edgeThreshold || 20);
			const _nearBottom = y >= screenHeight - (edgeThreshold || 20);

			const inLeftCorner = x <= (cornerThreshold || 50);
			const inRightCorner = x >= screenWidth - (cornerThreshold || 50);
			const inTopCorner = y <= (cornerThreshold || 50);
			const inBottomCorner = y >= screenHeight - (cornerThreshold || 50);

			// Corner snaps (priority)
			if (inLeftCorner && inTopCorner) return 'top-left';
			if (inRightCorner && inTopCorner) return 'top-right';
			if (inLeftCorner && inBottomCorner) return 'bottom-left';
			if (inRightCorner && inBottomCorner) return 'bottom-right';

			// Edge snaps
			if (nearTop) return 'maximize';
			if (nearLeft) return 'left';
			if (nearRight) return 'right';

			return null;
		},
		[edgeThreshold, cornerThreshold, taskbarHeight]
	);

	// Get position for a snap zone
	const getSnapPosition = useCallback(
		(zone: SnapZone): SnapPosition | null => {
			const screenWidth = window.innerWidth;
			const screenHeight = window.innerHeight - (taskbarHeight || 0);
			const halfWidth = screenWidth / 2;
			const halfHeight = screenHeight / 2;

			switch (zone) {
				case 'left':
					return { x: 0, y: 0, width: halfWidth, height: screenHeight };
				case 'right':
					return { x: halfWidth, y: 0, width: halfWidth, height: screenHeight };
				case 'maximize':
					return { x: 0, y: 0, width: screenWidth, height: screenHeight };
				case 'top-left':
					return { x: 0, y: 0, width: halfWidth, height: halfHeight };
				case 'top-right':
					return { x: halfWidth, y: 0, width: halfWidth, height: halfHeight };
				case 'bottom-left':
					return { x: 0, y: halfHeight, width: halfWidth, height: halfHeight };
				case 'bottom-right':
					return {
						x: halfWidth,
						y: halfHeight,
						width: halfWidth,
						height: halfHeight,
					};
				default:
					return null;
			}
		},
		[taskbarHeight]
	);

	// Handle drag move - detect zone and show preview
	const handleDragMove = useCallback(
		(x: number, y: number) => {
			const zone = detectSnapZone(x, y);
			setActiveZone(zone);
			setShowPreview(zone !== null);
		},
		[detectSnapZone]
	);

	// Handle drag end - apply snap or restore
	const handleDragEnd = useCallback(
		(currentPosition: SnapPosition): SnapPosition | null => {
			setShowPreview(false);

			if (activeZone) {
				// Save original position for restore
				if (!originalPositionRef.current) {
					originalPositionRef.current = currentPosition;
				}

				const snapPos = getSnapPosition(activeZone);
				setActiveZone(null);
				return snapPos;
			}

			setActiveZone(null);
			return null;
		},
		[activeZone, getSnapPosition]
	);

	// Restore to original position (double-click title bar)
	const restorePosition = useCallback((): SnapPosition | null => {
		const original = originalPositionRef.current;
		originalPositionRef.current = null;
		return original;
	}, []);

	// Get preview rect for current zone
	const getPreviewRect = useCallback((): SnapPosition | null => {
		return activeZone ? getSnapPosition(activeZone) : null;
	}, [activeZone, getSnapPosition]);

	return {
		activeZone,
		showPreview,
		handleDragMove,
		handleDragEnd,
		restorePosition,
		getPreviewRect,
		getSnapPosition,
	};
}

// Snap preview overlay component styles
export const snapPreviewStyles = {
	left: 'left-0 top-0 w-1/2 h-full',
	right: 'right-0 top-0 w-1/2 h-full',
	maximize: 'inset-0',
	'top-left': 'left-0 top-0 w-1/2 h-1/2',
	'top-right': 'right-0 top-0 w-1/2 h-1/2',
	'bottom-left': 'left-0 bottom-14 w-1/2 h-1/2',
	'bottom-right': 'right-0 bottom-14 w-1/2 h-1/2',
};

export default useWindowSnap;
