import { useFriendsOverview } from '@/features/friends/hooks/useFriendsOverview';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import profileService from '../../../services/profileService';
import {
	DESKTOP_FOLDER_LIBRARY_COUNTS_INVALIDATE_EVENT,
	type DesktopFolderLibraryCountsInvalidateDetail,
} from '../../../services/unifiedContentEvents';
import type { UIPreferences } from '../../../types/profile';
import {
	clampDesktopPanelOpacity,
	DEFAULT_UI_PREFERENCES,
	normalizeDesktopIconStyle,
	normalizeDesktopTaskbarStyle,
	normalizeDesktopWidgetsStyle,
	normalizeDesktopFontBody,
	normalizeDesktopFontDisplay,
	normalizeDesktopSceneDepth,
	normalizeDesktopShellMotionSpeed,
	normalizeDesktopShellParallaxIntensity,
} from '../../../types/profile';
import { log } from '../../../utils/logger';
import type { UserPreferencesAppContextValue } from '../../../contexts/UserPreferencesAppContext';
import { useGAFUnreadCount } from '../components/GAFChat/hooks/useGAFUnreadCount';
import { useEwDeskUnreadCount } from '../components/ewDesk/useEwDeskUnreadCount';
import { useEwDeskNewsDesktopPrefetch } from '../components/ewDesk/useEwDeskNewsDesktopPrefetch';
import { isPersistentDesktopApp } from '../constants';
import type {
	DesktopFolderPreviewEntry,
	DesktopItem,
	WindowState,
} from '../types/desktop.types';
import {
	useDesktopFolderLibraryCounts,
	invalidateDesktopFolderLibraryCounts,
} from './useDesktopFolderLibraryCounts';
import { useDesktopFolderLibraryPreviews } from './useDesktopFolderLibraryPreviews';
import {
	countNestedDesktopChildrenByFolderId,
	mergeFolderIconBadgeCounts,
	mergeFolderIconPreviewEntries,
} from '../utils/desktopFolderLibraryCounts';
import { filterFolderIconBadgeCountsForDesktop } from '../utils/desktopFolderIconBadgePolicy';
import { clampDesktopUiScale } from '../utils/desktopUiScale';

/** Keep widget in low-frequency mode briefly after drag frame bursts. */
const WINDOW_DRAG_WIDGET_DEFER_MS = 240;

export type DesktopWorkspaceVisualPreferenceState = Pick<
	UIPreferences,
	| 'desktop_open_apps_maximized'
	| 'desktop_floating_widget_visible'
	| 'desktop_icon_style'
	| 'desktop_scene_depth'
	| 'desktop_font_body'
	| 'desktop_font_display'
	| 'desktop_wallpaper_crossfade_enabled'
	| 'desktop_styled_tooltips'
	| 'desktop_shell_reduce_motion'
	| 'desktop_shell_parallax_enabled'
	| 'desktop_shell_parallax_intensity'
	| 'desktop_shell_window_morph_enabled'
	| 'desktop_shell_motion_speed'
	| 'desktop_taskbar_style'
	| 'desktop_window_style'
	| 'desktop_accent_follows_window_style'
	| 'desktop_widgets_style'
	| 'desktop_panel_opacity'
	| 'desktop_ui_scale'
	| 'desktop_reduce_backdrop_blur'
>;

export type DesktopVisualPreferencePersistOptions = {
	/** Default true. False: update local shell state only (no profile PATCH). */
	persist?: boolean;
};

export function useDesktopWorkspaceVisualProfileBridge(params: {
	preferencesApp: UserPreferencesAppContextValue | null;
	notifyDesktop: { error: (title: string, message: string) => void };
}) {
	const { preferencesApp, notifyDesktop } = params;
	const { t } = useTranslation('desktopUi');

	const serverUiPreferences = useMemo<UIPreferences>(() => {
		const merged: UIPreferences = {
			...DEFAULT_UI_PREFERENCES,
			...(preferencesApp?.preferences?.ui ?? {}),
		};
		return {
			...merged,
			desktop_icon_style: normalizeDesktopIconStyle(
				merged.desktop_icon_style as string | undefined
			),
			desktop_taskbar_style: normalizeDesktopTaskbarStyle(
				merged.desktop_taskbar_style as string | undefined
			),
			desktop_widgets_style: normalizeDesktopWidgetsStyle(
				merged.desktop_widgets_style as string | undefined
			),
			desktop_panel_opacity: clampDesktopPanelOpacity(
				merged.desktop_panel_opacity
			),
			desktop_ui_scale: clampDesktopUiScale(merged.desktop_ui_scale),
			desktop_accent_follows_window_style:
				merged.desktop_accent_follows_window_style === true,
			desktop_reduce_backdrop_blur:
				merged.desktop_reduce_backdrop_blur === true,
			desktop_scene_depth: normalizeDesktopSceneDepth(
				merged.desktop_scene_depth as string | undefined
			),
			desktop_font_body: normalizeDesktopFontBody(
				merged.desktop_font_body as string | undefined
			),
			desktop_font_display: normalizeDesktopFontDisplay(
				merged.desktop_font_display as string | undefined
			),
			desktop_wallpaper_crossfade_enabled:
				merged.desktop_wallpaper_crossfade_enabled !== false,
			desktop_styled_tooltips: merged.desktop_styled_tooltips !== false,
			desktop_shell_reduce_motion: merged.desktop_shell_reduce_motion === true,
			desktop_shell_parallax_enabled:
				merged.desktop_shell_parallax_enabled !== false,
			desktop_shell_parallax_intensity: normalizeDesktopShellParallaxIntensity(
				merged.desktop_shell_parallax_intensity as string | undefined
			),
			desktop_shell_window_morph_enabled:
				merged.desktop_shell_window_morph_enabled !== false,
			desktop_shell_motion_speed: normalizeDesktopShellMotionSpeed(
				merged.desktop_shell_motion_speed as string | undefined
			),
		};
	}, [preferencesApp?.preferences?.ui]);

	const resolvedDesktopVisualPreferences =
		useMemo<DesktopWorkspaceVisualPreferenceState>(
			() => ({
				desktop_open_apps_maximized:
					serverUiPreferences.desktop_open_apps_maximized,
				desktop_floating_widget_visible:
					serverUiPreferences.desktop_floating_widget_visible,
				desktop_icon_style: serverUiPreferences.desktop_icon_style,
				desktop_scene_depth: serverUiPreferences.desktop_scene_depth,
				desktop_font_body: serverUiPreferences.desktop_font_body,
				desktop_font_display: serverUiPreferences.desktop_font_display,
				desktop_wallpaper_crossfade_enabled:
					serverUiPreferences.desktop_wallpaper_crossfade_enabled,
				desktop_styled_tooltips: serverUiPreferences.desktop_styled_tooltips,
				desktop_shell_reduce_motion:
					serverUiPreferences.desktop_shell_reduce_motion,
				desktop_shell_parallax_enabled:
					serverUiPreferences.desktop_shell_parallax_enabled,
				desktop_shell_parallax_intensity:
					serverUiPreferences.desktop_shell_parallax_intensity,
				desktop_shell_window_morph_enabled:
					serverUiPreferences.desktop_shell_window_morph_enabled,
				desktop_shell_motion_speed:
					serverUiPreferences.desktop_shell_motion_speed,
				desktop_taskbar_style: serverUiPreferences.desktop_taskbar_style,
				desktop_window_style: serverUiPreferences.desktop_window_style,
				desktop_accent_follows_window_style:
					serverUiPreferences.desktop_accent_follows_window_style,
				desktop_widgets_style: serverUiPreferences.desktop_widgets_style,
				desktop_panel_opacity: serverUiPreferences.desktop_panel_opacity,
				desktop_ui_scale: serverUiPreferences.desktop_ui_scale,
				desktop_reduce_backdrop_blur:
					serverUiPreferences.desktop_reduce_backdrop_blur,
			}),
			[
				serverUiPreferences.desktop_open_apps_maximized,
				serverUiPreferences.desktop_floating_widget_visible,
				serverUiPreferences.desktop_icon_style,
				serverUiPreferences.desktop_scene_depth,
				serverUiPreferences.desktop_font_body,
				serverUiPreferences.desktop_font_display,
				serverUiPreferences.desktop_wallpaper_crossfade_enabled,
				serverUiPreferences.desktop_styled_tooltips,
				serverUiPreferences.desktop_shell_reduce_motion,
				serverUiPreferences.desktop_shell_parallax_enabled,
				serverUiPreferences.desktop_shell_parallax_intensity,
				serverUiPreferences.desktop_shell_window_morph_enabled,
				serverUiPreferences.desktop_shell_motion_speed,
				serverUiPreferences.desktop_taskbar_style,
				serverUiPreferences.desktop_window_style,
				serverUiPreferences.desktop_accent_follows_window_style,
				serverUiPreferences.desktop_widgets_style,
				serverUiPreferences.desktop_panel_opacity,
				serverUiPreferences.desktop_ui_scale,
				serverUiPreferences.desktop_reduce_backdrop_blur,
			]
		);

	const [desktopVisualPreferences, setDesktopVisualPreferences] =
		useState<DesktopWorkspaceVisualPreferenceState>(
			resolvedDesktopVisualPreferences
		);
	const serverUiPreferencesRef = useRef(serverUiPreferences);
	const desktopVisualPreferencesRef = useRef(desktopVisualPreferences);
	const resolvedDesktopVisualPreferencesRef = useRef(
		resolvedDesktopVisualPreferences
	);
	const panelOpacityPersistTimerRef = useRef<number | null>(null);
	const profileUiSaveInFlightRef = useRef(0);
	const [isProfileUiSaving, setIsProfileUiSaving] = useState(false);

	const isWindowDragActiveRef = useRef(false);
	const windowDragWidgetTimerRef = useRef<number | null>(null);
	const [isWindowDragActive, setIsWindowDragActive] = useState(false);

	const withProfileUiSaveIndicator = useCallback(
		async (fn: () => Promise<void>) => {
			profileUiSaveInFlightRef.current += 1;
			setIsProfileUiSaving(true);
			try {
				await fn();
			} finally {
				profileUiSaveInFlightRef.current -= 1;
				if (profileUiSaveInFlightRef.current <= 0) {
					profileUiSaveInFlightRef.current = 0;
					setIsProfileUiSaving(false);
				}
			}
		},
		[]
	);

	useEffect(() => {
		setDesktopVisualPreferences(resolvedDesktopVisualPreferences);
	}, [resolvedDesktopVisualPreferences]);

	useEffect(() => {
		serverUiPreferencesRef.current = serverUiPreferences;
	}, [serverUiPreferences]);
	useEffect(() => {
		desktopVisualPreferencesRef.current = desktopVisualPreferences;
	}, [desktopVisualPreferences]);
	useEffect(() => {
		resolvedDesktopVisualPreferencesRef.current =
			resolvedDesktopVisualPreferences;
	}, [resolvedDesktopVisualPreferences]);
	useEffect(() => {
		return () => {
			if (panelOpacityPersistTimerRef.current) {
				clearTimeout(panelOpacityPersistTimerRef.current);
				panelOpacityPersistTimerRef.current = null;
			}
		};
	}, []);

	const clearPanelOpacityPersistTimer = useCallback(() => {
		if (panelOpacityPersistTimerRef.current) {
			clearTimeout(panelOpacityPersistTimerRef.current);
			panelOpacityPersistTimerRef.current = null;
		}
	}, []);
	const clearWindowDragWidgetTimer = useCallback(() => {
		if (windowDragWidgetTimerRef.current != null) {
			window.clearTimeout(windowDragWidgetTimerRef.current);
			windowDragWidgetTimerRef.current = null;
		}
	}, []);

	const updateDesktopVisualPreferences = useCallback(
		async (
			updates: Partial<DesktopWorkspaceVisualPreferenceState>,
			options?: DesktopVisualPreferencePersistOptions
		) => {
			clearPanelOpacityPersistTimer();
			const nextUi: UIPreferences = {
				...serverUiPreferences,
				...desktopVisualPreferences,
				...updates,
			};
			setDesktopVisualPreferences((prev) => ({ ...prev, ...updates }));
			const persist = options?.persist !== false;
			if (!persist) {
				return;
			}
			await withProfileUiSaveIndicator(async () => {
				try {
					const updated = await profileService.updatePreferences({
						ui: nextUi,
					});
					await preferencesApp?.refresh?.(updated);
				} catch (error) {
					setDesktopVisualPreferences(resolvedDesktopVisualPreferences);
					log.error(
						'Desktop',
						'Failed to persist desktop visual preferences',
						error instanceof Error ? error : undefined
					);
					notifyDesktop.error(
						t('shortcuts.profileSaveFailedTitle'),
						t('shortcuts.profileSaveFailedBody')
					);
				}
			});
		},
		[
			clearPanelOpacityPersistTimer,
			desktopVisualPreferences,
			notifyDesktop,
			t,
			preferencesApp,
			resolvedDesktopVisualPreferences,
			serverUiPreferences,
			withProfileUiSaveIndicator,
		]
	);

	const markWindowDragActivity = useCallback(() => {
		if (!isWindowDragActiveRef.current) {
			isWindowDragActiveRef.current = true;
			setIsWindowDragActive(true);
		}
		clearWindowDragWidgetTimer();
		windowDragWidgetTimerRef.current = window.setTimeout(() => {
			windowDragWidgetTimerRef.current = null;
			if (!isWindowDragActiveRef.current) return;
			isWindowDragActiveRef.current = false;
			setIsWindowDragActive(false);
		}, WINDOW_DRAG_WIDGET_DEFER_MS);
	}, [clearWindowDragWidgetTimer]);

	const showDesktopWidget =
		desktopVisualPreferences.desktop_floating_widget_visible;
	const desktopIconStyle = desktopVisualPreferences.desktop_icon_style;
	const desktopTaskbarStyle = desktopVisualPreferences.desktop_taskbar_style;
	const desktopWindowStyle = desktopVisualPreferences.desktop_window_style;
	const desktopUiScale = desktopVisualPreferences.desktop_ui_scale;
	const desktopOpenAppsMaximized =
		desktopVisualPreferences.desktop_open_apps_maximized;

	return {
		serverUiPreferences,
		resolvedDesktopVisualPreferences,
		desktopVisualPreferences,
		setDesktopVisualPreferences,
		serverUiPreferencesRef,
		desktopVisualPreferencesRef,
		resolvedDesktopVisualPreferencesRef,
		panelOpacityPersistTimerRef,
		isProfileUiSaving,
		withProfileUiSaveIndicator,
		clearPanelOpacityPersistTimer,
		clearWindowDragWidgetTimer,
		updateDesktopVisualPreferences,
		markWindowDragActivity,
		isWindowDragActive,
		setIsWindowDragActive,
		isWindowDragActiveRef,
		windowDragWidgetTimerRef,
		showDesktopWidget,
		desktopIconStyle,
		desktopTaskbarStyle,
		desktopWindowStyle,
		desktopUiScale,
		desktopOpenAppsMaximized,
	};
}

export function useDesktopWorkspaceShellBadgeCounts(params: {
	displayItems: DesktopItem[];
	/** Full desktop item list (incl. nested); used for per-folder child counts. */
	allDesktopItems: DesktopItem[];
	installedApps: DesktopItem[];
	authUserId: string | undefined;
}) {
	const { displayItems, allDesktopItems, installedApps, authUserId } = params;
	const queryClient = useQueryClient();

	useEffect(() => {
		const onInvalidate = (event: Event) => {
			const detail = (
				event as CustomEvent<DesktopFolderLibraryCountsInvalidateDetail>
			).detail;
			void invalidateDesktopFolderLibraryCounts(queryClient, detail?.folderIds);
		};
		window.addEventListener(
			DESKTOP_FOLDER_LIBRARY_COUNTS_INVALIDATE_EVENT,
			onInvalidate
		);
		return () => {
			window.removeEventListener(
				DESKTOP_FOLDER_LIBRARY_COUNTS_INVALIDATE_EVENT,
				onInvalidate
			);
		};
	}, [queryClient]);

	useEwDeskNewsDesktopPrefetch(Boolean(authUserId));
	const gafUnreadTotal = useGAFUnreadCount(Boolean(authUserId));
	const ewDeskUnreadTotal = useEwDeskUnreadCount(Boolean(authUserId));
	const friendsOverviewQuery = useFriendsOverview({ enabled: !!authUserId });
	const friendsIncomingTotal =
		friendsOverviewQuery.data?.stats.incomingRequestsCount ?? 0;

	const desktopItemBadgeCounts = useMemo(() => {
		const map: Record<string, number> = {};
		if (gafUnreadTotal > 0) {
			for (const item of displayItems) {
				if (item.type === 'app' && item.appComponent === 'GAFChatApp') {
					map[item.id] = gafUnreadTotal;
				}
			}
		}
		if (ewDeskUnreadTotal > 0) {
			for (const item of displayItems) {
				if (item.type === 'app' && item.appComponent === 'EWDeskApp') {
					map[item.id] = ewDeskUnreadTotal;
				}
			}
		}
		if (friendsIncomingTotal > 0) {
			for (const item of displayItems) {
				if (item.type === 'app' && item.appComponent === 'SocialHubApp') {
					map[item.id] = friendsIncomingTotal;
				}
			}
		}
		return map;
	}, [displayItems, ewDeskUnreadTotal, friendsIncomingTotal, gafUnreadTotal]);

	const taskbarAppBadgeCounts = useMemo(() => {
		const map: Record<string, number> = {};
		for (const app of installedApps) {
			if (app.appComponent === 'GAFChatApp' && gafUnreadTotal > 0) {
				map[app.id] = gafUnreadTotal;
			}
			if (app.appComponent === 'EWDeskApp' && ewDeskUnreadTotal > 0) {
				map[app.id] = ewDeskUnreadTotal;
			}
			if (app.appComponent === 'SocialHubApp' && friendsIncomingTotal > 0) {
				map[app.id] = friendsIncomingTotal;
			}
		}
		return map;
	}, [ewDeskUnreadTotal, friendsIncomingTotal, gafUnreadTotal, installedApps]);

	const rootFolderIds = useMemo(
		() =>
			displayItems
				.filter((item) => item.type === 'folder' && !item.parentId)
				.map((item) => item.id),
		[displayItems]
	);

	const folderLibraryCounts = useDesktopFolderLibraryCounts(
		rootFolderIds,
		Boolean(authUserId)
	);

	const folderChildCounts = useMemo(() => {
		const nested = countNestedDesktopChildrenByFolderId(allDesktopItems);
		const merged = mergeFolderIconBadgeCounts(nested, folderLibraryCounts);
		return filterFolderIconBadgeCountsForDesktop(merged, allDesktopItems);
	}, [allDesktopItems, folderLibraryCounts]);

	const nestedFolderPreviewByFolderId = useMemo(() => {
		const byParent: Record<string, DesktopItem[]> = {};
		for (const item of allDesktopItems) {
			const pid = item.parentId;
			if (!pid) continue;
			if (!byParent[pid]) byParent[pid] = [];
			byParent[pid].push(item);
		}
		const nested: Record<string, DesktopFolderPreviewEntry[]> = {};
		for (const [folderId, children] of Object.entries(byParent)) {
			const sorted = [...children].sort((a, b) =>
				(a.name || '').localeCompare(b.name || '', undefined, {
					sensitivity: 'base',
				})
			);
			const slice = sorted.slice(0, 4);
			if (slice.length === 0) continue;
			nested[folderId] = slice.map((c) => ({
				id: c.id,
				type: c.type,
				fileType: c.fileType,
				appComponent: c.appComponent,
			}));
		}
		return nested;
	}, [allDesktopItems]);

	const folderIdsNeedingLibraryPreview = useMemo(
		() =>
			rootFolderIds.filter((id) => {
				if ((nestedFolderPreviewByFolderId[id]?.length ?? 0) >= 4) {
					return false;
				}
				return (folderLibraryCounts[id] ?? 0) > 0;
			}),
		[folderLibraryCounts, nestedFolderPreviewByFolderId, rootFolderIds]
	);

	const folderLibraryPreviews = useDesktopFolderLibraryPreviews(
		folderIdsNeedingLibraryPreview,
		Boolean(authUserId)
	);

	const mergedFolderPreviewByFolderId = useMemo(() => {
		const out = { ...nestedFolderPreviewByFolderId };
		for (const [folderId, libraryEntries] of Object.entries(
			folderLibraryPreviews
		)) {
			if (libraryEntries.length === 0) continue;
			const merged = mergeFolderIconPreviewEntries(
				out[folderId] ?? [],
				libraryEntries
			);
			if (merged.length > 0) {
				out[folderId] = merged;
			}
		}
		return out;
	}, [folderLibraryPreviews, nestedFolderPreviewByFolderId]);

	return {
		desktopItemBadgeCounts,
		taskbarAppBadgeCounts,
		folderChildCounts,
		folderPreviewByFolderId: mergedFolderPreviewByFolderId,
	};
}

export function useMinimizedPersistentSurfaceApps(windows: WindowState[]) {
	return useMemo(() => {
		const next = new Set<string>();
		for (const w of windows) {
			if (w.type !== 'app' || !w.appComponent) continue;
			if (!isPersistentDesktopApp(w.appComponent)) continue;
			if (w.isMinimized || w.isMinimizing) next.add(w.appComponent);
		}
		return next;
	}, [windows]);
}
