/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Rubber-band marquee selection for desktop icons; paint-safe updates via rAF
 * (no framer-motion, no setState on every mousemove).
 *
 * Invariants:
 * - Marquee is an opaque accent border only (no fill, no corner handles).
 * - Selection callbacks coalesce on rAF with areSetsEqual guard.
 *
 * Related:
 * - `DesktopIconLayer.tsx`
 * - `documentation/product/desktop/DESKTOP-WINDOW-RUNTIME-PERFORMANCE.md`
 */

import * as React from 'react';
import { useRef, useCallback, useEffect, useState, memo } from 'react';
import { cn } from '@/utils/cn';
import type { DesktopItem } from '../types/desktop.types';
import {
	DESKTOP_ICON_SIZES,
	DESKTOP_Z_INDEX,
	type IconSizePreference,
} from '../constants';
import { clientToDesktopLayoutCoords } from '../utils/desktopSnapGeometry';

interface SelectionBoxProps {
	enabled: boolean;
	items: DesktopItem[];
	onSelectionChange: (selectedIds: Set<string>) => void;
	containerRef?: React.RefObject<HTMLElement | null>;
	selectedIds?: Set<string>;
	iconSize?: IconSizePreference;
}

interface Box {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export const SelectionBox: React.FC<SelectionBoxProps> = memo(
	function SelectionBox({
		enabled = true,
		items,
		onSelectionChange,
		containerRef,
		selectedIds,
		iconSize = 'medium',
	}) {
		const [isDragging, setIsDragging] = useState(false);
		const marqueeRef = useRef<HTMLDivElement>(null);
		const startPoint = useRef<{ x: number; y: number } | null>(null);
		const pendingBoxRef = useRef<Box | null>(null);
		const rafIdRef = useRef<number | null>(null);
		const lastSelectionRef = useRef<Set<string>>(new Set());
		const baseSelectionRef = useRef<Set<string>>(new Set());
		const additiveSelectionRef = useRef(false);
		const iconMetrics =
			DESKTOP_ICON_SIZES[iconSize] ?? DESKTOP_ICON_SIZES.medium;

		const areSetsEqual = useCallback(
			(left: Set<string>, right: Set<string>): boolean =>
				left.size === right.size && [...left].every((id) => right.has(id)),
			[]
		);

		const applyMarqueeStyle = useCallback((box: Box) => {
			const el = marqueeRef.current;
			if (!el) return;
			const left = Math.min(box.x1, box.x2);
			const top = Math.min(box.y1, box.y2);
			el.style.left = `${left}px`;
			el.style.top = `${top}px`;
			el.style.width = `${Math.abs(box.x2 - box.x1)}px`;
			el.style.height = `${Math.abs(box.y2 - box.y1)}px`;
		}, []);

		const hideMarquee = useCallback(() => {
			const el = marqueeRef.current;
			if (!el) return;
			el.style.width = '0px';
			el.style.height = '0px';
		}, []);

		// Check if item intersects with selection box
		const isItemInSelection = useCallback(
			(item: DesktopItem, box: Box): boolean => {
				const itemBounds = {
					left: item.position.x,
					right: item.position.x + iconMetrics.width,
					top: item.position.y,
					bottom: item.position.y + iconMetrics.height,
				};

				const selectionBounds = {
					left: Math.min(box.x1, box.x2),
					right: Math.max(box.x1, box.x2),
					top: Math.min(box.y1, box.y2),
					bottom: Math.max(box.y1, box.y2),
				};

				return !(
					itemBounds.right < selectionBounds.left ||
					itemBounds.left > selectionBounds.right ||
					itemBounds.bottom < selectionBounds.top ||
					itemBounds.top > selectionBounds.bottom
				);
			},
			[iconMetrics.height, iconMetrics.width]
		);

		// Update selection based on current box
		const updateSelection = useCallback(
			(box: Box) => {
				const boxSelected = new Set<string>();

				for (const item of items) {
					if (isItemInSelection(item, box)) {
						boxSelected.add(item.id);
					}
				}

				const nextSelected = additiveSelectionRef.current
					? new Set([...baseSelectionRef.current, ...boxSelected])
					: boxSelected;

				if (!areSetsEqual(nextSelected, lastSelectionRef.current)) {
					lastSelectionRef.current = nextSelected;
					onSelectionChange(nextSelected);
				}
			},
			[areSetsEqual, isItemInSelection, items, onSelectionChange]
		);

		const flushPendingFrame = useCallback(() => {
			rafIdRef.current = null;
			const box = pendingBoxRef.current;
			if (!box) return;
			applyMarqueeStyle(box);
			updateSelection(box);
		}, [applyMarqueeStyle, updateSelection]);

		const scheduleFrame = useCallback(
			(box: Box) => {
				pendingBoxRef.current = box;
				if (rafIdRef.current != null) return;
				rafIdRef.current = requestAnimationFrame(flushPendingFrame);
			},
			[flushPendingFrame]
		);

		const cancelScheduledFrame = useCallback(() => {
			if (rafIdRef.current != null) {
				cancelAnimationFrame(rafIdRef.current);
				rafIdRef.current = null;
			}
			pendingBoxRef.current = null;
		}, []);

		// Handle mouse down
		const handleMouseDown = useCallback(
			(e: MouseEvent) => {
				if (!enabled) return;

				if (e.button !== 0) return;

				const target = e.target as HTMLElement;
				if (
					target.closest('[data-desktop-icon]') ||
					target.closest('[data-desktop-window], .desktop-window-root') ||
					(target.closest('button') &&
						!target.closest('[data-desktop-background]')) ||
					target.closest('input') ||
					target.closest('[role="button"]')
				) {
					return;
				}

				const { x, y } = clientToDesktopLayoutCoords(e.clientX, e.clientY);

				additiveSelectionRef.current = e.ctrlKey || e.metaKey;
				baseSelectionRef.current = additiveSelectionRef.current
					? new Set(selectedIds ?? [])
					: new Set();
				lastSelectionRef.current = additiveSelectionRef.current
					? new Set(selectedIds ?? [])
					: new Set();
				startPoint.current = { x, y };
				setIsDragging(true);
				scheduleFrame({ x1: x, y1: y, x2: x, y2: y });

				e.preventDefault();
				document.body.style.userSelect = 'none';
			},
			[enabled, scheduleFrame, selectedIds]
		);

		// Handle mouse move
		const handleMouseMove = useCallback(
			(e: MouseEvent) => {
				if (!startPoint.current) return;

				const { x: x2, y: y2 } = clientToDesktopLayoutCoords(
					e.clientX,
					e.clientY
				);

				scheduleFrame({
					x1: startPoint.current.x,
					y1: startPoint.current.y,
					x2,
					y2,
				});
			},
			[scheduleFrame]
		);

		const endDrag = useCallback(() => {
			cancelScheduledFrame();
			setIsDragging(false);
			hideMarquee();
			startPoint.current = null;
			lastSelectionRef.current = new Set();
			baseSelectionRef.current = new Set();
			additiveSelectionRef.current = false;
			document.body.style.userSelect = '';
		}, [cancelScheduledFrame, hideMarquee]);

		// Handle mouse up
		const handleMouseUp = useCallback(() => {
			if (!startPoint.current && !isDragging) return;
			endDrag();
		}, [endDrag, isDragging]);

		// Setup event listeners
		useEffect(() => {
			const container = containerRef?.current || document.body;

			container.addEventListener('mousedown', handleMouseDown, true);
			window.addEventListener('mousemove', handleMouseMove);
			window.addEventListener('mouseup', handleMouseUp);

			return () => {
				container.removeEventListener('mousedown', handleMouseDown, true);
				window.removeEventListener('mousemove', handleMouseMove);
				window.removeEventListener('mouseup', handleMouseUp);
				cancelScheduledFrame();
				document.body.style.userSelect = '';
			};
		}, [
			cancelScheduledFrame,
			handleMouseDown,
			handleMouseMove,
			handleMouseUp,
			containerRef,
		]);

		// Handle escape key to cancel selection
		useEffect(() => {
			const handleKeyDown = (e: KeyboardEvent) => {
				if (e.key === 'Escape' && isDragging) {
					onSelectionChange(new Set());
					endDrag();
				}
			};

			window.addEventListener('keydown', handleKeyDown);
			return () => window.removeEventListener('keydown', handleKeyDown);
		}, [endDrag, isDragging, onSelectionChange]);

		return (
			<div
				ref={marqueeRef}
				data-testid="desktop-selection-marquee"
				className={cn(
					'absolute pointer-events-none rounded-sm border-2 border-[rgb(var(--desktop-accent-rgb))]',
					!isDragging && 'opacity-0'
				)}
				style={{
					zIndex: DESKTOP_Z_INDEX.SHELL_CANVAS_CHROME,
				}}
			/>
		);
	}
);

// Hook for easier integration
export function useSelectionBox(
	items: DesktopItem[],
	onSelectionChange: (selectedIds: Set<string>) => void,
	containerRef?: React.RefObject<HTMLElement>
) {
	const [enabled, setEnabled] = useState(true);

	const Component = useCallback(
		() => (
			<SelectionBox
				enabled={enabled}
				items={items}
				onSelectionChange={onSelectionChange}
				containerRef={containerRef}
			/>
		),
		[enabled, items, onSelectionChange, containerRef]
	);

	return {
		SelectionBox: Component,
		setEnabled,
		enabled,
	};
}
