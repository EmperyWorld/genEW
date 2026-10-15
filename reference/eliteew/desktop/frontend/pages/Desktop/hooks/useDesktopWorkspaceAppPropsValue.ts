/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Merges **рабочий стол** app context (`DesktopAppPropsContext`): embedded theme, navigate, Content Manager, optional
 * config refresh after companion `patch_desktop_config`.
 *
 * Invariants:
 * - **`refreshDesktopConfigFromServer`** пробрасывается только если задана (не пустой объект в value).
 *
 * Related:
 * - `DesktopWorkspaceContent` · `useDesktopStorage.refresh`
 */
import { useMemo } from 'react';
import type { DesktopAppPropsContextValue } from '../context/DesktopAppPropsContext';
import type { DesktopItem } from '../types/desktop.types';

export function useDesktopWorkspaceAppPropsValue(params: {
	appPropsValueBase: Omit<
		DesktopAppPropsContextValue,
		| 'theme'
		| 'onNavigate'
		| 'openContentManager'
		| 'refreshDesktopConfigFromServer'
		| 'desktopItems'
		| 'openDesktopItem'
		| 'liftDesktopItemsToRoot'
		| 'liftDesktopItemsOneLevel'
		| 'moveDesktopNestedItemsToFolder'
		| 'renameDesktopItem'
		| 'deleteDesktopItems'
		| 'openNewFolderDialog'
		| 'createMarkdownFileInFolder'
		| 'openEditFolderIconDialog'
		| 'openDesktopItemProperties'
	>;
	desktopEmbeddedAppTheme: NonNullable<DesktopAppPropsContextValue['theme']>;
	onNavigate: NonNullable<DesktopAppPropsContextValue['onNavigate']>;
	openContentManager: NonNullable<
		DesktopAppPropsContextValue['openContentManager']
	>;
	refreshDesktopConfigFromServer?: DesktopAppPropsContextValue['refreshDesktopConfigFromServer'];
	desktopItems: DesktopItem[];
	openDesktopItem: (
		item: DesktopItem,
		options?: { folderPathPrefix?: string[] }
	) => void;
	liftDesktopItemsToRoot: (itemIds: string[]) => void;
	liftDesktopItemsOneLevel: (
		itemIds: string[],
		currentFolderId: string
	) => void;
	moveDesktopNestedItemsToFolder: (
		itemIds: string[],
		targetFolderId: string
	) => void;
	renameDesktopItem: (itemId: string, newName: string) => void;
	deleteDesktopItems: (itemIds: string[]) => void;
	openNewFolderDialog?: (
		parentFolderId?: string,
		onCreated?: (folder: DesktopItem) => void
	) => void;
	createMarkdownFileInFolder?: DesktopAppPropsContextValue['createMarkdownFileInFolder'];
	openEditFolderIconDialog?: DesktopAppPropsContextValue['openEditFolderIconDialog'];
	openDesktopItemProperties?: DesktopAppPropsContextValue['openDesktopItemProperties'];
}): DesktopAppPropsContextValue {
	const {
		appPropsValueBase,
		desktopEmbeddedAppTheme,
		onNavigate,
		openContentManager,
		refreshDesktopConfigFromServer,
		desktopItems,
		openDesktopItem,
		liftDesktopItemsToRoot,
		liftDesktopItemsOneLevel,
		moveDesktopNestedItemsToFolder,
		renameDesktopItem,
		deleteDesktopItems,
		openNewFolderDialog,
		createMarkdownFileInFolder,
		openEditFolderIconDialog,
		openDesktopItemProperties,
	} = params;

	return useMemo(
		() => ({
			...appPropsValueBase,
			theme: desktopEmbeddedAppTheme,
			onNavigate,
			openContentManager,
			desktopItems,
			openDesktopItem,
			liftDesktopItemsToRoot,
			liftDesktopItemsOneLevel,
			moveDesktopNestedItemsToFolder,
			renameDesktopItem,
			deleteDesktopItems,
			...(openNewFolderDialog ? { openNewFolderDialog } : {}),
			...(createMarkdownFileInFolder ? { createMarkdownFileInFolder } : {}),
			...(openEditFolderIconDialog ? { openEditFolderIconDialog } : {}),
			...(openDesktopItemProperties ? { openDesktopItemProperties } : {}),
			...(refreshDesktopConfigFromServer
				? { refreshDesktopConfigFromServer }
				: {}),
		}),
		[
			appPropsValueBase,
			desktopEmbeddedAppTheme,
			desktopItems,
			onNavigate,
			openContentManager,
			openDesktopItem,
			liftDesktopItemsToRoot,
			liftDesktopItemsOneLevel,
			moveDesktopNestedItemsToFolder,
			renameDesktopItem,
			deleteDesktopItems,
			openNewFolderDialog,
			createMarkdownFileInFolder,
			openEditFolderIconDialog,
			openDesktopItemProperties,
			refreshDesktopConfigFromServer,
		]
	);
}
