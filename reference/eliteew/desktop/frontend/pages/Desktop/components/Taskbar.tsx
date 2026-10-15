/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Windows-style desktop taskbar with Start menu, pinned/windows strip, tray,
 * notification center, session/device entrypoint, clock and shell menus.
 *
 * Invariants:
 * - Right toolbar receives explicit callbacks; background process state stays in child providers.
 * - Taskbar context menus and floating panels use desktop portal/z-index contracts.
 * - Escape on taskbar context menus closes the top menu first; shell popovers close only when no ctx menu is open.
 * - Start Menu open defers taskbar popover Escape (Start Menu owns layered Escape).
 * - Clock seconds flyout defers taskbar popover Escape while open.
 * - Background-processes tray panel defers taskbar popover Escape while open.
 * - Command palette, quick search, task switcher, shortcuts help, wallpaper, new folder, clipboard and app store defer via `shellOverlayConsumesEscape`.
 *
 * Related:
 * - components/TaskbarRightToolbar.tsx
 * - hooks/useDesktopWorkspaceShellTaskbarProps.ts
 */

import { themeDesignTokens } from '@/theme/designTokens';
import { desktopShellTaskbarEnterVariants } from '../utils/desktopShellMotion';
import { AnimatePresence, m } from 'framer-motion';
import { useDesktopShellMotionPrefs } from '../context/DesktopShellMotionPrefsContext';
import * as React from 'react';
import {
	Suspense,
	lazy,
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../contexts/AuthContext';
import {
	DESKTOP_PANEL_OPACITY_MAX,
	DESKTOP_PANEL_OPACITY_MIN,
	normalizeDesktopTaskbarStyle,
	type DesktopIconStyle,
	type DesktopTaskbarStyle,
	type DesktopWindowStyle,
} from '../../../types/profile';
import {
	DESKTOP_FEATURE_FLAGS,
	DESKTOP_INTERACTIVE,
	DESKTOP_LUCIDE,
	DESKTOP_Z_INDEX,
	TASKBAR,
} from '@/pages/Desktop/constants';
import { useDesktopWindowPortalStackBase } from '@/pages/Desktop/context/DesktopWindowPortalStackContext';
import { getTaskbarPinnedApps } from '@/pages/Desktop/utils/taskbarPinnedOrder';
import { useFinePointerHover } from '../hooks/useFinePointerHover';
import { useDismissibleFloatingMenu } from '../hooks/useDismissibleFloatingMenu';
import { useDesktopLaserPointerSafetyNet } from '../hooks/useDesktopLaserPointerSafetyNet';
import { useTaskbarShellMetaPrefs } from '../hooks/useDesktopTaskbarShellPrefs';
import type { VirtualDesktop } from '../hooks/useVirtualDesktops';
import type {
	DesktopItem,
	RecentFile,
	WindowState,
} from '../types/desktop.types';
import type {
	DesktopExpansionDiscoveryState,
	DesktopExpansionLaunchActions,
} from '../types/desktopExpansion.types';
import type { StoreAppResponse } from '../services/desktopApi';
import {
	getContextMenuTargetElement,
	getFloatingMenuPosition,
	isBrowserContextMenuAllowedTarget,
} from '../utils/desktopUi';
import {
	DESKTOP_TASKBAR_STYLE_PRESETS,
	getDesktopShellPanelClassName,
	TASKBAR_PANEL_OPACITY_OVERLAY_WEIGHT,
} from '../utils/desktopVisualSystem';
import {
	DesktopAppContextMenuTitle,
	DesktopAppMenuDivider,
	DesktopAppMenuItem,
	DesktopAppMenuSectionLabel,
	DesktopAppMenuSurface,
} from './DesktopAppChrome';
import { DesktopShellFloatingPortal } from './DesktopShellFloatingPortal';
import { type TaskbarClockHandle } from './TaskbarClock';
import { TaskbarLeftCluster } from './TaskbarLeftCluster';
import {
	TaskbarPinnedAndWindowsStrip,
	type TaskbarPinnedAndWindowsStripHandle,
} from './TaskbarPinnedAndWindowsStrip';
import { TaskbarRightToolbar } from './TaskbarRightToolbar';
const StartMenu = lazy(() =>
	import('./StartMenu').then((m) => ({ default: m.StartMenu }))
);
import { StartMenuSuspenseFallback } from './startMenu/StartMenuSuspenseFallback';
import { DesktopWelcomeNudgeBanner } from './DesktopWelcomeNudgeBanner';
import { useDesktopWelcomeNudge } from '../hooks/useDesktopWelcomeNudge';
import type { OpenWindowOptions } from '../hooks/useWindowManager';
import {
	DESKTOP_CLOSE_START_MENU_EVENT,
	DESKTOP_OPEN_START_MENU_EVENT,
	DESKTOP_TOGGLE_NOTIFICATIONS_EVENT,
} from '../utils/desktopDeepLink';
import { resolveDesktopWindowDisplayTitle } from '../utils/desktopWindowDisplayTitle';
import { dismissTaskbarLaserPointerHoverChrome } from '../utils/desktopTaskbarWindowFlyoutDismiss';
import { shouldDeferDesktopShellKeydownToFocusedSurface } from '../utils/desktopShellKeyboardCapture';
import {
	DESKTOP_LASER_POINTER_DISMISS_EVENT,
	isDesktopLaserPointerEnvironment,
} from '../utils/desktopLaserPointerEnvironment';
import type { StartMenuTab } from '../types/desktopStartMenu';
import { ComputerDesktopIcon } from '@heroicons/react/24/outline';

interface TaskbarProps {
	windows: WindowState[];
	apps: DesktopItem[];
	desktopItems?: DesktopItem[];
	onWinClick: (id: string) => void;
	onFocusWindow?: (id: string) => void;
	onMinimizeWindow?: (id: string) => void;
	onToggleMaximizeWindow?: (id: string) => void;
	onCloseWindow?: (id: string) => void;
	onOpenApp: (app: DesktopItem, options?: OpenWindowOptions) => void;
	onWallpaper: () => void;
	onShowShortcuts?: () => void;
	/** Manual launch of desktop shell spotlight tour (GT-13). */
	onOpenDesktopWelcomeTour?: () => void;
	onOpenSessionInfo?: () => void;
	onOpenProfile?: () => void;
	onAppStore?: () => void;
	/** Open unified admin page for users with UGS admin access */
	onOpenAdmin?: () => void;
	/** Пуск: ПКМ по приложению — вынести ярлык на рабочий стол */
	onPinAppToDesktop?: (app: DesktopItem) => void;
	onUnpinAppFromDesktop?: (app: DesktopItem) => void;
	onOpenAppInWorkspace?: (app: DesktopItem, workspaceProfileId: string) => void;
	recentFiles?: RecentFile[];
	/** Server feed: library recently opened (last_accessed / updated). */
	recentLibraryOpened?: RecentFile[];
	/** Server feed: library recently added (created_at). */
	recentLibraryAdded?: RecentFile[];
	/** Studio / UGS / service-tagged content (source_service), newest first. */
	recentLibraryGenerated?: RecentFile[];
	/** User uploads and imports (no source_service), newest first. */
	recentLibraryUploaded?: RecentFile[];
	/** Server feed: recent library projects (discovery). */
	recentLibraryProjects?: RecentFile[];
	/** Recent content feed: loading initial GET. */
	recentContentFeedLoading?: boolean;
	/** Recent content feed: last error message (non-blocking; UI may keep stale rows). */
	recentContentFeedError?: string | null;
	/** Recent content feed: last successful load timestamp (ms). */
	recentContentFeedLoadedAt?: number | null;
	/** True if any slice of the feed has rows (opened/added/generated/uploaded/projects). */
	hasRecentContentFeedItems?: boolean;
	/** Refresh library feed from `/desktop/recent-content-feed`. */
	onRefetchRecentContentFeed?: () => void | Promise<void>;
	/** Open Settings → Shell → workspaces (scenarios / virtual desktops). */
	onOpenShellWorkspacesSettings?: () => void;
	onStartMenuOpenRecentFile?: (file: RecentFile) => void;
	onStartMenuRemoveRecentFile?: (fileId: string) => void;
	startMenuActiveDesktopId?: string;
	storeApps?: StoreAppResponse[];
	/** Virtual desktops: enable "Move to desktop" context menu on window buttons */
	desktops?: VirtualDesktop[];
	moveWindowToDesktop?: (windowId: string, desktopId: string) => void;
	/** Active (focused) window id for taskbar highlight; derived from max zIndex. */
	activeWindowId?: string | null;
	/** Compact mode for small screens (e.g. mobile): smaller height, reduced chrome. */
	compact?: boolean;
	/** Server-backed visual surface preset for the taskbar. */
	visualStyle?: DesktopTaskbarStyle;
	/** Непрозрачность фона полосы (0.35…1): усиливает «твёрдый» слой поверх стекла, без затемнения кнопок. */
	panelOpacity?: number;
	/** Плавающие панели (Пуск, трей, превью) — в одной системе с окнами. */
	shellWindowStyle?: DesktopWindowStyle;
	/** Icon rendering mode shared with desktop icon style setting. */
	iconStyle?: DesktopIconStyle;
	/** Optional badge counts per app id (e.g. unread messages). */
	appBadgeCounts?: Record<string, number>;
	/** Персистентные приложения, свёрнутые в фон (кнопка «—» / «Показать рабочий стол»). */
	minimizedPersistentSurfaceApps?: ReadonlySet<string>;
	expansionState?: DesktopExpansionDiscoveryState;
	expansionLaunchActions?: DesktopExpansionLaunchActions;
	/** Open (non-minimized) windows on the active desktop — Start Menu “Continue”. */
	startMenuResumeWindows?: { id: string; title: string }[];
	/** Focus / restore window from Start Menu (always brings forward; unlike taskbar toggle). */
	onStartMenuResumeOpenWindow?: (windowId: string) => void;
	/**
	 * When this number increases (e.g. from command palette), open the notification center.
	 * Initial 0 does not open on mount.
	 */
	notificationCenterOpenNonce?: number;
	/** Global desktop wallpaper (config) for workspace card preview in Start Menu. */
	startMenuGlobalWallpaper?: string;
	/** Full window list for Start Menu workspace scenario cards (live desktop state). */
	startMenuWorkspaceContextWindows?: WindowState[];
	getWindowsOnDesktop?: (desktopId: string) => string[] | undefined;
	/**
	 * When true, taskbar shell popover Escape is deferred (command palette, quick search, etc.).
	 */
	shellOverlayConsumesEscape?: boolean;
	children?: React.ReactNode;
}

function isFriendsAppBadge(appComponent?: string | null): boolean {
	return appComponent === 'FriendsApp' || appComponent === 'SocialHubApp';
}

function isGafChatAppBadge(appComponent?: string | null): boolean {
	return appComponent === 'GAFChatApp';
}

function taskbarWindowGroupKey(w: WindowState): string {
	return w.folderId ?? w.appComponent ?? w.id;
}

function isStartMenuTab(value: unknown): value is StartMenuTab {
	return (
		value === 'categories' ||
		value === 'recent' ||
		value === 'pinned' ||
		value === 'all' ||
		value === 'work'
	);
}

export const Taskbar: React.FC<TaskbarProps> = memo(
	({
		windows,
		apps,
		desktopItems = [],
		onWinClick,
		onFocusWindow,
		onMinimizeWindow,
		onToggleMaximizeWindow,
		onCloseWindow,
		onOpenApp,
		onWallpaper,
		onShowShortcuts,
		onOpenDesktopWelcomeTour,
		onOpenSessionInfo,
		onOpenProfile,
		onAppStore,
		onOpenAdmin,
		onPinAppToDesktop,
		onUnpinAppFromDesktop,
		onOpenAppInWorkspace,
		recentFiles = [],
		recentLibraryOpened = [],
		recentLibraryAdded = [],
		recentLibraryGenerated = [],
		recentLibraryUploaded = [],
		recentLibraryProjects = [],
		recentContentFeedLoading = false,
		recentContentFeedError = null,
		recentContentFeedLoadedAt = null,
		hasRecentContentFeedItems = false,
		onRefetchRecentContentFeed,
		onOpenShellWorkspacesSettings,
		onStartMenuOpenRecentFile,
		onStartMenuRemoveRecentFile,
		startMenuActiveDesktopId,
		storeApps,
		desktops = [],
		moveWindowToDesktop,
		activeWindowId = null,
		compact = false,
		visualStyle = 'glass',
		panelOpacity: panelOpacityProp = 1,
		shellWindowStyle = 'glass',
		iconStyle = 'glass',
		appBadgeCounts,
		minimizedPersistentSurfaceApps,
		expansionState,
		expansionLaunchActions,
		startMenuResumeWindows = [],
		onStartMenuResumeOpenWindow,
		notificationCenterOpenNonce = 0,
		startMenuGlobalWallpaper = '',
		startMenuWorkspaceContextWindows = [],
		getWindowsOnDesktop,
		shellOverlayConsumesEscape = false,
		children,
	}) => {
		const { t } = useTranslation('desktopUi');
		const portalStackBase = useDesktopWindowPortalStackBase();
		const { reduceMotion, speed } = useDesktopShellMotionPrefs();
		const finePointerHover = useFinePointerHover();
		const taskbarVariants = useMemo(
			() => desktopShellTaskbarEnterVariants(reduceMotion, speed),
			[reduceMotion, speed]
		);
		const buttonVariants = useMemo(
			() => ({
				initial: { scale: 1 },
				hover:
					finePointerHover && !reduceMotion
						? { scale: 1.02, y: 0 }
						: { scale: 1, y: 0 },
				tap: reduceMotion ? { scale: 1 } : { scale: 0.98 },
				active: reduceMotion ? { scale: 1 } : { scale: 1.01 },
			}),
			[finePointerHover, reduceMotion]
		);
		const { taskbar } = themeDesignTokens.desktop;
		const { logout, user: currentUser } = useAuth();
		const heightClass = compact
			? taskbar.HEIGHT_CLASS_COMPACT
			: taskbar.HEIGHT_CLASS;
		const taskbarStyleKey = normalizeDesktopTaskbarStyle(visualStyle);
		const taskbarStylePreset =
			DESKTOP_TASKBAR_STYLE_PRESETS[taskbarStyleKey] ??
			DESKTOP_TASKBAR_STYLE_PRESETS.glass;
		const panelOpacity =
			typeof panelOpacityProp === 'number' && Number.isFinite(panelOpacityProp)
				? Math.min(
						DESKTOP_PANEL_OPACITY_MAX,
						Math.max(DESKTOP_PANEL_OPACITY_MIN, panelOpacityProp)
					)
				: DESKTOP_PANEL_OPACITY_MAX;
		const taskbarSolidOverlayOpacity = useMemo(() => {
			const span = DESKTOP_PANEL_OPACITY_MAX - DESKTOP_PANEL_OPACITY_MIN;
			const progress =
				span > 0 ? (panelOpacity - DESKTOP_PANEL_OPACITY_MIN) / span : 1;
			const weight =
				TASKBAR_PANEL_OPACITY_OVERLAY_WEIGHT[taskbarStyleKey] ?? 0.5;
			return Math.min(1, Math.max(0, progress * weight));
		}, [panelOpacity, taskbarStyleKey]);
		const {
			dividerClass: taskbarDividerClass,
			buttonSurface: taskbarButtonSurface,
			buttonActiveSurface: taskbarButtonActiveSurface,
			surfaceClassName: taskbarSurfaceClassName,
			surfaceStyle: taskbarSurfaceStyle,
		} = taskbarStylePreset;
		const taskbarStripRef = useRef<HTMLDivElement>(null);
		const taskbarSurfaceBackdropRef = useRef<HTMLDivElement>(null);
		useLayoutEffect(() => {
			const strip = taskbarStripRef.current;
			if (strip) {
				strip.style.setProperty(
					'padding-bottom',
					'env(safe-area-inset-bottom, 0px)'
				);
				strip.style.setProperty('z-index', String(DESKTOP_Z_INDEX.PANEL));
			}
			const surface = taskbarSurfaceBackdropRef.current;
			if (surface) {
				Object.assign(surface.style, taskbarSurfaceStyle);
			}
		}, [taskbarSurfaceStyle]);
		const shellPanel = useMemo(
			() => getDesktopShellPanelClassName(shellWindowStyle, 'standard'),
			[shellWindowStyle]
		);
		const shellPanelStrong = useMemo(
			() => getDesktopShellPanelClassName(shellWindowStyle, 'strong'),
			[shellWindowStyle]
		);
		const taskbarRightIconSurface =
			taskbarStyleKey === 'premium'
				? 'border-0 bg-transparent shadow-none [box-shadow:none] fine-hover:bg-[rgba(212,175,106,0.14)]'
				: TASKBAR.RIGHT_ICON_SURFACE;
		const taskbarRightIconActiveSurface =
			taskbarStyleKey === 'premium'
				? 'border-0 shadow-none [box-shadow:none] bg-[rgba(212,175,106,0.22)] fine-hover:bg-[rgba(212,175,106,0.3)]'
				: TASKBAR.RIGHT_ICON_ACTIVE_SURFACE;
		const [showStart, setShowStart] = useState(false);
		const [startMenuIntent, setStartMenuIntent] = useState<{
			tab: StartMenuTab;
			nonce: number;
		}>({ tab: 'categories', nonce: 0 });
		const [showNotifications, setShowNotifications] = useState(false);
		const [showTray, setShowTray] = useState(false);
		const lastNotificationOpenNonce = useRef(0);
		useEffect(() => {
			const openStart = (event: Event) => {
				const tab = (event as CustomEvent<{ tab?: unknown }>).detail?.tab;
				if (isStartMenuTab(tab)) {
					setStartMenuIntent((current) => ({
						tab,
						nonce: current.nonce + 1,
					}));
				}
				setShowStart(true);
				setShowNotifications(false);
				setShowTray(false);
			};
			const closeStart = () => {
				setShowStart(false);
				setShowNotifications(false);
			};
			const toggleNotifications = () => {
				setShowNotifications((v) => {
					const next = !v;
					if (next) {
						setShowTray(false);
						setShowStart(false);
					}
					return next;
				});
			};
			window.addEventListener(DESKTOP_OPEN_START_MENU_EVENT, openStart);
			window.addEventListener(DESKTOP_CLOSE_START_MENU_EVENT, closeStart);
			window.addEventListener(
				DESKTOP_TOGGLE_NOTIFICATIONS_EVENT,
				toggleNotifications
			);
			return () => {
				window.removeEventListener(DESKTOP_OPEN_START_MENU_EVENT, openStart);
				window.removeEventListener(DESKTOP_CLOSE_START_MENU_EVENT, closeStart);
				window.removeEventListener(
					DESKTOP_TOGGLE_NOTIFICATIONS_EVENT,
					toggleNotifications
				);
			};
		}, []);
		useEffect(() => {
			if (notificationCenterOpenNonce <= lastNotificationOpenNonce.current)
				return;
			lastNotificationOpenNonce.current = notificationCenterOpenNonce;
			setShowNotifications(true);
			setShowTray(false);
			setShowStart(false);
		}, [notificationCenterOpenNonce]);
		const { shellHydrated, quietMode } = useTaskbarShellMetaPrefs();
		const { showNudge, dismissNudge } = useDesktopWelcomeNudge(shellHydrated);
		const [winContextMenu, setWinContextMenu] = useState<{
			windowId: string;
			x: number;
			y: number;
		} | null>(null);
		const [startContextMenu, setStartContextMenu] = useState<{
			x: number;
			y: number;
		} | null>(null);
		const [taskbarContextMenu, setTaskbarContextMenu] = useState<{
			x: number;
			y: number;
		} | null>(null);
		const [isLoggingOut, setIsLoggingOut] = useState(false);
		const clockRef = useRef<TaskbarClockHandle | null>(null);
		const pinnedWindowsStripRef =
			useRef<TaskbarPinnedAndWindowsStripHandle | null>(null);
		const winContextMenuRef = useRef<HTMLDivElement>(null);
		const startContextMenuRef = useRef<HTMLDivElement>(null);
		const taskbarContextMenuRef = useRef<HTMLDivElement>(null);

		const closeWinContextMenu = useCallback(() => setWinContextMenu(null), []);
		const closeStartContextMenu = useCallback(
			() => setStartContextMenu(null),
			[]
		);
		const closeTaskbarContextMenu = useCallback(
			() => setTaskbarContextMenu(null),
			[]
		);

		useDismissibleFloatingMenu({
			isOpen: winContextMenu != null,
			menuRef: winContextMenuRef,
			onClose: closeWinContextMenu,
			escapeCapture: true,
			focusFirstMenuItem: true,
		});
		useDismissibleFloatingMenu({
			isOpen: startContextMenu != null,
			menuRef: startContextMenuRef,
			onClose: closeStartContextMenu,
			escapeCapture: true,
			focusFirstMenuItem: true,
		});
		useDismissibleFloatingMenu({
			isOpen: taskbarContextMenu != null,
			menuRef: taskbarContextMenuRef,
			onClose: closeTaskbarContextMenu,
			escapeCapture: true,
			focusFirstMenuItem: true,
		});

		useDesktopLaserPointerSafetyNet();

		const dismissLaserPointerHoverChrome = useCallback(() => {
			dismissTaskbarLaserPointerHoverChrome(pinnedWindowsStripRef.current);
		}, []);

		useEffect(() => {
			if (!isDesktopLaserPointerEnvironment()) return;
			window.addEventListener(
				DESKTOP_LASER_POINTER_DISMISS_EVENT,
				dismissLaserPointerHoverChrome
			);
			return () =>
				window.removeEventListener(
					DESKTOP_LASER_POINTER_DISMISS_EVENT,
					dismissLaserPointerHoverChrome
				);
		}, [dismissLaserPointerHoverChrome]);

		const contextWindow = winContextMenu
			? (windows.find((w) => w.id === winContextMenu.windowId) ?? null)
			: null;
		const contextWindowTitle = contextWindow
			? resolveDesktopWindowDisplayTitle(contextWindow)
			: '';
		const currentDesktopIdForWindow = winContextMenu
			? desktops.find((d) => d.windows.includes(winContextMenu.windowId))?.id
			: null;
		const otherDesktops = winContextMenu
			? desktops.filter((d) => d.id !== currentDesktopIdForWindow)
			: [];
		const adjustedWinContextMenu = winContextMenu
			? getFloatingMenuPosition(
					{ x: winContextMenu.x, y: winContextMenu.y - 8 },
					{
						menuWidth: 244,
						menuHeight:
							238 +
							(otherDesktops.length > 0 ? 48 + otherDesktops.length * 42 : 0),
					}
				)
			: null;
		const adjustedStartContextMenu = startContextMenu
			? getFloatingMenuPosition(startContextMenu, {
					menuWidth: 200,
					menuHeight: 72,
				})
			: null;
		const adjustedTaskbarContextMenu = taskbarContextMenu
			? getFloatingMenuPosition(taskbarContextMenu, {
					menuWidth: 240,
					/* Трей + чекбоксы: запас по высоте, иначе getFloatingMenuPosition не «видит» вылет вниз. */
					menuHeight: currentUser ? 380 : 200,
				})
			: null;

		const performLogout = useCallback(async () => {
			if (isLoggingOut) {
				return;
			}
			setShowStart(false);
			setIsLoggingOut(true);
			try {
				await logout();
			} finally {
				setIsLoggingOut(false);
			}
		}, [isLoggingOut, logout]);

		const handleToggleTray = useCallback(() => {
			setShowTray((v) => {
				const next = !v;
				if (next) {
					setShowNotifications(false);
					setShowStart(false);
				}
				return next;
			});
		}, []);

		const handleCloseTray = useCallback(() => {
			setShowTray(false);
		}, []);

		const handleNotificationBellClick = useCallback(() => {
			setShowNotifications((v) => {
				const next = !v;
				if (next) {
					setShowTray(false);
					setShowStart(false);
				}
				return next;
			});
		}, []);

		const handleCloseNotificationPanel = useCallback(() => {
			setShowNotifications(false);
		}, []);

		const handleStartButtonClick = useCallback(() => {
			setShowStart((v) => !v);
			setShowNotifications(false);
			setShowTray(false);
		}, []);

		const handleStartButtonContextMenu = useCallback(
			(e: MouseEvent<HTMLButtonElement>) => {
				e.preventDefault();
				e.stopPropagation();
				setStartContextMenu({ x: e.clientX, y: e.clientY });
			},
			[]
		);

		// First-run nudge: non-blocking banner (replaces legacy welcome toast).
		const showWelcomeNudge =
			showNudge && !quietMode && Boolean(onOpenDesktopWelcomeTour);

		const handleWelcomeNudgeStartTour = useCallback(() => {
			dismissNudge();
			onOpenDesktopWelcomeTour?.();
		}, [dismissNudge, onOpenDesktopWelcomeTour]);

		// Close taskbar popovers on Escape when no modal/context menu owns the key.
		useEffect(() => {
			const onKeyDown = (e: KeyboardEvent) => {
				if (e.key !== 'Escape') return;
				if (shellOverlayConsumesEscape) return;
				if (shouldDeferDesktopShellKeydownToFocusedSurface()) return;
				if (showStart) return;
				if (showNotifications) return;
				if (showTray) return;
				if (clockRef.current?.isMenuOpen()) return;
				if (
					winContextMenu != null ||
					startContextMenu != null ||
					taskbarContextMenu != null
				) {
					return;
				}
				setShowStart(false);
				pinnedWindowsStripRef.current?.closeFlyouts();
				clockRef.current?.closeMenu();
				setShowNotifications(false);
				setShowTray(false);
			};
			window.addEventListener('keydown', onKeyDown);
			return () => window.removeEventListener('keydown', onKeyDown);
		}, [
			shellOverlayConsumesEscape,
			showStart,
			showNotifications,
			showTray,
			startContextMenu,
			taskbarContextMenu,
			winContextMenu,
		]);

		// Pinned apps: shared order with Win+1…9 (see getTaskbarPinnedApps).
		const pinnedApps = React.useMemo(() => getTaskbarPinnedApps(apps), [apps]);
		const pinnedGafChatBadgeActive = React.useMemo(
			() =>
				pinnedApps.some(
					(app) =>
						isGafChatAppBadge(app.appComponent) &&
						(appBadgeCounts?.[app.id] ?? 0) > 0
				),
			[appBadgeCounts, pinnedApps]
		);
		const pinnedFriendsBadgeActive = React.useMemo(
			() =>
				pinnedApps.some(
					(app) =>
						isFriendsAppBadge(app.appComponent) &&
						(appBadgeCounts?.[app.id] ?? 0) > 0
				),
			[appBadgeCounts, pinnedApps]
		);
		const pinnedAppsBadgeTotal = React.useMemo(
			() =>
				pinnedApps.reduce(
					(sum, app) => sum + (appBadgeCounts?.[app.id] ?? 0),
					0
				),
			[appBadgeCounts, pinnedApps]
		);
		const desktopAppIds = React.useMemo(
			() =>
				desktopItems
					.filter((item) => item.type === 'app' && !item.parentId)
					.map((item) => item.id),
			[desktopItems]
		);

		const { taskbarWindowItems, overflowWindows, hasOverflow } = useMemo(() => {
			if (DESKTOP_FEATURE_FLAGS.TASKBAR_GROUP_BY_APP) {
				const map = new Map<string, WindowState[]>();
				for (const w of windows) {
					const k = taskbarWindowGroupKey(w);
					if (!map.has(k)) map.set(k, []);
					map.get(k)?.push(w);
				}
				const items = Array.from(map.entries()).map(([key, wins]) => ({
					key,
					windows: wins,
				}));
				return {
					taskbarWindowItems: items,
					overflowWindows: [],
					hasOverflow: false,
				};
			}

			return {
				taskbarWindowItems: windows.map((w) => ({
					key: w.id,
					windows: [w],
				})),
				overflowWindows: [],
				hasOverflow: false,
			};
		}, [windows]);

		return (
			<>
				<DesktopShellFloatingPortal>
					{/* Window button context menu */}
					<AnimatePresence>
						{winContextMenu && contextWindow && (
							<m.div
								ref={winContextMenuRef}
								initial={{ opacity: 0, scale: 0.96, y: 4 }}
								animate={{ opacity: 1, scale: 1, y: 0 }}
								exit={{ opacity: 0, scale: 0.96, y: 4 }}
								transition={{ duration: 0.12 }}
								className="fixed"
								style={{
									zIndex: portalStackBase,
									left: adjustedWinContextMenu?.x ?? winContextMenu.x,
									top: adjustedWinContextMenu?.y ?? winContextMenu.y - 8,
								}}
								onClick={(e) => e.stopPropagation()}
								onMouseDown={(e) => e.stopPropagation()}
								onContextMenu={(e) => {
									e.preventDefault();
									e.stopPropagation();
								}}
							>
								<DesktopAppMenuSurface
									className="min-w-[244px]"
									role="menu"
									aria-label={t('windowContextMenu.ariaLabel', {
										title: contextWindowTitle,
									})}
								>
									<DesktopAppContextMenuTitle className="truncate">
										{contextWindowTitle}
									</DesktopAppContextMenuTitle>
									<div className="py-1">
										<DesktopAppMenuItem
											type="button"
											role="menuitem"
											onClick={() => {
												(onFocusWindow ?? onWinClick)(contextWindow.id);
												setWinContextMenu(null);
											}}
											className={DESKTOP_INTERACTIVE.focusRing}
										>
											{contextWindow.isMinimized
												? t('windowContextMenu.restore')
												: t('windowContextMenu.bringToFront')}
										</DesktopAppMenuItem>
										<DesktopAppMenuItem
											type="button"
											role="menuitem"
											disabled={contextWindow.isMinimized || !onMinimizeWindow}
											onClick={() => {
												onMinimizeWindow?.(contextWindow.id);
												setWinContextMenu(null);
											}}
											className={DESKTOP_INTERACTIVE.focusRing}
										>
											{t('windowContextMenu.minimize')}
										</DesktopAppMenuItem>
										<DesktopAppMenuItem
											type="button"
											role="menuitem"
											disabled={
												contextWindow.isMinimized || !onToggleMaximizeWindow
											}
											onClick={() => {
												onToggleMaximizeWindow?.(contextWindow.id);
												setWinContextMenu(null);
											}}
											className={DESKTOP_INTERACTIVE.focusRing}
										>
											{contextWindow.isMaximized
												? t('windowContextMenu.restore')
												: t('windowContextMenu.maximize')}
										</DesktopAppMenuItem>
										{otherDesktops.length > 0 && moveWindowToDesktop ? (
											<>
												<DesktopAppMenuDivider />
												<DesktopAppMenuSectionLabel>
													{t('taskbar.moveToDesktop')}
												</DesktopAppMenuSectionLabel>
												{otherDesktops.map((d) => (
													<DesktopAppMenuItem
														key={d.id}
														type="button"
														role="menuitem"
														icon={
															<ComputerDesktopIcon
																className="h-4 w-4"
																strokeWidth={DESKTOP_LUCIDE.stroke}
															/>
														}
														onClick={() => {
															moveWindowToDesktop(contextWindow.id, d.id);
															setWinContextMenu(null);
														}}
														className={DESKTOP_INTERACTIVE.focusRing}
													>
														{d.name}
													</DesktopAppMenuItem>
												))}
											</>
										) : null}
										<DesktopAppMenuDivider />
										<DesktopAppMenuItem
											type="button"
											role="menuitem"
											tone="danger"
											disabled={!onCloseWindow}
											onClick={() => {
												onCloseWindow?.(contextWindow.id);
												setWinContextMenu(null);
											}}
											className={DESKTOP_INTERACTIVE.focusRing}
										>
											{t('windowContextMenu.close')}
										</DesktopAppMenuItem>
									</div>
								</DesktopAppMenuSurface>
							</m.div>
						)}
					</AnimatePresence>

					{/* Start button context menu */}
					<AnimatePresence>
						{startContextMenu && (
							<m.div
								ref={startContextMenuRef}
								initial={{ opacity: 0, scale: 0.96, y: 4 }}
								animate={{ opacity: 1, scale: 1, y: 0 }}
								exit={{ opacity: 0, scale: 0.96, y: 4 }}
								transition={{ duration: 0.12 }}
								className="fixed"
								style={{
									zIndex: portalStackBase,
									left: adjustedStartContextMenu?.x ?? startContextMenu.x,
									top: adjustedStartContextMenu?.y ?? startContextMenu.y,
								}}
							>
								<DesktopAppMenuSurface
									className="min-w-[200px]"
									role="menu"
									aria-label={t('taskbar.startContextLabel')}
								>
									<DesktopAppMenuItem
										type="button"
										role="menuitem"
										onClick={() => {
											setShowStart((v) => !v);
											setStartContextMenu(null);
										}}
										className={DESKTOP_INTERACTIVE.focusRing}
									>
										{showStart
											? t('taskbar.closeStart')
											: t('taskbar.openStart')}
									</DesktopAppMenuItem>
								</DesktopAppMenuSurface>
							</m.div>
						)}
					</AnimatePresence>

					{/* Taskbar background context menu */}
					<AnimatePresence>
						{taskbarContextMenu && (
							<m.div
								ref={taskbarContextMenuRef}
								initial={{ opacity: 0, scale: 0.96, y: 4 }}
								animate={{ opacity: 1, scale: 1, y: 0 }}
								exit={{ opacity: 0, scale: 0.96, y: 4 }}
								transition={{ duration: 0.12 }}
								className="fixed"
								style={{
									zIndex: portalStackBase,
									left: adjustedTaskbarContextMenu?.x ?? taskbarContextMenu.x,
									top: adjustedTaskbarContextMenu?.y ?? taskbarContextMenu.y,
								}}
							>
								<DesktopAppMenuSurface
									className="min-w-[228px]"
									role="menu"
									aria-label={t('taskbar.backgroundContextLabel')}
								>
									<DesktopAppMenuItem
										type="button"
										role="menuitem"
										onClick={() => {
											window.dispatchEvent(
												new CustomEvent('desktop-show-desktop')
											);
											setTaskbarContextMenu(null);
										}}
										className={DESKTOP_INTERACTIVE.focusRing}
									>
										{t('taskbar.showDesktop')}
									</DesktopAppMenuItem>
									<DesktopAppMenuDivider />
									<DesktopAppMenuItem
										type="button"
										role="menuitem"
										onClick={() => {
											setShowNotifications((prev) => {
												const next = !prev;
												if (next) {
													setShowTray(false);
													setShowStart(false);
												}
												return next;
											});
											setTaskbarContextMenu(null);
										}}
										className={DESKTOP_INTERACTIVE.focusRing}
									>
										{t('taskbar.notificationCenter')}
									</DesktopAppMenuItem>
									{onWallpaper ? (
										<DesktopAppMenuItem
											type="button"
											role="menuitem"
											onClick={() => {
												onWallpaper();
												setTaskbarContextMenu(null);
											}}
											className={DESKTOP_INTERACTIVE.focusRing}
										>
											{t('taskbar.wallpaperMenu')}
										</DesktopAppMenuItem>
									) : null}
								</DesktopAppMenuSurface>
							</m.div>
						)}
					</AnimatePresence>
				</DesktopShellFloatingPortal>

				<AnimatePresence>
					{showWelcomeNudge ? (
						<div
							className="pointer-events-none absolute bottom-full left-0 right-0 z-20 flex justify-center pb-1"
							data-testid="desktop-welcome-nudge-slot"
						>
							<DesktopWelcomeNudgeBanner
								onStartTour={handleWelcomeNudgeStartTour}
								onDismiss={dismissNudge}
								reduceMotion={reduceMotion}
							/>
						</div>
					) : null}
				</AnimatePresence>

				{/* Full-width strip: captures all pointer events so desktop cannot receive drops/clicks in taskbar zone */}
				<m.div
					ref={taskbarStripRef}
					data-desktop-taskbar-strip
					data-desktop-welcome-guide="taskbar"
					role="toolbar"
					aria-label={t('taskbar.toolbarAria')}
					variants={taskbarVariants}
					initial="hidden"
					animate="visible"
					className={`absolute bottom-0 left-0 right-0 ${heightClass} flex items-center pointer-events-auto`}
					onContextMenu={(e) => {
						if (isBrowserContextMenuAllowedTarget(e.target)) return;
						const el = getContextMenuTargetElement(e.target);
						if (el?.closest('[data-taskbar-interactive="true"]')) return;
						e.preventDefault();
						setTaskbarContextMenu({ x: e.clientX, y: e.clientY });
					}}
				>
					<div
						ref={taskbarSurfaceBackdropRef}
						aria-hidden
						className={`pointer-events-none absolute inset-0 ${taskbarSurfaceClassName}`}
					/>
					{taskbarSolidOverlayOpacity > 0.008 ? (
						<div
							aria-hidden
							className="pointer-events-none absolute inset-0 z-1 rounded-t-(--desktop-radius-shell)"
							style={{
								opacity: taskbarSolidOverlayOpacity,
								/* Не смешивать с taskbarSurfaceClassName — chameleon задаёт полупрозрачный фон из CSS */
								background:
									taskbarStyleKey === 'premium'
										? 'var(--desktop-taskbar-bg-opaque-premium)'
										: 'var(--desktop-taskbar-bg-opaque)',
								backdropFilter: 'none',
								WebkitBackdropFilter: 'none',
							}}
						/>
					) : null}
					<div
						className={`relative z-10 flex h-full min-h-0 w-full items-center ${taskbar.PADDING_X} ${taskbar.GAP}`}
					>
						<TaskbarLeftCluster
							showStart={showStart}
							taskbarDividerClass={taskbarDividerClass}
							taskbarButtonSurface={taskbarButtonSurface}
							taskbarButtonActiveSurface={taskbarButtonActiveSurface}
							buttonVariants={buttonVariants}
							reduceMotion={reduceMotion}
							onStartClick={handleStartButtonClick}
							onStartContextMenu={handleStartButtonContextMenu}
						>
							{children}
						</TaskbarLeftCluster>

						<TaskbarPinnedAndWindowsStrip
							ref={pinnedWindowsStripRef}
							taskbarDividerClass={taskbarDividerClass}
							taskbarButtonSurface={taskbarButtonSurface}
							taskbarButtonActiveSurface={taskbarButtonActiveSurface}
							pinnedMenuButtonSurface={taskbarRightIconSurface}
							pinnedMenuButtonActiveSurface={taskbarRightIconActiveSurface}
							buttonVariants={buttonVariants}
							shellPanel={shellPanel}
							shellWindowStyle={shellWindowStyle}
							apps={apps}
							windows={windows}
							iconStyle={iconStyle}
							appBadgeCounts={appBadgeCounts}
							activeWindowId={activeWindowId}
							onWinClick={onWinClick}
							onOpenApp={onOpenApp}
							desktopAppIds={desktopAppIds}
							onPinAppToDesktop={onPinAppToDesktop}
							onUnpinAppFromDesktop={onUnpinAppFromDesktop}
							setWinContextMenu={setWinContextMenu}
							pinnedApps={pinnedApps}
							pinnedAppsBadgeTotal={pinnedAppsBadgeTotal}
							pinnedFriendsBadgeActive={pinnedFriendsBadgeActive}
							pinnedGafChatBadgeActive={pinnedGafChatBadgeActive}
							taskbarWindowItems={taskbarWindowItems}
							overflowWindows={overflowWindows}
							hasOverflow={hasOverflow}
							preferReducedMotion={!!reduceMotion}
						/>

						<div
							className={`w-px h-7 mx-0.5 shrink-0 ${taskbarDividerClass}`}
						/>

						{/* Right block: memo — не перерисовывается при hover на кнопках окон слева */}
						<TaskbarRightToolbar
							compact={compact}
							onShowShortcuts={onShowShortcuts}
							onOpenDesktopWelcomeTour={onOpenDesktopWelcomeTour}
							onOpenSessionInfo={onOpenSessionInfo}
							taskbarButtonSurface={taskbarRightIconSurface}
							taskbarButtonActiveSurface={taskbarRightIconActiveSurface}
							reduceMotion={reduceMotion}
							showTray={showTray}
							onToggleTray={handleToggleTray}
							onCloseTray={handleCloseTray}
							apps={apps}
							onOpenApp={onOpenApp}
							minimizedPersistentSurfaceApps={minimizedPersistentSurfaceApps}
							shellPanelStrong={shellPanelStrong}
							shellPanel={shellPanel}
							iconStyle={iconStyle}
							shellWindowStyle={shellWindowStyle}
							showNotifications={showNotifications}
							onNotificationBellClick={handleNotificationBellClick}
							onCloseNotificationPanel={handleCloseNotificationPanel}
							clockRef={clockRef}
						/>
					</div>
				</m.div>

				{/* Start Menu — chunk loads only when open */}
				{showStart ? (
					<Suspense fallback={<StartMenuSuspenseFallback />}>
						<StartMenu
							isOpen={showStart}
							onClose={() => setShowStart(false)}
							apps={apps}
							desktopItems={desktopItems}
							startMenuVirtualDesktops={desktops}
							startMenuGlobalWallpaper={startMenuGlobalWallpaper}
							desktopAppIds={desktopAppIds}
							onOpenApp={onOpenApp}
							onWallpaper={onWallpaper}
							onAppStore={onAppStore}
							onPowerOff={() => {
								void performLogout();
							}}
							onOpenProfile={onOpenProfile}
							onOpenAdmin={onOpenAdmin}
							onPinAppToDesktop={onPinAppToDesktop}
							onUnpinAppFromDesktop={onUnpinAppFromDesktop}
							onOpenAppInWorkspace={onOpenAppInWorkspace}
							recentFiles={recentFiles}
							recentLibraryOpened={recentLibraryOpened}
							recentLibraryAdded={recentLibraryAdded}
							recentLibraryGenerated={recentLibraryGenerated}
							recentLibraryUploaded={recentLibraryUploaded}
							recentLibraryProjects={recentLibraryProjects}
							recentContentFeedLoading={recentContentFeedLoading}
							recentContentFeedError={recentContentFeedError}
							recentContentFeedLoadedAt={recentContentFeedLoadedAt}
							hasRecentContentFeedItems={hasRecentContentFeedItems}
							onRefetchRecentContentFeed={onRefetchRecentContentFeed}
							onOpenShellWorkspacesSettings={onOpenShellWorkspacesSettings}
							startMenuIntent={startMenuIntent}
							onOpenRecentFile={onStartMenuOpenRecentFile}
							onRemoveRecentFile={onStartMenuRemoveRecentFile}
							startMenuActiveDesktopId={startMenuActiveDesktopId}
							storeApps={storeApps}
							iconStyle={iconStyle}
							shellWindowStyle={shellWindowStyle}
							expansionState={expansionState}
							expansionLaunchActions={expansionLaunchActions}
							resumeWindows={startMenuResumeWindows}
							onResumeOpenWindow={onStartMenuResumeOpenWindow}
							startMenuWorkspaceContextWindows={
								startMenuWorkspaceContextWindows
							}
							getWindowsOnDesktop={getWindowsOnDesktop}
						/>
					</Suspense>
				) : null}
			</>
		);
	}
);

Taskbar.displayName = 'Taskbar';

export default Taskbar;
