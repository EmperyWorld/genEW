/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Grouped params for the T34 nav / app-props / side-effects cluster in DesktopWorkspaceContent.
 *
 * Invariants:
 * - Child hook param shapes stay unchanged; cluster only wires sequential calls.
 *
 * Related:
 * - hooks/useDesktopWorkspaceShellNavAppPropsAndSideEffectsCluster.ts
 */

import type { RefObject } from 'react';
import type { PageType } from '../../../hooks/useAppState';
import type { DesktopAppPropsContextValue } from '../context/DesktopAppPropsContext';
import type { DesktopItem } from '../types/desktop.types';
import type { OpenWindowOptions } from '../hooks/useWindowManager';
import type { DesktopWorkspaceShellLaunchHostEffectsClusterParams } from '../hooks/useDesktopWorkspaceShellLaunchHostEffectsCluster';
import type { DesktopWorkspaceShellPostNavEffectsFlatClusterParams } from '../hooks/useDesktopWorkspaceShellPostNavEffectsFlatCluster';
import type { UseDesktopWorkspaceOpenAppAndInputSurfacesClusterParams } from '../hooks/useDesktopWorkspaceOpenAppAndInputSurfacesCluster';

export type DesktopWorkspaceShellNavAppPropsClusterNavigationInput = {
	handleOpenWindow: (item: DesktopItem, options?: OpenWindowOptions) => void;
	itemsRef: RefObject<DesktopItem[]>;
	canOpenUnifiedAdmin: boolean;
	setCurrentPage: (page: PageType) => void;
};

export type DesktopWorkspaceShellNavAppPropsClusterAppPropsInput = {
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
	refreshDesktopConfigFromServer: DesktopAppPropsContextValue['refreshDesktopConfigFromServer'];
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
};

export type DesktopWorkspaceShellNavAppPropsClusterPostNavInput = Omit<
	DesktopWorkspaceShellPostNavEffectsFlatClusterParams,
	'openUgsDesktopApp'
>;

export type DesktopWorkspaceShellNavAppPropsClusterInput = {
	launchHost: DesktopWorkspaceShellLaunchHostEffectsClusterParams;
	navigation: DesktopWorkspaceShellNavAppPropsClusterNavigationInput;
	appProps: DesktopWorkspaceShellNavAppPropsClusterAppPropsInput;
	postNav: DesktopWorkspaceShellNavAppPropsClusterPostNavInput;
	openAppInput: UseDesktopWorkspaceOpenAppAndInputSurfacesClusterParams;
};
