/**
 * useMultiSelect - Multi-selection system for desktop icons
 * Supports rubber band selection, keyboard selection, and group operations
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DesktopItem } from '../types/desktop.types';

interface SelectionRect {
	startX: number;
	startY: number;
	endX: number;
	endY: number;
}

interface UseMultiSelectReturn {
	selectedItems: Set<string>;
	isSelecting: boolean;
	selectionRect: SelectionRect | null;
	startSelection: (e: React.MouseEvent) => void;
	updateSelection: (e: React.MouseEvent) => void;
	endSelection: () => void;
	toggleSelection: (itemId: string, e?: React.MouseEvent) => void;
	selectAll: () => void;
	clearSelection: () => void;
	isItemSelected: (itemId: string) => boolean;
	getSelectedItems: (allItems: DesktopItem[]) => DesktopItem[];
	deleteSelected: () => void;
	moveSelectedToFolder: (folderId: string) => void;
	copySelected: () => void;
	cutSelected: () => void;
	pasteSelected: () => void;
}

export function useMultiSelect(): UseMultiSelectReturn {
	const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
	const [isSelecting, setIsSelecting] = useState(false);
	const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(
		null
	);
	const [copyBuffer, setCopyBuffer] = useState<{
		items: string[];
		operation: 'copy' | 'cut';
	} | null>(null);

	const containerRef = useRef<HTMLDivElement>(null);
	const startPointRef = useRef({ x: 0, y: 0 });

	// Check if point is inside selection rect
	const _isPointInRect = useCallback(
		(x: number, y: number, rect: SelectionRect): boolean => {
			const minX = Math.min(rect.startX, rect.endX);
			const maxX = Math.max(rect.startX, rect.endX);
			const minY = Math.min(rect.startY, rect.endY);
			const maxY = Math.max(rect.startY, rect.endY);

			return x >= minX && x <= maxX && y >= minY && y <= maxY;
		},
		[]
	);

	// Check if icon intersects with selection rect
	const isIconInSelection = useCallback(
		(icon: HTMLElement, rect: SelectionRect): boolean => {
			const rect1 = icon.getBoundingClientRect();
			const rect2 = {
				left: Math.min(rect.startX, rect.endX),
				right: Math.max(rect.startX, rect.endX),
				top: Math.min(rect.startY, rect.endY),
				bottom: Math.max(rect.startY, rect.endY),
			};

			return !(
				rect1.right < rect2.left ||
				rect1.left > rect2.right ||
				rect1.bottom < rect2.top ||
				rect1.top > rect2.bottom
			);
		},
		[]
	);

	// Start rubber band selection
	const startSelection = useCallback((e: React.MouseEvent) => {
		if (e.button !== 0) return; // Only left click

		// Don't start selection if clicking on an icon
		if ((e.target as HTMLElement).closest('[data-desktop-icon]')) {
			return;
		}

		// Clear selection if not holding Ctrl/Cmd
		if (!e.ctrlKey && !e.metaKey) {
			setSelectedItems(new Set());
		}

		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return;

		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		startPointRef.current = { x, y };
		setIsSelecting(true);
		setSelectionRect({
			startX: x,
			startY: y,
			endX: x,
			endY: y,
		});
	}, []);

	// Update selection rect and select items
	const updateSelection = useCallback(
		(e: React.MouseEvent) => {
			if (!isSelecting || !selectionRect) return;

			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;

			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;

			const newRect = {
				...selectionRect,
				endX: x,
				endY: y,
			};

			setSelectionRect(newRect);

			// Find all icons within selection
			const icons = containerRef.current?.querySelectorAll(
				'[data-desktop-icon]'
			) as NodeListOf<HTMLElement>;
			const newSelection = new Set(selectedItems);

			icons.forEach((icon) => {
				const itemId = icon.dataset.itemId;
				if (!itemId) return;

				if (isIconInSelection(icon, newRect)) {
					if (e.ctrlKey || e.metaKey) {
						// Toggle selection with Ctrl/Cmd
						if (newSelection.has(itemId)) {
							newSelection.delete(itemId);
						} else {
							newSelection.add(itemId);
						}
					} else {
						// Replace selection
						newSelection.add(itemId);
					}
				} else if (!e.ctrlKey && !e.metaKey) {
					// Remove items outside selection (only when not holding Ctrl/Cmd)
					newSelection.delete(itemId);
				}
			});

			setSelectedItems(newSelection);
		},
		[isSelecting, selectionRect, selectedItems, isIconInSelection]
	);

	// End selection
	const endSelection = useCallback(() => {
		setIsSelecting(false);
		setSelectionRect(null);
	}, []);

	// Toggle individual item selection
	const toggleSelection = useCallback(
		(itemId: string, e?: React.MouseEvent) => {
			setSelectedItems((prev) => {
				const newSelection = new Set(prev);

				if (e?.ctrlKey || e?.metaKey) {
					// Toggle with Ctrl/Cmd
					if (newSelection.has(itemId)) {
						newSelection.delete(itemId);
					} else {
						newSelection.add(itemId);
					}
				} else if (e?.shiftKey && newSelection.size > 0) {
					// Range selection with Shift
					// This would need to be implemented based on item positions
					newSelection.add(itemId);
				} else {
					// Single selection
					newSelection.clear();
					newSelection.add(itemId);
				}

				return newSelection;
			});
		},
		[]
	);

	// Select all items
	const selectAll = useCallback(() => {
		const icons = containerRef.current?.querySelectorAll(
			'[data-desktop-icon]'
		) as NodeListOf<HTMLElement>;
		const allIds = Array.from(icons)
			.map((icon) => icon.dataset.itemId)
			.filter(Boolean) as string[];

		setSelectedItems(new Set(allIds));
	}, []);

	// Clear selection
	const clearSelection = useCallback(() => {
		setSelectedItems(new Set());
	}, []);

	// Check if item is selected
	const isItemSelected = useCallback(
		(itemId: string) => {
			return selectedItems.has(itemId);
		},
		[selectedItems]
	);

	// Get selected items array
	const getSelectedItems = useCallback(
		(allItems: DesktopItem[]): DesktopItem[] => {
			return allItems.filter((item) => selectedItems.has(item.id));
		},
		[selectedItems]
	);

	// Delete selected items
	const deleteSelected = useCallback(() => {
		if (selectedItems.size === 0) return;

		clearSelection();
	}, [selectedItems, clearSelection]);

	// Move selected items to folder
	const moveSelectedToFolder = useCallback(
		(_folderId: string) => {
			if (selectedItems.size === 0) return;

			clearSelection();
		},
		[selectedItems, clearSelection]
	);

	// Copy selected items
	const copySelected = useCallback(() => {
		if (selectedItems.size === 0) return;

		setCopyBuffer({
			items: Array.from(selectedItems),
			operation: 'copy',
		});
	}, [selectedItems]);

	// Cut selected items
	const cutSelected = useCallback(() => {
		if (selectedItems.size === 0) return;

		setCopyBuffer({
			items: Array.from(selectedItems),
			operation: 'cut',
		});
	}, [selectedItems]);

	// Paste items
	const pasteSelected = useCallback(() => {
		if (!copyBuffer) return;

		if (copyBuffer.operation === 'cut') {
			// Clear selection after cut
			setCopyBuffer(null);
		}
	}, [copyBuffer]);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				clearSelection();
			} else if (e.ctrlKey && e.key === 'a') {
				e.preventDefault();
				selectAll();
			} else if (e.ctrlKey && e.key === 'c') {
				e.preventDefault();
				copySelected();
			} else if (e.ctrlKey && e.key === 'x') {
				e.preventDefault();
				cutSelected();
			} else if (e.ctrlKey && e.key === 'v') {
				e.preventDefault();
				pasteSelected();
			} else if (e.key === 'Delete') {
				deleteSelected();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [
		clearSelection,
		selectAll,
		copySelected,
		cutSelected,
		pasteSelected,
		deleteSelected,
	]);

	return {
		selectedItems,
		isSelecting,
		selectionRect,
		startSelection,
		updateSelection,
		endSelection,
		toggleSelection,
		selectAll,
		clearSelection,
		isItemSelected,
		getSelectedItems,
		deleteSelected,
		moveSelectedToFolder,
		copySelected,
		cutSelected,
		pasteSelected,
	};
}
