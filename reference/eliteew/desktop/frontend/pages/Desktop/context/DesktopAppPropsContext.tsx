/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Context for props passed into **desktop window** content (navigate, embedded theme, user, Content Manager opener).
 *
 * Invariants:
 * - **`refreshDesktopConfigFromServer`** is optional; when set (рабочий стол), вызывается после server-side
 *   `PATCH /desktop/config` из компаньона, чтобы подтянуть тему/обои без перезагрузки вкладки.
 *
 * Related:
 * - `DesktopWorkspaceContent` · `useDesktopStorage.refresh`
 * - `EwaDesktopApp` / `EwaCompanionChatPanel` (`desktop_config_patch_applied`)
 */

import * as React from 'react';
import { createContext, useContext, useMemo } from 'react';
import type { PageType } from '../../../hooks/useAppState';
import type { User } from '../../../services';
import type { AppSettings } from '../../../hooks/useAppState';
import type { WindowInitialPayload } from '../types/desktop.types';

export interface DesktopAppTheme {
	primary: string;
	secondary: string;
	background: string;
	surface: string;
	text: string;
	accent: string;
	success: string;
	warning: string;
	error: string;
	info: string;
}

import type { DesktopItem } from '../types/desktop.types';

export interface DesktopAppPropsContextValue {
	/** Открыть Content Manager с опциональным {@link WindowInitialPayload} (в т.ч. `contentManagerFolderItemId`). */
	openContentManager?: (payload?: Partial<WindowInitialPayload>) => void;
	onNavigate?: (page: PageType | string) => void;
	onUserUpdate?: (
		user: { profile?: { avatar_url?: string | null } } | null
	) => void;
	theme?: DesktopAppTheme;
	user?: User | null;
	settings?: AppSettings;
	isAuthenticated?: boolean;
	/** После server-side `PATCH /desktop/config` (компаньон `patch_desktop_config`) — перезагрузить конфиг стола из API. */
	refreshDesktopConfigFromServer?: () => Promise<void>;
	/** All desktop items (for nested folder windows). */
	desktopItems?: DesktopItem[];
	/** Open folder/file shortcut from folder window. */
	openDesktopItem?: (
		item: DesktopItem,
		options?: { folderPathPrefix?: string[] }
	) => void;
	/** Clear parentId for nested desktop shortcuts (move to desktop root). */
	liftDesktopItemsToRoot?: (itemIds: string[]) => void;
	/** Move nested shortcuts one folder level up from `currentFolderId`. */
	liftDesktopItemsOneLevel?: (
		itemIds: string[],
		currentFolderId: string
	) => void;
	/** Reparent nested shortcuts to a folder or desktop root (`FOLDER_WINDOW_ROOT_ID`). */
	moveDesktopNestedItemsToFolder?: (
		itemIds: string[],
		targetFolderId: string
	) => void;
	/** Rename a desktop item (nested folder window F2). */
	renameDesktopItem?: (itemId: string, newName: string) => void;
	/** Remove desktop shortcuts (nested folder window delete; includes descendants). */
	deleteDesktopItems?: (itemIds: string[]) => void;
	/** Open global New Folder dialog; optional parent = nested folder inside open folder window. */
	openNewFolderDialog?: (
		parentFolderId?: string,
		onCreated?: (folder: DesktopItem) => void
	) => void;
	/** Create markdown in library + desktop shortcut under folder window parent. */
	createMarkdownFileInFolder?: (parentFolderId?: string) => Promise<void>;
	/** Open folder icon picker for a user folder (nested folder window). */
	openEditFolderIconDialog?: (item: DesktopItem) => void;
	/** Open desktop item properties modal (nested folder window). */
	openDesktopItemProperties?: (item: DesktopItem) => void;
}

const DesktopAppPropsContext =
	createContext<DesktopAppPropsContextValue | null>(null);

export function useDesktopAppProps(): DesktopAppPropsContextValue | null {
	return useContext(DesktopAppPropsContext);
}

interface ProviderProps {
	value: DesktopAppPropsContextValue;
	children: React.ReactNode;
}

export function DesktopAppPropsProvider({
	value,
	children,
}: ProviderProps): React.ReactElement {
	const memoValue = useMemo(() => value, [value]);
	return (
		<DesktopAppPropsContext.Provider value={memoValue}>
			{children}
		</DesktopAppPropsContext.Provider>
	);
}
