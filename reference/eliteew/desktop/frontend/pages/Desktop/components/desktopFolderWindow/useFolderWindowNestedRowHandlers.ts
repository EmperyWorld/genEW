/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Nested desktop shortcut row click, checkbox toggle, and ensure-selected handlers in folder window list body.
 *
 * Invariants:
 * - Nested selection clears library selection on every nested interaction.
 *
 * Related:
 * - DesktopFolderListBodyPanel.tsx; DesktopFolderNestedItems.tsx
 */

import { useCallback, useRef } from 'react';
import type { DesktopItem } from '../../types/desktop.types';

export interface UseFolderWindowNestedRowHandlersOptions {
	clearSelection: () => void;
	nestedDesktopItems: DesktopItem[];
	nestedSelectedIds: Set<string>;
	selectAllNestedIds: (ids: Iterable<string>) => void;
	selectOneNested: (id: string) => void;
	toggleNestedSelect: (id: string) => void;
}

export function useFolderWindowNestedRowHandlers({
	clearSelection,
	nestedDesktopItems,
	nestedSelectedIds,
	selectAllNestedIds,
	selectOneNested,
	toggleNestedSelect,
}: UseFolderWindowNestedRowHandlersOptions) {
	const lastNestedClickedIndexRef = useRef<number | null>(null);

	const onNestedItemClick = useCallback(
		(e: React.MouseEvent, item: DesktopItem, index: number) => {
			clearSelection();
			if (e.shiftKey && lastNestedClickedIndexRef.current != null) {
				const a = Math.min(lastNestedClickedIndexRef.current, index);
				const b = Math.max(lastNestedClickedIndexRef.current, index);
				selectAllNestedIds(
					nestedDesktopItems.slice(a, b + 1).map((row) => row.id)
				);
			} else if (e.metaKey || e.ctrlKey) {
				toggleNestedSelect(item.id);
				lastNestedClickedIndexRef.current = index;
			} else {
				selectOneNested(item.id);
				lastNestedClickedIndexRef.current = index;
			}
		},
		[
			clearSelection,
			nestedDesktopItems,
			selectAllNestedIds,
			selectOneNested,
			toggleNestedSelect,
		]
	);

	const toggleNestedRowSelected = useCallback(
		(e: React.MouseEvent, item: DesktopItem, index: number) => {
			e.stopPropagation();
			e.preventDefault();
			clearSelection();
			toggleNestedSelect(item.id);
			lastNestedClickedIndexRef.current = index;
		},
		[clearSelection, toggleNestedSelect]
	);

	const ensureNestedSelected = useCallback(
		(item: DesktopItem) => {
			clearSelection();
			if (!nestedSelectedIds.has(item.id)) {
				selectOneNested(item.id);
			}
		},
		[clearSelection, nestedSelectedIds, selectOneNested]
	);

	return {
		onNestedItemClick,
		toggleNestedRowSelected,
		ensureNestedSelected,
		lastNestedClickedIndexRef,
	};
}
