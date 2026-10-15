/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * QuickSearch + TaskSwitcher overlays — loaded only when either overlay is open.
 *
 * Invariants:
 * - Lazy-mounted from DesktopWorkspaceShellLayout; not imported by idle chrome.
 *
 * Related:
 * - DesktopWorkspaceHelpAndSession.tsx, QuickSearch.tsx, TaskSwitcher.tsx
 */

import * as React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DesktopIconStyle, DesktopWindowStyle } from '@/types/profile';
import type {
	DesktopItem,
	RecentFile,
	WindowState,
} from '../types/desktop.types';
import { QuickSearch, type QuickAction } from './QuickSearch';
import { TaskSwitcher } from './TaskSwitcher';

export interface DesktopWorkspaceQuickSearchHostProps {
	isOpen: boolean;
	onClose: () => void;
	iconStyle: DesktopIconStyle;
	shellWindowStyle: DesktopWindowStyle;
	items: DesktopItem[];
	onOpenItem: (item: DesktopItem) => void;
	recentItems?: DesktopItem[];
	recentFiles?: RecentFile[];
	recentLibraryOpened?: RecentFile[];
	recentLibraryAdded?: RecentFile[];
	recentLibraryGenerated?: RecentFile[];
	recentLibraryUploaded?: RecentFile[];
	recentLibraryProjects?: RecentFile[];
	recentContentFeedLoading?: boolean;
	recentContentFeedError?: string | null;
	onRefetchRecentContentFeed?: () => void | Promise<void>;
	onOpenRecentFile?: (file: RecentFile) => void;
	removeRecentFile?: (fileId: string) => void;
	onPinAppToDesktop?: (app: DesktopItem) => void;
	onQuickAction: (actionId: string) => void;
}

export interface DesktopWorkspaceSearchOverlaysProps {
	taskSwitcher: {
		isOpen: boolean;
		windows: WindowState[];
		currentWindowId?: string;
		iconStyle: DesktopIconStyle;
		onSelectWindow: (windowId: string) => void;
		onClose: () => void;
	};
	quickSearch: DesktopWorkspaceQuickSearchHostProps;
}

export const DesktopWorkspaceSearchOverlays: React.FC<
	DesktopWorkspaceSearchOverlaysProps
> = ({ taskSwitcher, quickSearch }) => {
	const { t } = useTranslation('desktopUi');
	const quickActions = useMemo((): QuickAction[] => {
		const L = 'quickSearch.launcherQuickActions';
		const kw = (s: string) => s.split(/\s+/).filter(Boolean);
		return [
			{
				id: 'app-store',
				label: t('startMenu.appStoreTitle'),
				description: t(`${L}.appStore.description`),
				keywords: kw(t(`${L}.appStore.keywords`)),
			},
			{
				id: 'settings',
				label: t('startMenu.settingsTitle'),
				description: t(`${L}.settings.description`),
				keywords: kw(t(`${L}.settings.keywords`)),
			},
			{
				id: 'notifications',
				label: t('taskbar.notificationCenter'),
				description: t(`${L}.notifications.description`),
				keywords: kw(t(`${L}.notifications.keywords`)),
			},
			{
				id: 'shortcuts-help',
				label: t('taskbar.shortcutsTooltip'),
				description: t(`${L}.shortcutsHelp.description`),
				keywords: kw(t(`${L}.shortcutsHelp.keywords`)),
			},
		];
	}, [t]);

	return (
		<>
			<TaskSwitcher
				isOpen={taskSwitcher.isOpen}
				windows={taskSwitcher.windows}
				currentWindowId={taskSwitcher.currentWindowId}
				iconStyle={taskSwitcher.iconStyle}
				onSelectWindow={taskSwitcher.onSelectWindow}
				onClose={taskSwitcher.onClose}
			/>
			<QuickSearch
				isOpen={quickSearch.isOpen}
				onClose={quickSearch.onClose}
				iconStyle={quickSearch.iconStyle}
				shellWindowStyle={quickSearch.shellWindowStyle}
				items={quickSearch.items}
				onOpenItem={quickSearch.onOpenItem}
				recentItems={quickSearch.recentItems}
				recentFiles={quickSearch.recentFiles}
				recentLibraryOpened={quickSearch.recentLibraryOpened}
				recentLibraryAdded={quickSearch.recentLibraryAdded}
				recentLibraryGenerated={quickSearch.recentLibraryGenerated}
				recentLibraryUploaded={quickSearch.recentLibraryUploaded}
				recentLibraryProjects={quickSearch.recentLibraryProjects}
				recentContentFeedLoading={quickSearch.recentContentFeedLoading}
				recentContentFeedError={quickSearch.recentContentFeedError}
				onRefetchRecentContentFeed={quickSearch.onRefetchRecentContentFeed}
				onOpenRecentFile={quickSearch.onOpenRecentFile}
				removeRecentFile={quickSearch.removeRecentFile}
				onPinAppToDesktop={quickSearch.onPinAppToDesktop}
				quickActions={quickActions}
				onQuickAction={quickSearch.onQuickAction}
			/>
		</>
	);
};
