import { useMemo } from 'react';
import type { DesktopControlCenterTab } from '../components/DesktopSettingsPanel';
import type { DesktopWorkspaceSearchOverlaysProps } from '../components/DesktopWorkspaceOverlays';
import type {
	DesktopItem,
	RecentFile,
	WindowState,
} from '../types/desktop.types';
import type { DesktopIconStyle, DesktopWindowStyle } from '@/types/profile';

export function useDesktopWorkspaceShellSearchOverlaysProps(params: {
	showTaskSwitcher: boolean;
	currentDesktopWindows: WindowState[];
	activeDesktopWindowId: string | null;
	desktopIconStyle: DesktopIconStyle;
	focusWindow: (id: string) => void;
	setShowTaskSwitcher: (v: boolean) => void;
	showQuickSearch: boolean;
	setShowQuickSearch: (v: boolean) => void;
	desktopWindowStyle: DesktopWindowStyle;
	displayItems: DesktopItem[];
	handleOpenWindow: (item: DesktopItem) => void;
	recordRecentApp: (id: string) => void;
	recentItemsForSearch: DesktopItem[];
	recentFiles: RecentFile[];
	recentLibraryOpened: RecentFile[];
	recentLibraryAdded: RecentFile[];
	recentLibraryGenerated: RecentFile[];
	recentLibraryUploaded: RecentFile[];
	recentLibraryProjects?: RecentFile[];
	recentContentFeedLoading?: boolean;
	recentContentFeedError?: string | null;
	onRefetchRecentContentFeed?: () => void | Promise<void>;
	/** Совпадает с Пуск: обновить недавние и открыть в DocEditor / Content Manager */
	onStartMenuOpenRecentFile?: (file: RecentFile) => void;
	addRecentFile: (file: RecentFile) => void;
	removeRecentFile: (fileId: string) => void;
	onPinAppToDesktop: (app: DesktopItem) => void;
	openShellSettings: (tab?: DesktopControlCenterTab) => void;
	bumpNotificationCenterOpen: () => void;
	setShowShortcutsHelp: (v: boolean) => void;
}): DesktopWorkspaceSearchOverlaysProps {
	const {
		showTaskSwitcher,
		currentDesktopWindows,
		activeDesktopWindowId,
		desktopIconStyle,
		focusWindow,
		setShowTaskSwitcher,
		showQuickSearch,
		setShowQuickSearch,
		desktopWindowStyle,
		displayItems,
		handleOpenWindow,
		recordRecentApp,
		recentItemsForSearch,
		recentFiles,
		recentLibraryOpened,
		recentLibraryAdded,
		recentLibraryGenerated,
		recentLibraryUploaded,
		recentLibraryProjects,
		recentContentFeedLoading = false,
		recentContentFeedError = null,
		onRefetchRecentContentFeed,
		onStartMenuOpenRecentFile,
		addRecentFile,
		removeRecentFile,
		onPinAppToDesktop,
		openShellSettings,
		bumpNotificationCenterOpen,
		setShowShortcutsHelp,
	} = params;

	return useMemo(
		() => ({
			taskSwitcher: {
				isOpen: showTaskSwitcher,
				windows: currentDesktopWindows,
				currentWindowId: activeDesktopWindowId ?? undefined,
				iconStyle: desktopIconStyle,
				onSelectWindow: (id: string) => {
					focusWindow(id);
					setShowTaskSwitcher(false);
				},
				onClose: () => setShowTaskSwitcher(false),
			},
			quickSearch: {
				isOpen: showQuickSearch,
				onClose: () => setShowQuickSearch(false),
				iconStyle: desktopIconStyle,
				shellWindowStyle: desktopWindowStyle,
				items: displayItems,
				onOpenItem: (item: DesktopItem) => {
					if (item.type === 'app') recordRecentApp(item.id);
					handleOpenWindow(item);
					setShowQuickSearch(false);
				},
				recentItems: recentItemsForSearch,
				recentFiles,
				recentLibraryOpened,
				recentLibraryAdded,
				recentLibraryGenerated,
				recentLibraryUploaded,
				recentLibraryProjects,
				recentContentFeedLoading,
				recentContentFeedError,
				onRefetchRecentContentFeed,
				removeRecentFile,
				onPinAppToDesktop,
				onOpenRecentFile: (file: RecentFile) => {
					if (onStartMenuOpenRecentFile) {
						onStartMenuOpenRecentFile(file);
					} else if (file.type !== 'project') {
						addRecentFile({ ...file, openedAt: new Date() });
					}
					setShowQuickSearch(false);
				},
				onQuickAction: (id: string) => {
					if (id === 'app-store') {
						const app = displayItems.find((i) => i.id === 'app-store');
						if (app) {
							recordRecentApp(app.id);
							handleOpenWindow(app);
						}
					} else if (id === 'settings') {
						openShellSettings('personalize');
					} else if (id === 'notifications') {
						bumpNotificationCenterOpen();
					} else if (id === 'shortcuts-help') {
						setShowShortcutsHelp(true);
					}
					setShowQuickSearch(false);
				},
			},
		}),
		[
			showTaskSwitcher,
			currentDesktopWindows,
			activeDesktopWindowId,
			desktopIconStyle,
			focusWindow,
			setShowTaskSwitcher,
			showQuickSearch,
			setShowQuickSearch,
			desktopWindowStyle,
			displayItems,
			handleOpenWindow,
			recordRecentApp,
			recentItemsForSearch,
			recentFiles,
			recentLibraryOpened,
			recentLibraryAdded,
			recentLibraryGenerated,
			recentLibraryUploaded,
			recentLibraryProjects,
			recentContentFeedLoading,
			recentContentFeedError,
			onRefetchRecentContentFeed,
			onStartMenuOpenRecentFile,
			addRecentFile,
			removeRecentFile,
			onPinAppToDesktop,
			openShellSettings,
			bumpNotificationCenterOpen,
			setShowShortcutsHelp,
		]
	);
}
