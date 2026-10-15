/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Folder window navigation: path chain, tree roots, nested desktop shortcuts, move/rename/delete helpers.
 *
 * Invariants:
 * - Root section label comes from i18n; tree root id is {@link FOLDER_WINDOW_ROOT_ID}.
 *
 * Related:
 * - desktopItemTree.ts · DesktopFolderPathBar.tsx · DesktopFolderExplorerSidebar.tsx
 */

import { useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { FolderViewDesktopChild } from '@/services/contentApi';
import type { DesktopItem } from '../../types/desktop.types';
import {
	FOLDER_WINDOW_ROOT_ID,
	buildDesktopFolderPathChain,
	buildDesktopFolderTreeNodes,
	isDesktopSystemFolder,
	listValidNestedMoveTargetFolders,
	type DesktopFolderPathSegment,
} from '../../utils/desktopItemTree';
import { resolveDesktopFolderDisplayName } from '../../utils/desktopSystemFolderLabels';
import type { useDesktopAppProps } from '../../context/DesktopAppPropsContext';

type AppProps = ReturnType<typeof useDesktopAppProps>;

export interface UseFolderWindowNavigationOptions {
	appProps: AppProps;
	desktopItems: DesktopItem[];
	folderDesktopChildren: FolderViewDesktopChild[];
	effectiveFolderId: string;
	rootSectionLabel: string;
	winTitle: string;
	nestedSelectedIds: Set<string>;
	onRetargetFolder?: (target: {
		folderId: string;
		title: string;
		path: string[];
	}) => void;
	clearAllSelection: () => void;
	setSearchInput: Dispatch<SetStateAction<string>>;
	setRenamingNestedId: Dispatch<SetStateAction<string | null>>;
	setNestedDeletePending: Dispatch<SetStateAction<DesktopItem[] | null>>;
	setNestedMoveMenu: Dispatch<
		SetStateAction<{
			x: number;
			y: number;
		} | null>
	>;
	clearNestedSelection: () => void;
}

export function useFolderWindowNavigation({
	appProps,
	desktopItems,
	folderDesktopChildren,
	effectiveFolderId,
	rootSectionLabel,
	winTitle,
	nestedSelectedIds,
	onRetargetFolder,
	clearAllSelection,
	setSearchInput,
	setRenamingNestedId,
	setNestedDeletePending,
	setNestedMoveMenu,
	clearNestedSelection,
}: UseFolderWindowNavigationOptions) {
	const { t: tDesktopUi } = useTranslation('desktopUi');
	const pathSegments = useMemo((): DesktopFolderPathSegment[] => {
		const chain = buildDesktopFolderPathChain(
			desktopItems,
			effectiveFolderId,
			rootSectionLabel
		);
		return chain.map((segment) => {
			if (segment.id === FOLDER_WINDOW_ROOT_ID) return segment;
			const item = desktopItems.find((row) => row.id === segment.id);
			if (!item) return segment;
			return {
				...segment,
				name: resolveDesktopFolderDisplayName(item, tDesktopUi),
			};
		});
	}, [desktopItems, effectiveFolderId, rootSectionLabel, tDesktopUi]);

	const folderTreeRoots = useMemo(
		() => buildDesktopFolderTreeNodes(desktopItems),
		[desktopItems]
	);

	const nestedDesktopItems = useMemo(
		() =>
			folderDesktopChildren.map(
				(item): DesktopItem => ({
					id: item.item_id,
					name: item.name,
					type: item.item_type.toLowerCase() as DesktopItem['type'],
					position: {
						x: Number(item.position.x) || 20,
						y: Number(item.position.y) || 20,
					},
					color: item.color ?? undefined,
					gradient: item.gradient ?? undefined,
					isPinned: item.is_pinned,
					appComponent: item.app_component ?? undefined,
					parentId: item.parent_item_id ?? undefined,
					isSystem: item.is_system,
					systemKey: item.system_key ?? undefined,
					meta: item.meta,
					created_at: item.created_at,
					updated_at: item.updated_at,
				})
			),
		[folderDesktopChildren]
	);

	const hasNestedDesktopItems = nestedDesktopItems.length > 0;

	const nestedFolderPathPrefix = useMemo(() => {
		const names = pathSegments.map((segment) => segment.name);
		if (effectiveFolderId === FOLDER_WINDOW_ROOT_ID) {
			return names;
		}
		return names.length > 1 ? names.slice(1) : [winTitle];
	}, [effectiveFolderId, pathSegments, winTitle]);

	const navigateToFolder = useCallback(
		(folderId: string) => {
			if (!onRetargetFolder) return;
			const segments = buildDesktopFolderPathChain(
				desktopItems,
				folderId,
				rootSectionLabel
			);
			const last = segments[segments.length - 1];
			onRetargetFolder({
				folderId,
				title: last?.name ?? rootSectionLabel,
				path: segments.map((segment) => segment.name),
			});
			clearAllSelection();
			setSearchInput('');
		},
		[
			clearAllSelection,
			desktopItems,
			onRetargetFolder,
			rootSectionLabel,
			setSearchInput,
		]
	);

	const navigateToPathSegment = useCallback(
		(segment: DesktopFolderPathSegment) => {
			navigateToFolder(segment.id);
		},
		[navigateToFolder]
	);

	const nestedMoveTargetFolders = useMemo(
		() =>
			listValidNestedMoveTargetFolders(desktopItems, nestedSelectedIds).map(
				(row) => ({ id: row.id, name: row.name || row.id })
			),
		[desktopItems, nestedSelectedIds]
	);

	const nestedSelectionCanMoveToRoot = useMemo(() => {
		return Array.from(nestedSelectedIds).some((id) => {
			const row = desktopItems.find((item) => item.id === id);
			return Boolean(row?.parentId);
		});
	}, [desktopItems, nestedSelectedIds]);

	const handleMoveNestedTargetsToFolder = useCallback(
		(targetFolderId: string | null) => {
			const ids = Array.from(nestedSelectedIds);
			if (ids.length === 0) return;
			appProps?.moveDesktopNestedItemsToFolder?.(
				ids,
				targetFolderId ?? FOLDER_WINDOW_ROOT_ID
			);
			clearNestedSelection();
			setNestedMoveMenu(null);
		},
		[appProps, clearNestedSelection, nestedSelectedIds, setNestedMoveMenu]
	);

	const handleNestedRenameCommit = useCallback(
		(itemId: string, name: string) => {
			const trimmed = name.trim();
			const item = nestedDesktopItems.find((row) => row.id === itemId);
			if (!item || !trimmed || trimmed === item.name) {
				setRenamingNestedId(null);
				return;
			}
			appProps?.renameDesktopItem?.(itemId, trimmed);
			setRenamingNestedId(null);
		},
		[appProps, nestedDesktopItems, setRenamingNestedId]
	);

	const requestNestedDelete = useCallback(
		(targets: DesktopItem[]) => {
			const deletable = targets.filter((row) => !isDesktopSystemFolder(row));
			if (deletable.length === 0) return;
			setNestedDeletePending(deletable);
		},
		[setNestedDeletePending]
	);

	return {
		pathSegments,
		folderTreeRoots,
		nestedDesktopItems,
		hasNestedDesktopItems,
		nestedFolderPathPrefix,
		navigateToFolder,
		navigateToPathSegment,
		nestedMoveTargetFolders,
		nestedSelectionCanMoveToRoot,
		handleMoveNestedTargetsToFolder,
		handleNestedRenameCommit,
		requestNestedDelete,
	};
}
