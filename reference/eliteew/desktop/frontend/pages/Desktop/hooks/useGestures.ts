/**
 * useGestures - Advanced gesture recognition for desktop
 * Supports touchpad gestures, mouse gestures, and touch events
 */

import { useCallback, useRef } from 'react';

interface Point {
	x: number;
	y: number;
	timestamp: number;
}

interface GestureState {
	isActive: boolean;
	startPoint: Point;
	currentPoint: Point;
	velocity: { x: number; y: number };
	distance: number;
}

interface UseGesturesReturn {
	onMouseDown: (e: React.MouseEvent) => void;
	onMouseMove: (e: React.MouseEvent) => void;
	onMouseUp: (e: React.MouseEvent) => void;
	onWheel: (e: React.WheelEvent) => void;
	onTouchStart: (e: React.TouchEvent) => void;
	onTouchMove: (e: React.TouchEvent) => void;
	onTouchEnd: (e: React.TouchEvent) => void;
}

interface GestureHandlers {
	onSwipeLeft?: () => void;
	onSwipeRight?: () => void;
	onSwipeUp?: () => void;
	onSwipeDown?: () => void;
	onPinchZoom?: (scale: number) => void;
	onTwoFingerSwipe?: (direction: 'left' | 'right') => void;
	onThreeFingerSwipe?: (direction: 'up' | 'down') => void;
}

function gesturePointDistance(p1: Point, p2: Point): number {
	return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

function gesturePointVelocity(p1: Point, p2: Point): { x: number; y: number } {
	const dt = p2.timestamp - p1.timestamp;
	if (dt === 0) return { x: 0, y: 0 };
	return {
		x: (p2.x - p1.x) / dt,
		y: (p2.y - p1.y) / dt,
	};
}

export function useGestures(handlers: GestureHandlers): UseGesturesReturn {
	const stateRef = useRef<GestureState>({
		isActive: false,
		startPoint: { x: 0, y: 0, timestamp: 0 },
		currentPoint: { x: 0, y: 0, timestamp: 0 },
		velocity: { x: 0, y: 0 },
		distance: 0,
	});

	const touchPointsRef = useRef<Point[]>([]);
	const lastPinchDistanceRef = useRef<number>(0);

	const detectSwipe = useCallback(
		(start: Point, end: Point, velocity: { x: number; y: number }) => {
			const distance = gesturePointDistance(start, end);
			const minDistance = 50;
			const minVelocity = 0.5;

			if (distance < minDistance) return;

			const dx = end.x - start.x;
			const dy = end.y - start.y;
			const absDx = Math.abs(dx);
			const absDy = Math.abs(dy);

			// Determine swipe direction based on distance and velocity
			if (absDx > absDy) {
				// Horizontal swipe
				if (velocity.x > minVelocity && dx > 0) {
					handlers.onSwipeRight?.();
				} else if (velocity.x < -minVelocity && dx < 0) {
					handlers.onSwipeLeft?.();
				}
			} else {
				// Vertical swipe
				if (velocity.y > minVelocity && dy > 0) {
					handlers.onSwipeDown?.();
				} else if (velocity.y < -minVelocity && dy < 0) {
					handlers.onSwipeUp?.();
				}
			}
		},
		[handlers]
	);

	// Mouse events
	const onMouseDown = useCallback((e: React.MouseEvent) => {
		if (e.button !== 0) return; // Only left click

		stateRef.current = {
			isActive: true,
			startPoint: { x: e.clientX, y: e.clientY, timestamp: Date.now() },
			currentPoint: { x: e.clientX, y: e.clientY, timestamp: Date.now() },
			velocity: { x: 0, y: 0 },
			distance: 0,
		};
	}, []);

	const onMouseMove = useCallback((e: React.MouseEvent) => {
		if (!stateRef.current.isActive) return;

		const now = Date.now();
		const newPoint = { x: e.clientX, y: e.clientY, timestamp: now };

		stateRef.current.velocity = gesturePointVelocity(
			stateRef.current.currentPoint,
			newPoint
		);
		stateRef.current.currentPoint = newPoint;
		stateRef.current.distance = gesturePointDistance(
			stateRef.current.startPoint,
			newPoint
		);
	}, []);

	const onMouseUp = useCallback(
		(e: React.MouseEvent) => {
			if (!stateRef.current.isActive) return;

			detectSwipe(
				stateRef.current.startPoint,
				{ x: e.clientX, y: e.clientY, timestamp: Date.now() },
				stateRef.current.velocity
			);

			stateRef.current.isActive = false;
		},
		[detectSwipe]
	);

	// Touch events
	const onTouchStart = useCallback((e: React.TouchEvent) => {
		const touches = Array.from(e.touches);
		touchPointsRef.current = touches.map((touch) => ({
			x: touch.clientX,
			y: touch.clientY,
			timestamp: Date.now(),
		}));

		if (touches.length === 2) {
			// Initialize pinch zoom
			const distance = gesturePointDistance(
				touchPointsRef.current[0],
				touchPointsRef.current[1]
			);
			lastPinchDistanceRef.current = distance;
		}
	}, []);

	const onTouchMove = useCallback(
		(e: React.TouchEvent) => {
			const touches = Array.from(e.touches);

			if (touches.length === 2 && touchPointsRef.current.length >= 2) {
				// Pinch zoom
				const currentPoints = touches.map((touch) => ({
					x: touch.clientX,
					y: touch.clientY,
					timestamp: Date.now(),
				}));

				const currentDistance = gesturePointDistance(
					currentPoints[0],
					currentPoints[1]
				);
				const scale = currentDistance / lastPinchDistanceRef.current;

				handlers.onPinchZoom?.(scale);
				lastPinchDistanceRef.current = currentDistance;
			}

			touchPointsRef.current = touches.map((touch) => ({
				x: touch.clientX,
				y: touch.clientY,
				timestamp: Date.now(),
			}));
		},
		[handlers]
	);

	const onTouchEnd = useCallback((e: React.TouchEvent) => {
		const touches = Array.from(e.touches);

		touchPointsRef.current = touches.map((touch) => ({
			x: touch.clientX,
			y: touch.clientY,
			timestamp: Date.now(),
		}));
	}, []);

	// Wheel event for horizontal swipe detection
	const onWheel = useCallback(
		(e: React.WheelEvent) => {
			// Detect horizontal wheel for swipe gestures
			if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 50) {
				if (e.deltaX > 0) {
					handlers.onSwipeRight?.();
				} else {
					handlers.onSwipeLeft?.();
				}
			}
		},
		[handlers]
	);

	return {
		onMouseDown,
		onMouseMove,
		onMouseUp,
		onWheel,
		onTouchStart,
		onTouchMove,
		onTouchEnd,
	};
}
