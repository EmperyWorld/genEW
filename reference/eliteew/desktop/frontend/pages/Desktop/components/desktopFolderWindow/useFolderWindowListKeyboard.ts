/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Keyboard navigation and batch actions for Desktop folder window list body (library + nested shortcuts).
 *
 * Invariants:
 * - Ctrl/Cmd+A prefers nested selection when library selection is empty and nested rows exist.
 *
 * Related:
 * - DesktopFolderListBodyPanel.tsx; useFolderWindowSelection.ts
 */

import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FolderFileItem } from '../../hooks/useFolderContents';
import type { DesktopItem } from '../../types/desktop.types';
import {
	isDesktopSystemFolder,
	type DesktopFolderPathSegment,
} from '../../utils/desktopItemTree';
import type { useDesktopAppProps } from '../../context/DesktopAppPropsContext';

type AppProps = ReturnType<typeof useDesktopAppProps>;

export type FolderFileAction =
	| 'view'
	| 'download'
	| 'rename'
	| 'delete'
	| 'play-in-player';

export interface UseFolderWindowListKeyboardOptions {
	appProps: AppProps;
	filesList: FolderFileItem[];
	focusedIndex: number;
	setFocusedIndex: Dispatch<SetStateAction<number>>;
	selectedIds: Set<string>;
	nestedSelectedIds: Set<string>;
	nestedDesktopItems: DesktopItem[];
	nestedFolderPathPrefix: string[];
	pathSegments: DesktopFolderPathSegment[];
	clearAllSelection: () => void;
	clearSelection: () => void;
	clearNestedSelection: () => void;
	selectAllIds: (ids: Iterable<string>) => void;
	selectAllNestedIds: (ids: Iterable<string>) => void;
	setFolderFileContextMenu: Dispatch<
		SetStateAction<{
			x: number;
			y: number;
			targets: FolderFileItem[];
			submenu?: 'move';
		} | null>
	>;
	setFolderBgContextMenu: Dispatch<
		SetStateAction<{ x: number; y: number } | null>
	>;
	setNestedMoveMenu: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
	setRenamingNestedId: Dispatch<SetStateAction<string | null>>;
	setNestedDeletePending: Dispatch<SetStateAction<DesktopItem[] | null>>;
	setFolderDeletePending: Dispatch<SetStateAction<FolderFileItem[] | null>>;
	requestNestedDelete: (targets: DesktopItem[]) => void;
	handleFolderFileAction: (
		action: FolderFileAction,
		file: FolderFileItem
	) => void;
	openFolderRename: (file: FolderFileItem) => void;
	navigateToFolder: (folderId: string) => void;
}

export function useFolderWindowListKeyboard({
	appProps,
	filesList,
	focusedIndex,
	setFocusedIndex,
	selectedIds,
	nestedSelectedIds,
	nestedDesktopItems,
	nestedFolderPathPrefix,
	pathSegments,
	clearAllSelection,
	clearSelection,
	clearNestedSelection,
	selectAllIds,
	selectAllNestedIds,
	setFolderFileContextMenu,
	setFolderBgContextMenu,
	setNestedMoveMenu,
	setRenamingNestedId,
	setNestedDeletePending,
	setFolderDeletePending,
	requestNestedDelete,
	handleFolderFileAction,
	openFolderRename,
	navigateToFolder,
}: UseFolderWindowListKeyboardOptions) {
	const handleListKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Escape') {
				clearAllSelection();
				setFolderFileContextMenu(null);
				setFolderBgContextMenu(null);
				setNestedMoveMenu(null);
				setRenamingNestedId(null);
				setNestedDeletePending(null);
				return;
			}
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
				if (nestedDesktopItems.length > 0 && selectedIds.size === 0) {
					e.preventDefault();
					clearSelection();
					selectAllNestedIds(
						nestedDesktopItems
							.filter((row) => !isDesktopSystemFolder(row))
							.map((row) => row.id)
					);
					return;
				}
				e.preventDefault();
				clearNestedSelection();
				selectAllIds(filesList.map((f) => f.id));
				return;
			}
			if (e.key === 'Delete' || e.key === 'Backspace') {
				if (e.key === 'Backspace' && e.target instanceof HTMLInputElement) {
					return;
				}
				if (nestedSelectedIds.size > 0) {
					e.preventDefault();
					requestNestedDelete(
						nestedDesktopItems.filter((row) => nestedSelectedIds.has(row.id))
					);
					return;
				}
				if (selectedIds.size > 0) {
					e.preventDefault();
					setFolderDeletePending(
						filesList.filter((f) => selectedIds.has(f.id))
					);
				} else if (filesList.length > 0 && focusedIndex >= 0) {
					e.preventDefault();
					const f = filesList[focusedIndex];
					if (f) setFolderDeletePending([f]);
				}
				return;
			}
			if (e.key === 'Enter') {
				if (nestedSelectedIds.size > 0 && selectedIds.size === 0) {
					e.preventDefault();
					const pick = nestedDesktopItems.find((row) =>
						nestedSelectedIds.has(row.id)
					);
					if (pick) {
						appProps?.openDesktopItem?.(pick, {
							folderPathPrefix: nestedFolderPathPrefix,
						});
					}
					return;
				}
				e.preventDefault();
				const pick =
					selectedIds.size === 1
						? filesList.find((f) => selectedIds.has(f.id))
						: filesList[focusedIndex];
				if (pick) handleFolderFileAction('view', pick);
				return;
			}
			if (e.key === 'F2') {
				if (nestedSelectedIds.size === 1) {
					const pick = nestedDesktopItems.find((row) =>
						nestedSelectedIds.has(row.id)
					);
					if (pick?.type === 'folder' && !isDesktopSystemFolder(pick)) {
						e.preventDefault();
						setRenamingNestedId(pick.id);
						return;
					}
				}
				e.preventDefault();
				const pick =
					selectedIds.size === 1
						? filesList.find((f) => selectedIds.has(f.id))
						: filesList[focusedIndex];
				if (pick) {
					openFolderRename(pick);
				}
				return;
			}
			if (
				(e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) &&
				selectedIds.size === 0 &&
				nestedSelectedIds.size === 0 &&
				pathSegments.length > 1
			) {
				if (
					e.target instanceof HTMLInputElement ||
					e.target instanceof HTMLTextAreaElement ||
					e.target instanceof HTMLSelectElement
				) {
					return;
				}
				e.preventDefault();
				const parent = pathSegments[pathSegments.length - 2];
				if (parent) navigateToFolder(parent.id);
				return;
			}
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				setFocusedIndex((i) =>
					Math.min(filesList.length - 1, Math.max(0, i + 1))
				);
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				setFocusedIndex((i) => Math.max(0, i - 1));
			}
		},
		[
			appProps,
			clearAllSelection,
			clearNestedSelection,
			clearSelection,
			filesList,
			focusedIndex,
			handleFolderFileAction,
			openFolderRename,
			nestedDesktopItems,
			nestedFolderPathPrefix,
			nestedSelectedIds,
			navigateToFolder,
			pathSegments,
			requestNestedDelete,
			selectedIds,
			selectAllIds,
			selectAllNestedIds,
			setFolderBgContextMenu,
			setFolderDeletePending,
			setFolderFileContextMenu,
			setNestedDeletePending,
			setNestedMoveMenu,
			setRenamingNestedId,
			setFocusedIndex,
		]
	);

	return { handleListKeyDown };
}
