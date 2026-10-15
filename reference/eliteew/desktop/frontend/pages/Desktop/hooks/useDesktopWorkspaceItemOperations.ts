/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Focused desktop item operation bridge for folder dialogs, folder icon edits, nested moves,
 * markdown creation, rename/delete, and properties opening.
 *
 * Invariants:
 * - Operations mutate items only through the provided commit function.
 * - Folder window root sentinel never persists as a real parent id.
 *
 * Related:
 * - `DesktopWorkspaceContent.tsx`
 * - `utils/desktopItemTree.ts`
 */

import * as React from 'react';
import { toast } from 'sonner';
import type { TFunction } from 'i18next';
import type { UserFolderIconId } from '../constants/folderIcons';
import type { DesktopItem, WindowInitialPayload } from '../types/desktop.types';
import {
	collectDesktopDeleteIds,
	FOLDER_WINDOW_ROOT_ID,
	liftDesktopItemsOneLevel as remapLiftDesktopItemsOneLevel,
	liftDesktopItemsToRoot as remapLiftDesktopItemsToRoot,
	moveDesktopItemsIntoFolderWithReport,
	removeDesktopItemsByIds,
} from '../utils/desktopItemTree';
import { requestDesktopFolderLibraryCountsInvalidate } from '@/services/unifiedContentEvents';

type CommitItems = (
	mutator: (items: DesktopItem[]) => DesktopItem[]
) => void | Promise<void>;

type OpenDesktopAppByComponent = (
	appComponent: string,
	options?: { initialPayload?: WindowInitialPayload }
) => unknown;

type DesktopToastApi = {
	info: (title: string, message?: string) => unknown;
};

export function useDesktopWorkspaceItemOperations(params: {
	commitItems: CommitItems;
	createFolder: (
		name: string,
		options: { parentId?: string; folderIconId?: UserFolderIconId }
	) => Promise<DesktopItem>;
	createMarkdownFile: (options?: {
		parentId?: string;
	}) => Promise<{ contentId: string; item: DesktopItem } | null>;
	desktopToast: DesktopToastApi;
	newFolderDialogRef: React.MutableRefObject<{
		parentId?: string;
		onCreated?: (folder: DesktopItem) => void;
	}>;
	openDesktopAppByComponent: OpenDesktopAppByComponent;
	setPropertiesItem: (item: DesktopItem | null) => void;
	setShowNF: (value: boolean) => void;
	t: TFunction<'desktopUi'>;
	updateFolderIcon: (
		itemId: string,
		folderIconId: UserFolderIconId
	) => Promise<void>;
}) {
	const {
		commitItems,
		createFolder,
		createMarkdownFile,
		desktopToast,
		newFolderDialogRef,
		openDesktopAppByComponent,
		setPropertiesItem,
		setShowNF,
		t,
		updateFolderIcon,
	} = params;
	const [editFolderIconTarget, setEditFolderIconTarget] =
		React.useState<DesktopItem | null>(null);

	const handleCreateFolderForDialog = React.useCallback(
		async (name: string, iconId: UserFolderIconId) => {
			const { parentId, onCreated } = newFolderDialogRef.current;
			newFolderDialogRef.current = {};
			const created = await createFolder(name, {
				parentId,
				folderIconId: iconId,
			});
			onCreated?.(created);
		},
		[createFolder, newFolderDialogRef]
	);

	const openEditFolderIconDialog = React.useCallback((item: DesktopItem) => {
		setEditFolderIconTarget(item);
	}, []);

	const openDesktopItemProperties = React.useCallback(
		(item: DesktopItem) => {
			setPropertiesItem(item);
		},
		[setPropertiesItem]
	);

	const onCloseEditFolderIcon = React.useCallback(() => {
		setEditFolderIconTarget(null);
	}, []);

	const handleSaveFolderIcon = React.useCallback(
		async (iconId: UserFolderIconId) => {
			if (!editFolderIconTarget) return;
			await updateFolderIcon(editFolderIconTarget.id, iconId);
			setEditFolderIconTarget(null);
		},
		[editFolderIconTarget, updateFolderIcon]
	);

	const openNewFolderDialog = React.useCallback(
		(parentFolderId?: string, onCreated?: (folder: DesktopItem) => void) => {
			newFolderDialogRef.current = { parentId: parentFolderId, onCreated };
			setShowNF(true);
		},
		[newFolderDialogRef, setShowNF]
	);

	const createMarkdownFileInFolder = React.useCallback(
		async (parentFolderId?: string) => {
			const parentId =
				!parentFolderId || parentFolderId === FOLDER_WINDOW_ROOT_ID
					? undefined
					: parentFolderId;
			const created = await createMarkdownFile({ parentId });
			if (!created) return;
			openDesktopAppByComponent('DocEditor', {
				initialPayload: { unifiedContentId: created.contentId },
			});
			toast.success(
				t('storage.createMarkdownSuccessTitle'),
				t('storage.createMarkdownSuccessBody', {
					name: created.item.name,
				})
			);
			if (parentId) {
				requestDesktopFolderLibraryCountsInvalidate({
					folderIds: [parentId],
				});
			}
		},
		[createMarkdownFile, openDesktopAppByComponent, t]
	);

	const liftDesktopItemsToRoot = React.useCallback(
		(itemIds: string[]) => {
			commitItems((prev) => remapLiftDesktopItemsToRoot(prev, itemIds));
		},
		[commitItems]
	);

	const liftDesktopItemsOneLevel = React.useCallback(
		(itemIds: string[], currentFolderId: string) => {
			commitItems((prev) =>
				remapLiftDesktopItemsOneLevel(prev, itemIds, currentFolderId)
			);
		},
		[commitItems]
	);

	const moveDesktopNestedItemsToFolder = React.useCallback(
		(itemIds: string[], targetFolderId: string) => {
			let skippedCount = 0;
			commitItems((prev) => {
				const report = moveDesktopItemsIntoFolderWithReport(
					prev,
					itemIds,
					targetFolderId
				);
				skippedCount = report.skippedIds.length;
				return report.items;
			});
			if (skippedCount > 0) {
				desktopToast.info(
					t('workspace.folderMovePartialTitle'),
					t('workspace.folderMovePartialBody', { count: skippedCount })
				);
			}
		},
		[commitItems, desktopToast, t]
	);

	const renameDesktopItem = React.useCallback(
		(itemId: string, newName: string) => {
			const trimmed = newName.trim();
			if (!trimmed) return;
			commitItems((prev) =>
				prev.map((item) =>
					item.id === itemId ? { ...item, name: trimmed } : item
				)
			);
		},
		[commitItems]
	);

	const deleteDesktopItems = React.useCallback(
		(itemIds: string[]) => {
			if (itemIds.length === 0) return;
			commitItems((prev) => {
				const ids = collectDesktopDeleteIds(prev, itemIds);
				return removeDesktopItemsByIds(prev, ids);
			});
		},
		[commitItems]
	);

	return {
		editFolderIconTarget,
		handleCreateFolderForDialog,
		openEditFolderIconDialog,
		openDesktopItemProperties,
		onCloseEditFolderIcon,
		handleSaveFolderIcon,
		openNewFolderDialog,
		createMarkdownFileInFolder,
		liftDesktopItemsToRoot,
		liftDesktopItemsOneLevel,
		moveDesktopNestedItemsToFolder,
		renameDesktopItem,
		deleteDesktopItems,
	};
}
