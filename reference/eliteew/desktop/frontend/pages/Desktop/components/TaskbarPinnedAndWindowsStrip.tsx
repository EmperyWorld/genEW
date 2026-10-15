/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Закреплённые приложения, кнопки окон, overflow и модалка «Все закреплённые».
 * Панель закреплённых вынесена в отдельный memo-поддерево: открытие модалки не трогает рендер кнопок окон.
 *
 * Invariants:
 * - Window buttons use left click for focus/minimize toggle and delegate ПКМ window actions to `Taskbar`.
 * - Pinned-app modal remains isolated from live window hover flyouts.
 * - Escape on pinned-app context menu closes ctx first; pinned modal Escape closes grid only when ctx is closed.
 *
 * Related:
 * - `Taskbar.tsx`
 * - `TaskbarIconContextMenu.tsx`
 */

import { themeDesignTokens } from '@/theme/designTokens';
import { cn } from '@/utils/cn';
import { AnimatePresence, m, type Variants } from 'framer-motion';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { DesktopWindowMorphChip } from './DesktopWindowMorphChip';
import {
	forwardRef,
	memo,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import type { DesktopIconStyle, DesktopWindowStyle } from '@/types/profile';
import {
	DESKTOP_INTERACTIVE,
	DESKTOP_LUCIDE,
	DESKTOP_TOOLTIP,
	DESKTOP_TYPOGRAPHY,
	DESKTOP_Z_INDEX,
} from '@/pages/Desktop/constants';
import { useDesktopWindowPortalStackBase } from '@/pages/Desktop/context/DesktopWindowPortalStackContext';
import type { OpenWindowOptions } from '../hooks/useWindowManager';
import type { DesktopItem, WindowState } from '../types/desktop.types';
import {
	isSystemDesktopApp,
} from '../utils/desktopAppRegistry';
import { preloadDesktopApp } from '../utils/preloadDesktopApp';
import {
	getContextMenuPositionFromCursor,
	getDesktopPortalShellProps,
	isBrowserContextMenuAllowedTarget,
} from '../utils/desktopUi';
import { DesktopAppBadge } from '../utils/desktopVisualSystem';
import { useDismissibleFloatingMenu } from '../hooks/useDismissibleFloatingMenu';
import { useDesktopPopoverOpenGuard } from '../hooks/useDesktopPopoverOpenGuard';
import { useFinePointerHover } from '../hooks/useFinePointerHover';
import { shouldDismissPinnedMenuBackdrop } from '../utils/desktopShellOutsideDismiss';
import {
	DESKTOP_APP_STYLE_CONTRACT,
	DesktopAppButton,
	DesktopAppMenuDivider,
	DesktopAppMenuHeader,
	DesktopAppMenuItem,
	DesktopAppMenuSectionLabel,
	DesktopAppMenuSurface,
	DesktopAppSectionLabel,
} from './DesktopAppChrome';
import { TaskbarCountBadge } from './TaskbarCountBadge';
import { TaskbarWindowPreviewFlyout } from './taskbarStrip/TaskbarWindowPreviewFlyout';
import {
	getTaskbarWindowTitle,
	isFriendsAppBadge,
	isGafChatAppBadge,
	resolveWindowSourceApp,
	shouldUseDenseTaskbarWindowMode,
	TASKBAR_DENSE_WINDOW_COUNT,
} from './taskbarStrip/taskbarStripHelpers';
import { useDesktopShellMotionPrefs } from '../context/DesktopShellMotionPrefsContext';
import {
	ChevronUpIcon,
	ComputerDesktopIcon,
	PlayIcon,
	RectangleStackIcon,
	SquaresPlusIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';

const PINNED_MENU_GRID_DEFER_FRAMES = 2;
const PINNED_MENU_BACKDROP_CLASS =
	'bg-(--desktop-overlay-backdrop) transition-opacity duration-150 motion-reduce:transition-none';
const PINNED_MENU_PANEL_CLASS =
	'relative flex max-h-[min(74vh,calc(100dvh-6rem))] min-h-0 w-[min(590px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.75rem] border-0 bg-[rgb(var(--desktop-bg-secondary-rgb))] text-(--desktop-text-primary) shadow-[0_30px_80px_rgba(0,0,0,0.58)] will-change-[opacity,transform]';
const PINNED_MENU_HEADER_CLASS =
	'relative shrink-0 border-b border-[color-mix(in_srgb,var(--desktop-text-primary)_10%,transparent)] bg-[rgb(var(--desktop-bg-secondary-rgb))] px-5 pb-3.5 pt-4.5';
const PINNED_MENU_BODY_CLASS =
	'min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-[rgb(var(--desktop-bg-primary-rgb))] px-4 pb-4 pt-3 contain-[layout_paint_style]';
const PINNED_MENU_FOOTER_CLASS =
	'border-t border-[color-mix(in_srgb,var(--desktop-text-primary)_10%,transparent)] bg-[rgb(var(--desktop-bg-secondary-rgb))]';

export { TASKBAR_DENSE_WINDOW_COUNT, shouldUseDenseTaskbarWindowMode };
export type TaskbarPinnedAndWindowsStripHandle = {
	closeFlyouts: () => void;
	/** Hover-only: window previews / tooltips — not Start / pinned / tray toggles. */
	closeHoverFlyouts: () => void;
};

export type TaskbarPinnedAndWindowsStripProps = {
	taskbarDividerClass: string;
	taskbarButtonSurface: string;
	taskbarButtonActiveSurface: string;
	/** Кнопка «Закреплённые» — без окантовки пресета, как иконки справа (трей/часы). */
	pinnedMenuButtonSurface: string;
	pinnedMenuButtonActiveSurface: string;
	buttonVariants: Variants;
	shellPanel: string;
	/** Пресет «стиль окон» — палитра панели «Все закреплённые». */
	shellWindowStyle?: DesktopWindowStyle;
	apps: DesktopItem[];
	/** Все окна рабочего стола (для модалки закреплённых). */
	windows: WindowState[];
	iconStyle: DesktopIconStyle;
	appBadgeCounts?: Record<string, number>;
	activeWindowId?: string | null;
	onWinClick: (id: string) => void;
	onOpenApp: (app: DesktopItem, options?: OpenWindowOptions) => void;
	desktopAppIds?: string[];
	onPinAppToDesktop?: (app: DesktopItem) => void;
	onUnpinAppFromDesktop?: (app: DesktopItem) => void;
	setWinContextMenu: (
		v: { windowId: string; x: number; y: number } | null
	) => void;
	pinnedApps: DesktopItem[];
	pinnedAppsBadgeTotal: number;
	pinnedFriendsBadgeActive: boolean;
	pinnedGafChatBadgeActive: boolean;
	taskbarWindowItems: { key: string; windows: WindowState[] }[];
	overflowWindows: WindowState[];
	hasOverflow: boolean;
	/** Framer/OS «reduce motion»: короче анимации модалки закреплённых. */
	preferReducedMotion?: boolean;
};

type TaskbarPinnedMenuIslandHandle = {
	closePinnedMenu: () => void;
};

type TaskbarPinnedMenuIslandProps = {
	taskbarDividerClass: string;
	pinnedMenuButtonSurface: string;
	pinnedMenuButtonActiveSurface: string;
	buttonVariants: Variants;
	shellWindowStyle: DesktopWindowStyle;
	pinnedApps: DesktopItem[];
	pinnedAppsBadgeTotal: number;
	pinnedFriendsBadgeActive: boolean;
	pinnedGafChatBadgeActive: boolean;
	windows: WindowState[];
	iconStyle: DesktopIconStyle;
	appBadgeCounts?: Record<string, number>;
	onWinClick: (id: string) => void;
	onOpenApp: (app: DesktopItem, options?: OpenWindowOptions) => void;
	desktopAppIds: string[];
	onPinAppToDesktop?: (app: DesktopItem) => void;
	onUnpinAppFromDesktop?: (app: DesktopItem) => void;
	/** Из настроек ОС / Framer — короткие анимации без spring. */
	preferReducedMotion: boolean;
};

type PinnedAppTileProps = {
	app: DesktopItem;
	badge: number;
	iconStyle: DesktopIconStyle;
	isOpen: boolean;
	openWindowId: string | undefined;
	openBadgeLabel: string;
	onWinClick: (id: string) => void;
	onOpenApp: (app: DesktopItem, options?: OpenWindowOptions) => void;
	onClose: () => void;
	onContextMenu: (e: ReactMouseEvent, app: DesktopItem) => void;
};

const PinnedAppTile = memo(function PinnedAppTile({
	app,
	badge,
	iconStyle,
	isOpen,
	openWindowId,
	openBadgeLabel,
	onWinClick,
	onOpenApp,
	onClose,
	onContextMenu,
}: PinnedAppTileProps) {
	const friendsBadge = isFriendsAppBadge(app.appComponent);
	const gafChatBadge = isGafChatAppBadge(app.appComponent);

	return (
		<button
			type="button"
			onPointerEnter={() => {
				void preloadDesktopApp(app.appComponent);
			}}
			onFocus={() => {
				void preloadDesktopApp(app.appComponent);
			}}
			onClick={() => {
				if (openWindowId) {
					onWinClick(openWindowId);
				} else {
					onOpenApp(app);
				}
				onClose();
			}}
			onContextMenu={(e) => onContextMenu(e, app)}
			onMouseDown={(e) => {
				if (e.button !== 2) return;
				onContextMenu(e, app);
			}}
			className={cn(
				'relative flex flex-col items-center gap-2 p-3 rounded-2xl group',
				'transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out motion-reduce:transition-none',
				'motion-safe:fine-hover:-translate-y-0.5 motion-safe:active:translate-y-0',
				DESKTOP_APP_STYLE_CONTRACT.softCard,
				'border-[color-mix(in_srgb,var(--desktop-text-primary)_9%,transparent)] bg-[rgb(var(--desktop-bg-secondary-rgb))] fine-hover:border-[rgb(var(--desktop-accent-rgb)/0.34)] fine-hover:bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb)/0.12)_100%,rgb(var(--desktop-bg-secondary-rgb)))]',
				DESKTOP_INTERACTIVE.focusRing
			)}
			aria-label={app.name}
		>
			<div className="relative h-11 w-11 sm:h-12 sm:w-12">
				<DesktopAppBadge
					appComponent={app.appComponent}
					icon={app.icon}
					variant="start"
					className="h-11 w-11 sm:h-12 sm:w-12"
					iconStyle={iconStyle}
				/>
				<TaskbarCountBadge
					count={badge}
					variant={friendsBadge ? 'friends' : gafChatBadge ? 'chat' : 'default'}
					positionClassName="-top-1.5 -right-1.5"
				/>
			</div>
			<span
				className={cn(
					DESKTOP_TYPOGRAPHY.widgetTrackTitle,
					'w-full text-center'
				)}
			>
				{app.name}
			</span>
			<span
				className={cn(
					DESKTOP_TYPOGRAPHY.small,
					'w-full text-center',
					isOpen
						? 'font-medium text-[rgb(var(--desktop-accent-rgb))]'
						: 'text-(--desktop-text-muted)'
				)}
			>
				{isOpen ? openBadgeLabel : '\u00a0'}
			</span>
		</button>
	);
});

function arePinnedAppsEqual(prev: DesktopItem[], next: DesktopItem[]): boolean {
	if (prev === next) return true;
	if (prev.length !== next.length) return false;
	for (let i = 0; i < prev.length; i += 1) {
		const a = prev[i];
		const b = next[i];
		if (
			a?.id !== b?.id ||
			a?.name !== b?.name ||
			a?.appComponent !== b?.appComponent ||
			a?.icon !== b?.icon
		) {
			return false;
		}
	}
	return true;
}

function arePinnedWindowsEqual(
	prev: WindowState[],
	next: WindowState[]
): boolean {
	if (prev === next) return true;
	if (prev.length !== next.length) return false;
	for (let i = 0; i < prev.length; i += 1) {
		const a = prev[i];
		const b = next[i];
		if (a?.id !== b?.id || a?.folderId !== b?.folderId) {
			return false;
		}
	}
	return true;
}

function arePinnedBadgeCountsEqual(
	prev: Record<string, number> | undefined,
	next: Record<string, number> | undefined,
	pinnedApps: DesktopItem[]
): boolean {
	if (prev === next) return true;
	for (const app of pinnedApps) {
		if ((prev?.[app.id] ?? 0) !== (next?.[app.id] ?? 0)) {
			return false;
		}
	}
	return true;
}

function areStringArraysEqual(prev: string[], next: string[]): boolean {
	if (prev === next) return true;
	if (prev.length !== next.length) return false;
	for (let i = 0; i < prev.length; i += 1) {
		if (prev[i] !== next[i]) return false;
	}
	return true;
}

function areTaskbarPinnedMenuIslandPropsEqual(
	prev: TaskbarPinnedMenuIslandProps,
	next: TaskbarPinnedMenuIslandProps
): boolean {
	return (
		prev.taskbarDividerClass === next.taskbarDividerClass &&
		prev.pinnedMenuButtonSurface === next.pinnedMenuButtonSurface &&
		prev.pinnedMenuButtonActiveSurface === next.pinnedMenuButtonActiveSurface &&
		prev.buttonVariants === next.buttonVariants &&
		prev.shellWindowStyle === next.shellWindowStyle &&
		prev.pinnedAppsBadgeTotal === next.pinnedAppsBadgeTotal &&
		prev.pinnedFriendsBadgeActive === next.pinnedFriendsBadgeActive &&
		prev.pinnedGafChatBadgeActive === next.pinnedGafChatBadgeActive &&
		prev.iconStyle === next.iconStyle &&
		prev.onWinClick === next.onWinClick &&
		prev.onOpenApp === next.onOpenApp &&
		prev.onPinAppToDesktop === next.onPinAppToDesktop &&
		prev.onUnpinAppFromDesktop === next.onUnpinAppFromDesktop &&
		prev.preferReducedMotion === next.preferReducedMotion &&
		areStringArraysEqual(prev.desktopAppIds, next.desktopAppIds) &&
		arePinnedAppsEqual(prev.pinnedApps, next.pinnedApps) &&
		arePinnedWindowsEqual(prev.windows, next.windows) &&
		arePinnedBadgeCountsEqual(
			prev.appBadgeCounts,
			next.appBadgeCounts,
			next.pinnedApps
		)
	);
}

const TaskbarPinnedMenuIsland = memo(
	forwardRef<TaskbarPinnedMenuIslandHandle, TaskbarPinnedMenuIslandProps>(
		function TaskbarPinnedMenuIsland(
			{
				taskbarDividerClass,
				pinnedMenuButtonSurface,
				pinnedMenuButtonActiveSurface,
				buttonVariants,
				pinnedApps,
				pinnedAppsBadgeTotal,
				pinnedFriendsBadgeActive,
				pinnedGafChatBadgeActive,
				windows,
				iconStyle,
				appBadgeCounts,
				onWinClick,
				onOpenApp,
				desktopAppIds,
				onPinAppToDesktop,
				onUnpinAppFromDesktop,
				preferReducedMotion,
			},
			ref
		) {
			const { t } = useTranslation('desktopUi');
			const { taskbar } = themeDesignTokens.desktop;
			const finePointerHover = useFinePointerHover();
			const [showPinnedMenu, setShowPinnedMenu] = useState(false);
			const [isPinnedMenuPortalMounted, setPinnedMenuPortalMounted] =
				useState(false);
			const [renderPinnedGrid, setRenderPinnedGrid] = useState(false);
			const [pinnedAppCtx, setPinnedAppCtx] = useState<{
				x: number;
				y: number;
				app: DesktopItem;
			} | null>(null);
			const pinnedAppMenuRef = useRef<HTMLDivElement>(null);
			const pinnedMenuOpenGuardRef = useDesktopPopoverOpenGuard(showPinnedMenu);

			const windowByFolderId = useMemo(() => {
				const map = new Map<string, WindowState>();
				for (const win of windows) {
					const fid = win.folderId;
					if (fid == null || fid === '') continue;
					if (!map.has(fid)) map.set(fid, win);
				}
				return map;
			}, [windows]);
			const desktopAppIdSet = useMemo(
				() => new Set(desktopAppIds),
				[desktopAppIds]
			);
			const portalShellProps =
				isPinnedMenuPortalMounted || pinnedAppCtx != null
					? getDesktopPortalShellProps()
					: null;

			const openPinnedMenu = useCallback(() => {
				setPinnedMenuPortalMounted(true);
				setShowPinnedMenu(true);
			}, []);

			const closePinnedMenu = useCallback(() => {
				setPinnedAppCtx(null);
				setShowPinnedMenu(false);
			}, []);

			const handlePinnedMenuBackdropClose = useCallback(() => {
				if (!shouldDismissPinnedMenuBackdrop(pinnedMenuOpenGuardRef.current)) {
					return;
				}
				closePinnedMenu();
			}, [closePinnedMenu, pinnedMenuOpenGuardRef]);

			const closePinnedAppContextMenu = useCallback(() => {
				setPinnedAppCtx(null);
			}, []);

			const handlePinnedAppContextMenu = useCallback(
				(e: ReactMouseEvent, app: DesktopItem) => {
					e.preventDefault();
					e.stopPropagation();
					setPinnedAppCtx({ x: e.clientX, y: e.clientY, app });
				},
				[]
			);

			useDismissibleFloatingMenu({
				isOpen: pinnedAppCtx != null,
				menuRef: pinnedAppMenuRef,
				onClose: closePinnedAppContextMenu,
				escapeCapture: true,
				focusFirstMenuItem: true,
			});

			useImperativeHandle(
				ref,
				() => ({
					closePinnedMenu,
				}),
				[closePinnedMenu]
			);

			useEffect(() => {
				if (!showPinnedMenu) return;
				const onKey = (e: KeyboardEvent) => {
					if (e.key !== 'Escape') return;
					e.preventDefault();
					if (pinnedAppCtx != null) {
						setPinnedAppCtx(null);
						return;
					}
					closePinnedMenu();
				};
				document.addEventListener('keydown', onKey);
				return () => document.removeEventListener('keydown', onKey);
			}, [closePinnedMenu, pinnedAppCtx, showPinnedMenu]);

			useEffect(() => {
				if (!showPinnedMenu) {
					setRenderPinnedGrid(false);
					return;
				}
				if (preferReducedMotion) {
					setRenderPinnedGrid(true);
					return;
				}

				let frame = 0;
				let rafId = 0;
				const schedule = () => {
					frame += 1;
					if (frame >= PINNED_MENU_GRID_DEFER_FRAMES) {
						setRenderPinnedGrid(true);
						return;
					}
					rafId = window.requestAnimationFrame(schedule);
				};
				rafId = window.requestAnimationFrame(schedule);
				return () => {
					window.cancelAnimationFrame(rafId);
				};
			}, [preferReducedMotion, showPinnedMenu]);

			const backdropTransition = preferReducedMotion
				? { duration: 0.05 }
				: { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const };
			const panelTransition = preferReducedMotion
				? { duration: 0.05 }
				: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };
			const pinnedAppCtxPosition =
				pinnedAppCtx != null
					? getContextMenuPositionFromCursor({
							clientX: pinnedAppCtx.x,
							clientY: pinnedAppCtx.y,
							menuWidth: 280,
							menuHeight: 260,
						})
					: null;

			if (pinnedApps.length === 0) {
				return null;
			}

			const modal =
				isPinnedMenuPortalMounted && typeof document !== 'undefined'
					? createPortal(
							<AnimatePresence
								onExitComplete={() => {
									setPinnedMenuPortalMounted(false);
								}}
							>
								{showPinnedMenu && (
									<m.div
										data-theme={portalShellProps?.theme}
										className={cn(
											'fixed inset-0 flex items-center justify-center p-4 sm:p-6',
											PINNED_MENU_BACKDROP_CLASS
										)}
										style={{
											...(portalShellProps?.style ?? {}),
											zIndex: DESKTOP_Z_INDEX.MODAL,
										}}
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										exit={{ opacity: 0 }}
										transition={backdropTransition}
										layout={false}
										onClick={handlePinnedMenuBackdropClose}
									>
										<m.div
											data-taskbar-pinned-menu
											className={PINNED_MENU_PANEL_CLASS}
											style={{ zIndex: DESKTOP_Z_INDEX.MODAL_CONTENT }}
											initial={
												preferReducedMotion
													? { opacity: 0 }
													: { opacity: 0, y: 10 }
											}
											animate={{ opacity: 1, y: 0 }}
											exit={
												preferReducedMotion
													? { opacity: 0 }
													: { opacity: 0, y: 8 }
											}
											transition={panelTransition}
											onClick={(e) => e.stopPropagation()}
											layout={false}
											role="dialog"
											aria-modal="true"
											aria-labelledby="taskbar-pinned-menu-title"
										>
											<div className={PINNED_MENU_HEADER_CLASS}>
												<div className="flex items-start justify-between gap-3 pr-10">
													<div className="min-w-0">
														<DesktopAppSectionLabel
															id="taskbar-pinned-menu-title"
															className="tracking-[0.2em]"
														>
															{t('taskbar.pinnedMenuTitle')}
														</DesktopAppSectionLabel>
														<p
															className={cn(
																DESKTOP_TYPOGRAPHY.meta,
																'mt-1 leading-relaxed text-(--desktop-text-muted)'
															)}
														>
															{t('taskbar.pinnedMenuSubtitle', {
																count: pinnedApps.length,
															})}
														</p>
													</div>
													<span
														className={cn(
															DESKTOP_TYPOGRAPHY.sectionPill,
															'shrink-0 rounded-full border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1 tabular-nums'
														)}
														aria-hidden
													>
														{pinnedApps.length}
													</span>
												</div>
												<DesktopAppButton
													type="button"
													variant="ghost"
													size="icon"
													className="absolute right-3 top-3"
													onClick={closePinnedMenu}
													aria-label={t('taskbar.pinnedCloseAria')}
												>
													<XMarkIcon
														className={DESKTOP_LUCIDE.md}
														strokeWidth={DESKTOP_LUCIDE.stroke}
													/>
												</DesktopAppButton>
											</div>

											<div
												className={PINNED_MENU_BODY_CLASS}
												aria-busy={!renderPinnedGrid}
											>
												{renderPinnedGrid ? (
													<div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
														{pinnedApps.map((app) => {
															const win = windowByFolderId.get(app.id);
															return (
																<PinnedAppTile
																	key={app.id}
																	app={app}
																	badge={appBadgeCounts?.[app.id] ?? 0}
																	iconStyle={iconStyle}
																	isOpen={!!win}
																	openWindowId={win?.id}
																	openBadgeLabel={t('taskbar.pinnedOpenBadge')}
																	onWinClick={onWinClick}
																	onOpenApp={onOpenApp}
																	onClose={closePinnedMenu}
																	onContextMenu={handlePinnedAppContextMenu}
																/>
															);
														})}
													</div>
												) : (
													<div className="min-h-[260px]" aria-hidden />
												)}
											</div>

											<div className={PINNED_MENU_FOOTER_CLASS}>
												<div className="flex items-center justify-between gap-3 px-4 py-2.5">
													<span
														className={cn(
															DESKTOP_TYPOGRAPHY.shellMeta10,
															'text-(--desktop-text-muted)'
														)}
													>
														{t('taskbar.pinnedMenuEscHint')} ·{' '}
														{t('taskbar.pinnedMenuContextHint')}
													</span>
													<kbd className={DESKTOP_TYPOGRAPHY.shellKbdGlyph}>
														Esc
													</kbd>
												</div>
											</div>
										</m.div>
									</m.div>
								)}
							</AnimatePresence>,
							document.body
						)
					: null;
			const pinnedAppContextMenu =
				pinnedAppCtx && pinnedAppCtxPosition && typeof document !== 'undefined'
					? createPortal(
							<m.div
								ref={pinnedAppMenuRef}
								data-theme={portalShellProps?.theme}
								role="menu"
								aria-label={t('taskbar.pinnedContextLabel', {
									name: pinnedAppCtx.app.name,
								})}
								initial={{ opacity: 0, scale: 0.98, y: 4 }}
								animate={{ opacity: 1, scale: 1, y: 0 }}
								transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
								className="fixed text-(--desktop-text-primary)"
								style={{
									...(portalShellProps?.style ?? {}),
									left: pinnedAppCtxPosition.x,
									top: pinnedAppCtxPosition.y,
									zIndex: DESKTOP_Z_INDEX.CONTEXT_MENU,
								}}
								onContextMenu={(e) => {
									if (isBrowserContextMenuAllowedTarget(e.target)) return;
									e.preventDefault();
									e.stopPropagation();
								}}
							>
								<DesktopAppMenuSurface className="min-w-[260px] max-w-[min(92vw,310px)] overflow-hidden border-0 bg-[rgb(var(--desktop-bg-secondary-rgb))] shadow-[0_24px_64px_rgba(0,0,0,0.5)] ring-0 backdrop-blur-none">
									<DesktopAppMenuHeader
										className="bg-[rgb(var(--desktop-bg-secondary-rgb))]"
										leading={
											<DesktopAppBadge
												appComponent={pinnedAppCtx.app.appComponent}
												icon={pinnedAppCtx.app.icon}
												variant="start"
												className="relative h-9 w-9"
												iconStyle={iconStyle}
											/>
										}
										title={pinnedAppCtx.app.name}
										subtitle={
											windowByFolderId.get(pinnedAppCtx.app.id)
												? t('taskbar.pinnedContextOpenSubtitle')
												: t('taskbar.pinnedContextReadySubtitle')
										}
									/>
									<div className="px-1 py-1.5">
										{(() => {
											const app = pinnedAppCtx.app;
											const win = windowByFolderId.get(app.id);
											const onDesk = desktopAppIdSet.has(app.id);
											const canChangeDesktopShortcut =
												!isSystemDesktopApp(app) &&
												(onPinAppToDesktop != null ||
													onUnpinAppFromDesktop != null);
											return (
												<>
													<DesktopAppMenuItem
														type="button"
														role="menuitem"
														className={DESKTOP_INTERACTIVE.focusRing}
														icon={
															<PlayIcon
																className={DESKTOP_LUCIDE.md}
																strokeWidth={DESKTOP_LUCIDE.stroke}
															/>
														}
														onClick={() => {
															if (win) {
																onWinClick(win.id);
															} else {
																onOpenApp(app);
															}
															closePinnedMenu();
														}}
													>
														{win
															? t('taskbar.pinnedContextFocusWindow')
															: t('startMenu.openApp')}
													</DesktopAppMenuItem>
													<DesktopAppMenuItem
														type="button"
														role="menuitem"
														className={DESKTOP_INTERACTIVE.focusRing}
														icon={
															<SquaresPlusIcon
																className={DESKTOP_LUCIDE.md}
																strokeWidth={DESKTOP_LUCIDE.stroke}
															/>
														}
														onClick={() => {
															onOpenApp(app, { forceNew: true });
															closePinnedMenu();
														}}
													>
														{t('startMenu.newWindow')}
													</DesktopAppMenuItem>
													{canChangeDesktopShortcut ? (
														<>
															<DesktopAppMenuDivider className="mx-1.5" />
															<DesktopAppMenuSectionLabel className="border-0 bg-transparent px-3 pb-1 pt-1">
																{t('taskbar.pinnedContextDesktopSection')}
															</DesktopAppMenuSectionLabel>
															{onDesk && onUnpinAppFromDesktop ? (
																<DesktopAppMenuItem
																	type="button"
																	role="menuitem"
																	className={DESKTOP_INTERACTIVE.focusRing}
																	icon={
																		<ComputerDesktopIcon
																			className={DESKTOP_LUCIDE.md}
																			strokeWidth={DESKTOP_LUCIDE.stroke}
																		/>
																	}
																	onClick={() => {
																		onUnpinAppFromDesktop(app);
																		closePinnedAppContextMenu();
																	}}
																>
																	{t('startMenu.unpinFromDesktop')}
																</DesktopAppMenuItem>
															) : onPinAppToDesktop ? (
																<DesktopAppMenuItem
																	type="button"
																	role="menuitem"
																	className={DESKTOP_INTERACTIVE.focusRing}
																	disabled={onDesk}
																	icon={
																		<ComputerDesktopIcon
																			className={DESKTOP_LUCIDE.md}
																			strokeWidth={DESKTOP_LUCIDE.stroke}
																		/>
																	}
																	onClick={() => {
																		if (onDesk) {
																			closePinnedAppContextMenu();
																			return;
																		}
																		onPinAppToDesktop(app);
																		closePinnedAppContextMenu();
																	}}
																>
																	{onDesk
																		? t('startMenu.alreadyOnDesktop')
																		: t('startMenu.pinToDesktop')}
																</DesktopAppMenuItem>
															) : null}
														</>
													) : null}
												</>
											);
										})()}
									</div>
								</DesktopAppMenuSurface>
							</m.div>,
							document.body
						)
					: null;

			return (
				<>
					<div className="flex items-center gap-1 shrink-0">
						<div
							className={cn(
								'rounded-xl p-px transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none',
								showPinnedMenu
									? 'border border-[rgb(var(--desktop-accent-rgb)/0.42)] bg-[rgb(var(--desktop-accent-rgb)/0.14)] shadow-[inset_0_0_0_1px_rgb(var(--desktop-accent-rgb)/0.22)]'
									: 'border border-transparent fine-hover:border-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb))_16%,transparent)] fine-hover:bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb))_8%,transparent)]'
							)}
						>
							<DesktopChromeTooltip
								content={t('taskbar.pinnedTitle')}
								placement="top"
							>
								<m.button
									data-taskbar-interactive="true"
									type="button"
									onClick={openPinnedMenu}
									className={`${taskbar.HIT_MIN_CLASS} rounded-[0.65rem] px-1.5 py-1 transition-[background-color,opacity,color] duration-200 motion-reduce:transition-none ${DESKTOP_INTERACTIVE.focusRing} ${showPinnedMenu ? pinnedMenuButtonActiveSurface : pinnedMenuButtonSurface}`}
									variants={buttonVariants}
									initial="initial"
									whileHover={finePointerHover ? 'hover' : undefined}
									whileTap="tap"
									aria-label={t('taskbar.pinnedAria')}
									aria-expanded={showPinnedMenu}
									aria-haspopup="dialog"
								>
									<span className="relative flex items-center justify-center">
										<RectangleStackIcon
											className={cn(
												taskbar.ICON_CLASS,
												showPinnedMenu &&
													'text-[rgb(var(--desktop-accent-rgb)/0.98)]'
											)}
											strokeWidth={DESKTOP_LUCIDE.stroke}
											aria-hidden
										/>
										<TaskbarCountBadge
											count={pinnedAppsBadgeTotal}
											variant={
												pinnedFriendsBadgeActive
													? 'friends'
													: pinnedGafChatBadgeActive
														? 'chat'
														: 'default'
											}
											positionClassName="-top-2 -right-2"
										/>
									</span>
								</m.button>
							</DesktopChromeTooltip>
						</div>
						<div
							className={`w-px h-7 mx-0.5 shrink-0 ${taskbarDividerClass}`}
						/>
					</div>
					{modal}
					{pinnedAppContextMenu}
				</>
			);
		}
	),
	areTaskbarPinnedMenuIslandPropsEqual
);
TaskbarPinnedMenuIsland.displayName = 'TaskbarPinnedMenuIsland';

type TaskbarWindowsOverflowStripHandle = {
	closeFlyouts: () => void;
	closeHoverFlyouts: () => void;
};

type TaskbarWindowsOverflowStripProps = Pick<
	TaskbarPinnedAndWindowsStripProps,
	| 'taskbarButtonSurface'
	| 'taskbarButtonActiveSurface'
	| 'buttonVariants'
	| 'shellPanel'
	| 'apps'
	| 'iconStyle'
	| 'appBadgeCounts'
	| 'activeWindowId'
	| 'onWinClick'
	| 'setWinContextMenu'
	| 'taskbarWindowItems'
	| 'overflowWindows'
	| 'hasOverflow'
>;

const TaskbarWindowsOverflowStrip = memo(
	forwardRef<
		TaskbarWindowsOverflowStripHandle,
		TaskbarWindowsOverflowStripProps
	>(function TaskbarWindowsOverflowStrip(
		{
			taskbarButtonSurface,
			taskbarButtonActiveSurface,
			buttonVariants,
			shellPanel,
			apps,
			iconStyle,
			appBadgeCounts,
			activeWindowId = null,
			onWinClick,
			setWinContextMenu,
			taskbarWindowItems,
			overflowWindows,
			hasOverflow,
		},
		ref
	) {
		const { t } = useTranslation('desktopUi');
		const { reduceMotion } = useDesktopShellMotionPrefs();
		const portalStackBase = useDesktopWindowPortalStackBase();
		const { taskbar } = themeDesignTokens.desktop;
		const finePointerHover = useFinePointerHover();
		const [hoveredWin, setHoveredWin] = useState<string | null>(null);
		const [showPreviewForWin, setShowPreviewForWin] = useState<string | null>(
			null
		);
		const previewDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
		const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
		const [groupMenuOpen, setGroupMenuOpen] = useState<string | null>(null);
		const denseWindowMode = shouldUseDenseTaskbarWindowMode(
			taskbarWindowItems.reduce((sum, item) => sum + item.windows.length, 0) +
				overflowWindows.length
		);

		useImperativeHandle(ref, () => ({
			closeFlyouts: () => {
				setOverflowMenuOpen(false);
				setGroupMenuOpen(null);
				setHoveredWin(null);
				setShowPreviewForWin(null);
				if (previewDelayRef.current) {
					clearTimeout(previewDelayRef.current);
					previewDelayRef.current = null;
				}
			},
			closeHoverFlyouts: () => {
				setHoveredWin(null);
				setShowPreviewForWin(null);
				if (previewDelayRef.current) {
					clearTimeout(previewDelayRef.current);
					previewDelayRef.current = null;
				}
			},
		}));

		useEffect(() => {
			return () => {
				if (previewDelayRef.current) clearTimeout(previewDelayRef.current);
			};
		}, []);

		useEffect(() => {
			if (!overflowMenuOpen) return;
			const close = () => setOverflowMenuOpen(false);
			window.addEventListener('click', close);
			return () => window.removeEventListener('click', close);
		}, [overflowMenuOpen]);

		useEffect(() => {
			if (!groupMenuOpen) return;
			const close = () => setGroupMenuOpen(null);
			window.addEventListener('click', close);
			return () => window.removeEventListener('click', close);
		}, [groupMenuOpen]);

		const getWindowBadgeCount = (desktopWindow: WindowState): number => {
			const sourceApp = resolveWindowSourceApp(apps, desktopWindow);
			if (sourceApp?.type !== 'app') {
				return 0;
			}
			return appBadgeCounts?.[sourceApp.id] ?? 0;
		};

		const isWindowFriendsBadge = (desktopWindow: WindowState): boolean => {
			const sourceApp = resolveWindowSourceApp(apps, desktopWindow);
			return (
				sourceApp?.type === 'app' && isFriendsAppBadge(sourceApp.appComponent)
			);
		};

		const isWindowGafChatBadge = (desktopWindow: WindowState): boolean => {
			const sourceApp = resolveWindowSourceApp(apps, desktopWindow);
			return (
				sourceApp?.type === 'app' && isGafChatAppBadge(sourceApp.appComponent)
			);
		};

		const renderWindowIcon = (
			desktopWindow: WindowState,
			variant: 'taskbar' | 'preview' | 'list' = 'taskbar',
			morphActive = false
		) => {
			const sourceApp = resolveWindowSourceApp(apps, desktopWindow);
			const resolvedAppComponent =
				sourceApp?.type === 'app'
					? (sourceApp.appComponent ?? desktopWindow.appComponent)
					: desktopWindow.appComponent;

			if (resolvedAppComponent) {
				const sizeClass =
					variant === 'preview'
						? 'h-6 w-6 shrink-0'
						: variant === 'list'
							? 'h-5 w-5 shrink-0'
							: taskbar.ICON_SIZE;
				const badge = (
					<DesktopAppBadge
						appComponent={resolvedAppComponent}
						icon={sourceApp?.icon ?? desktopWindow.icon}
						variant={variant}
						className={sizeClass}
						iconStyle={iconStyle}
					/>
				);
				if (variant === 'taskbar') {
					const iconShell = (
						<span className="inline-flex shrink-0 rounded-[0.62rem] ring-1 ring-[rgb(var(--desktop-fg-primary-rgb)/0.14)] ring-inset bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb))_8%,transparent)]">
							{badge}
						</span>
					);
					if (morphActive) {
						return (
							<DesktopWindowMorphChip
								windowId={desktopWindow.id}
								active
								className="inline-flex shrink-0"
							>
								{iconShell}
							</DesktopWindowMorphChip>
						);
					}
					return iconShell;
				}
				return badge;
			}

			const fallbackClass =
				variant === 'preview'
					? 'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-primary)'
					: variant === 'list'
						? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-primary)'
						: `flex ${taskbar.ICON_SIZE} items-center justify-center rounded-[0.58rem] border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-primary)`;

			const fallback = (
				<div className={fallbackClass}>{desktopWindow.icon}</div>
			);
			if (variant === 'taskbar' && morphActive) {
				return (
					<DesktopWindowMorphChip
						windowId={desktopWindow.id}
						active
						className="inline-flex shrink-0"
					>
						{fallback}
					</DesktopWindowMorphChip>
				);
			}
			return fallback;
		};

		return (
			<>
				<div
					className={cn(
						'flex min-w-0 flex-1 gap-1',
						denseWindowMode && 'justify-start overflow-x-auto scrollbar-none'
					)}
					data-taskbar-window-mode={denseWindowMode ? 'dense' : 'normal'}
				>
					{taskbarWindowItems.map((item) => {
						const w = item.windows[0];
						if (!w) return null;
						const taskbarTitle = getTaskbarWindowTitle(w);
						const isGroup = item.windows.length > 1;
						const isGroupOpen = groupMenuOpen === item.key;
						const groupHasActive = item.windows.some(
							(win) => win.id === activeWindowId
						);
						const windowBadge = getWindowBadgeCount(w);
						const friendsWindowBadge = isWindowFriendsBadge(w);
						const gafChatWindowBadge = isWindowGafChatBadge(w);
						const activeWindowChrome =
							'shadow-[inset_0_0_0_1.5px_rgb(var(--desktop-accent-rgb)/0.45)] ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.55)] ring-inset';
						const groupTitle =
							resolveWindowSourceApp(apps, w)?.name ??
							w.appComponent ??
							taskbarTitle;
						if (isGroup) {
							const groupSurface =
								isGroupOpen || groupHasActive
									? taskbarButtonActiveSurface
									: taskbarButtonSurface;
							return (
								<div
									key={item.key}
									className={cn(
										'relative min-w-0',
										denseWindowMode ? 'w-12 shrink-0' : 'flex-1'
									)}
								>
									<DesktopChromeTooltip
										content={groupTitle}
										placement="top"
										offsetExtra={4}
									>
										<m.button
											data-taskbar-interactive="true"
											type="button"
											onPointerEnter={() => {
												void preloadDesktopApp(w.appComponent);
											}}
											onFocus={() => {
												void preloadDesktopApp(w.appComponent);
											}}
											onClick={() =>
												setGroupMenuOpen((o) =>
													o === item.key ? null : item.key
												)
											}
											onContextMenu={(e) => {
												e.preventDefault();
												e.stopPropagation();
												if (item.windows.length > 0) {
													setWinContextMenu({
														windowId: item.windows[0]?.id,
														x: e.clientX,
														y: e.clientY,
													});
												}
											}}
											className={cn(
												`relative ${taskbar.WINDOW_BUTTON_MIN_H} min-w-0 ${taskbar.BUTTON_PADDING} rounded-md transition-[background-color,border-color,box-shadow,opacity,color] duration-200 motion-reduce:transition-none`,
												denseWindowMode ? 'w-12 shrink-0' : 'flex-1 basis-0',
												DESKTOP_INTERACTIVE.focusRing,
												groupSurface,
												groupHasActive ? activeWindowChrome : ''
											)}
											variants={buttonVariants}
											initial="initial"
											whileHover={finePointerHover ? 'hover' : undefined}
											whileTap="tap"
											aria-current={groupHasActive ? 'true' : undefined}
											aria-label={t('taskbar.groupWindows', {
												name: groupTitle,
												count: item.windows.length,
											})}
											aria-expanded={isGroupOpen}
											aria-haspopup="menu"
										>
											<div
												className={`flex min-w-0 items-center ${taskbar.GAP}`}
											>
												{renderWindowIcon(w, 'taskbar')}
												<span
													className={cn(
														DESKTOP_TYPOGRAPHY.taskbarWindowTitle,
														denseWindowMode
															? 'sr-only'
															: 'min-w-0 flex-1 truncate'
													)}
												>
													{groupTitle}
												</span>
												<span
													className={cn(
														DESKTOP_TYPOGRAPHY.taskbarGroupCount,
														'flex items-center justify-center min-h-3.5 min-w-3.5 rounded-full bg-(--desktop-surface-soft-active) px-0.5'
													)}
												>
													{item.windows.length}
												</span>
											</div>
											<TaskbarCountBadge
												count={windowBadge}
												variant={
													friendsWindowBadge
														? 'friends'
														: gafChatWindowBadge
															? 'chat'
															: 'default'
												}
											/>
										</m.button>
									</DesktopChromeTooltip>
									<AnimatePresence>
										{isGroupOpen && (
											<m.div
												data-taskbar-flyout
												initial={{ opacity: 0, y: 8 }}
												animate={{ opacity: 1, y: 0 }}
												exit={{ opacity: 0, y: 8 }}
												className={`absolute bottom-full mb-2 left-0 w-56 max-h-80 overflow-y-auto ${shellPanel} py-1`}
												style={{ zIndex: portalStackBase }}
											>
												{item.windows.map((win) => {
													const winTitle = getTaskbarWindowTitle(win);
													return (
														<DesktopChromeTooltip
															key={win.id}
															content={winTitle}
															placement="right"
															offsetExtra={4}
														>
															<button
																type="button"
																onPointerEnter={() => {
																	void preloadDesktopApp(win.appComponent);
																}}
																onFocus={() => {
																	void preloadDesktopApp(win.appComponent);
																}}
																onClick={() => {
																	onWinClick(win.id);
																	setGroupMenuOpen(null);
																	setWinContextMenu(null);
																}}
																className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-(--desktop-text-primary) fine-hover:bg-(--desktop-surface-soft-hover)"
															>
																{renderWindowIcon(win, 'list')}
																<span className="truncate flex-1">
																	{winTitle}
																</span>
															</button>
														</DesktopChromeTooltip>
													);
												})}
											</m.div>
										)}
									</AnimatePresence>
								</div>
							);
						}
						const winActive = w.id === activeWindowId;
						const winHover = hoveredWin === w.id;
						const winSurface =
							winActive || winHover
								? taskbarButtonActiveSurface
								: taskbarButtonSurface;
						return (
							<DesktopChromeTooltip
								key={w.id}
								content={taskbarTitle}
								placement="top"
								offsetExtra={4}
							>
								<m.button
									data-taskbar-interactive="true"
									type="button"
									onClick={() => {
										onWinClick(w.id);
										setWinContextMenu(null);
										setGroupMenuOpen(null);
									}}
									onContextMenu={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setWinContextMenu({
											windowId: w.id,
											x: e.clientX,
											y: e.clientY,
										});
									}}
									onPointerEnter={() => {
										void preloadDesktopApp(w.appComponent);
										setHoveredWin(w.id);
										if (previewDelayRef.current)
											clearTimeout(previewDelayRef.current);
										previewDelayRef.current = setTimeout(
											() => setShowPreviewForWin(w.id),
											DESKTOP_TOOLTIP.delayMs
										);
									}}
									onFocus={() => {
										void preloadDesktopApp(w.appComponent);
									}}
									onPointerLeave={() => {
										setHoveredWin(null);
										setShowPreviewForWin(null);
										if (previewDelayRef.current) {
											clearTimeout(previewDelayRef.current);
											previewDelayRef.current = null;
										}
									}}
									className={cn(
										`relative ${taskbar.WINDOW_BUTTON_MIN_H} min-w-0 ${taskbar.BUTTON_PADDING} rounded-md transition-[background-color,border-color,box-shadow,opacity,color] duration-200 motion-reduce:transition-none`,
										denseWindowMode ? 'w-12 shrink-0' : 'flex-1 basis-0',
										DESKTOP_INTERACTIVE.focusRing,
										w.isMinimized ? 'opacity-[0.78]' : '',
										winSurface,
										winActive ? activeWindowChrome : ''
									)}
									variants={buttonVariants}
									initial="initial"
									whileHover={finePointerHover ? 'hover' : undefined}
									whileTap="tap"
									aria-current={winActive ? 'true' : undefined}
									aria-label={
										w.isMinimized
											? t('taskbar.windowListMinimizedAria', {
													title: taskbarTitle,
												})
											: w.id === activeWindowId
												? t('taskbar.windowListActiveAria', {
														title: taskbarTitle,
													})
												: t('taskbar.windowListItemAria', {
														title: taskbarTitle,
													})
									}
								>
									<div className={`flex min-w-0 items-center ${taskbar.GAP}`}>
										{renderWindowIcon(
											w,
											'taskbar',
											w.isMinimized || Boolean(w.isMinimizing)
										)}
										<span
											className={cn(
												DESKTOP_TYPOGRAPHY.taskbarWindowTitle,
												denseWindowMode ? 'sr-only' : 'min-w-0 flex-1 truncate'
											)}
										>
											{taskbarTitle}
										</span>
									</div>
									<TaskbarCountBadge
										count={windowBadge}
										variant={
											friendsWindowBadge
												? 'friends'
												: gafChatWindowBadge
													? 'chat'
													: 'default'
										}
									/>

									<m.div
										className="absolute bottom-0.5 left-1/2 h-[2px] -translate-x-1/2 rounded-full bg-[rgb(var(--desktop-accent-rgb))]"
										aria-hidden={true}
										initial={{ width: 0 }}
										animate={{
											width: winActive
												? w.isMinimized
													? 8
													: 18
												: w.isMinimized
													? 5
													: 12,
											opacity: winActive ? 1 : 0.55,
										}}
										transition={{
											duration: 0.22,
											ease: [0.16, 1, 0.3, 1],
										}}
									/>

									<TaskbarWindowPreviewFlyout
										window={w}
										taskbarTitle={taskbarTitle}
										shellPanel={shellPanel}
										portalStackBase={portalStackBase}
										reduceMotion={reduceMotion === true}
										visible={showPreviewForWin === w.id && hoveredWin === w.id}
										renderWindowIcon={renderWindowIcon}
									/>
								</m.button>
							</DesktopChromeTooltip>
						);
					})}
				</div>

				{hasOverflow && (
					<div className="relative shrink-0">
						<DesktopChromeTooltip
							content={t('taskbar.moreWindows')}
							placement="top"
						>
							<m.button
								data-taskbar-interactive="true"
								onClick={() => setOverflowMenuOpen((o) => !o)}
								className={`${taskbar.HIT_MIN_CLASS} p-1 rounded-lg transition-[background-color,border-color,box-shadow,opacity,color] duration-200 motion-reduce:transition-none ${DESKTOP_INTERACTIVE.focusRing} ${overflowMenuOpen ? taskbarButtonActiveSurface : taskbarButtonSurface}`}
								aria-label={t('taskbar.moreWindowsAria')}
								aria-expanded={overflowMenuOpen}
								aria-haspopup="menu"
							>
								<ChevronUpIcon
									className={`${taskbar.ICON_CLASS} rotate-180`}
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							</m.button>
						</DesktopChromeTooltip>
						<AnimatePresence>
							{overflowMenuOpen && (
								<m.div
									data-taskbar-flyout
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: 8 }}
									className={`absolute bottom-full mb-2 left-0 w-56 max-h-80 overflow-y-auto ${shellPanel} py-1`}
									style={{ zIndex: portalStackBase }}
								>
									<div
										className={cn(
											DESKTOP_TYPOGRAPHY.meta,
											'px-3 py-2 border-b border-(--desktop-border-subtle)'
										)}
									>
										{t('taskbar.overflowHeading', {
											count: overflowWindows.length,
										})}
									</div>
									{overflowWindows.map((w) => {
										const overflowTitle = getTaskbarWindowTitle(w);
										return (
											<DesktopChromeTooltip
												key={w.id}
												content={overflowTitle}
												placement="right"
												offsetExtra={4}
											>
												<button
													type="button"
													onPointerEnter={() => {
														void preloadDesktopApp(w.appComponent);
													}}
													onFocus={() => {
														void preloadDesktopApp(w.appComponent);
													}}
													onClick={() => {
														onWinClick(w.id);
														setOverflowMenuOpen(false);
													}}
													className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-(--desktop-text-primary) fine-hover:bg-(--desktop-surface-soft-hover)"
												>
													{renderWindowIcon(w, 'list')}
													<span className="truncate">{overflowTitle}</span>
												</button>
											</DesktopChromeTooltip>
										);
									})}
								</m.div>
							)}
						</AnimatePresence>
					</div>
				)}
			</>
		);
	})
);
TaskbarWindowsOverflowStrip.displayName = 'TaskbarWindowsOverflowStrip';

const TaskbarPinnedAndWindowsStripInner = forwardRef<
	TaskbarPinnedAndWindowsStripHandle,
	TaskbarPinnedAndWindowsStripProps
>(function TaskbarPinnedAndWindowsStripInner(
	{
		taskbarDividerClass,
		taskbarButtonSurface,
		taskbarButtonActiveSurface,
		pinnedMenuButtonSurface,
		pinnedMenuButtonActiveSurface,
		buttonVariants,
		shellPanel,
		shellWindowStyle = 'glass',
		apps,
		windows,
		iconStyle,
		appBadgeCounts,
		activeWindowId = null,
		onWinClick,
		onOpenApp,
		desktopAppIds = [],
		onPinAppToDesktop,
		onUnpinAppFromDesktop,
		setWinContextMenu,
		pinnedApps,
		pinnedAppsBadgeTotal,
		pinnedFriendsBadgeActive,
		pinnedGafChatBadgeActive,
		taskbarWindowItems,
		overflowWindows,
		hasOverflow,
		preferReducedMotion = false,
	},
	ref
) {
	const { taskbar } = themeDesignTokens.desktop;
	const pinnedRef = useRef<TaskbarPinnedMenuIslandHandle>(null);
	const windowsRef = useRef<TaskbarWindowsOverflowStripHandle>(null);

	useImperativeHandle(ref, () => ({
		closeFlyouts: () => {
			windowsRef.current?.closeFlyouts();
			pinnedRef.current?.closePinnedMenu();
		},
		closeHoverFlyouts: () => {
			windowsRef.current?.closeHoverFlyouts();
		},
	}));

	return (
		<div
			data-desktop-welcome-guide="windows"
			className={`flex-1 min-h-0 min-w-0 max-w-full overflow-hidden flex items-stretch ${taskbar.GAP}`}
		>
			<div
				className={`flex h-full min-h-full min-w-0 w-full flex-nowrap items-center ${taskbar.GAP}`}
			>
				<TaskbarPinnedMenuIsland
					ref={pinnedRef}
					taskbarDividerClass={taskbarDividerClass}
					pinnedMenuButtonSurface={pinnedMenuButtonSurface}
					pinnedMenuButtonActiveSurface={pinnedMenuButtonActiveSurface}
					buttonVariants={buttonVariants}
					shellWindowStyle={shellWindowStyle}
					pinnedApps={pinnedApps}
					pinnedAppsBadgeTotal={pinnedAppsBadgeTotal}
					pinnedFriendsBadgeActive={pinnedFriendsBadgeActive}
					pinnedGafChatBadgeActive={pinnedGafChatBadgeActive}
					windows={windows}
					iconStyle={iconStyle}
					appBadgeCounts={appBadgeCounts}
					onWinClick={onWinClick}
					onOpenApp={onOpenApp}
					desktopAppIds={desktopAppIds}
					onPinAppToDesktop={onPinAppToDesktop}
					onUnpinAppFromDesktop={onUnpinAppFromDesktop}
					preferReducedMotion={preferReducedMotion}
				/>
				<TaskbarWindowsOverflowStrip
					ref={windowsRef}
					taskbarButtonSurface={taskbarButtonSurface}
					taskbarButtonActiveSurface={taskbarButtonActiveSurface}
					buttonVariants={buttonVariants}
					shellPanel={shellPanel}
					apps={apps}
					iconStyle={iconStyle}
					appBadgeCounts={appBadgeCounts}
					activeWindowId={activeWindowId}
					onWinClick={onWinClick}
					setWinContextMenu={setWinContextMenu}
					taskbarWindowItems={taskbarWindowItems}
					overflowWindows={overflowWindows}
					hasOverflow={hasOverflow}
				/>
			</div>
		</div>
	);
});

TaskbarPinnedAndWindowsStripInner.displayName = 'TaskbarPinnedAndWindowsStrip';

export const TaskbarPinnedAndWindowsStrip = memo(
	TaskbarPinnedAndWindowsStripInner
);
