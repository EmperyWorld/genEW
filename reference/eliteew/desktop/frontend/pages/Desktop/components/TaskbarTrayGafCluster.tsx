/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * GAF-лаунчер, кнопка реальных фоновых процессов и всплывающая панель;
 * поллинги/сокеты изолированы от Taskbar.
 *
 * Invariants:
 * - Кнопка трея помечена `data-tray-toggle`; outside-click учитывает Quest open guard.
 * - Статические ярлыки не считаются фоновыми процессами.
 * - Tray panel Escape uses `useShellCaptureEscape` so taskbar shell Escape defers.
 * - Panel is body-portaled and anchored to the toggle; chip badge is alert-only (unread).
 *
 * Related:
 * - components/TaskbarTrayPanel.tsx
 * - hooks/useShellCaptureKeyboard.ts
 * - utils/desktopShellOutsideDismiss.ts
 * - utils/desktopTraySurfacePolicy.ts
 */

import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { themeDesignTokens } from '@/theme/designTokens';
import { cn } from '@/utils/cn';
import { AnimatePresence, m } from 'framer-motion';
import {
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import {
	ChatBubbleLeftRightIcon,
	CpuChipIcon,
	ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import type { DesktopIconStyle } from '@/types/profile';
import { DESKTOP_LUCIDE, DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { useFinePointerHover } from '../hooks/useFinePointerHover';
import { useDesktopPopoverOpenGuard } from '../hooks/useDesktopPopoverOpenGuard';
import { useShellCaptureEscape } from '../hooks/useShellCaptureKeyboard';
import { useDesktopTrayItems } from '../hooks/useDesktopTrayItems';
import type { DesktopItem } from '../types/desktop.types';
import { findDesktopAppItemByComponent } from '../utils/desktopAppRegistry';
import {
	DESKTOP_TRAY_TOGGLE_SELECTOR,
	shouldCloseTrayOnOutsidePointer,
} from '../utils/desktopShellOutsideDismiss';
import {
	DESKTOP_TRAY_PANEL_ID,
	resolveTraySurfaceBadge,
} from '../utils/desktopTraySurfacePolicy';
import { getFloatingMenuPosition } from '../utils/desktopUi';
import { DesktopAppMenuDivider, DesktopAppMenuItem } from './DesktopAppChrome';
import { DesktopShellFloatingPortal } from './DesktopShellFloatingPortal';
import { TaskbarCountBadge } from './TaskbarCountBadge';
import {
	TaskbarIconContextMenu,
	type TaskbarIconContextMenuPoint,
} from './TaskbarIconContextMenu';
import { TaskbarTrayPanel } from './TaskbarTrayPanel';

export type TaskbarTrayGafClusterProps = {
	showTray: boolean;
	onToggleTray: () => void;
	onCloseTray: () => void;
	apps: DesktopItem[];
	onOpenApp: (app: DesktopItem) => void;
	minimizedPersistentSurfaceApps?: ReadonlySet<string>;
	hasCurrentUser: boolean;
	shellPanelStrong: string;
	iconStyle: DesktopIconStyle;
	taskbarButtonSurface: string;
	taskbarButtonActiveSurface: string;
	reduceMotion: boolean | null;
};

export const TaskbarTrayGafCluster = memo(function TaskbarTrayGafCluster({
	showTray,
	onToggleTray,
	onCloseTray,
	apps,
	onOpenApp,
	minimizedPersistentSurfaceApps,
	hasCurrentUser,
	shellPanelStrong,
	iconStyle,
	taskbarButtonSurface,
	taskbarButtonActiveSurface,
	reduceMotion,
}: TaskbarTrayGafClusterProps) {
	const { t } = useTranslation('desktopUi');
	const { taskbar } = themeDesignTokens.desktop;
	const finePointerHover = useFinePointerHover();
	const trayRef = useRef<HTMLDivElement | null>(null);
	const trayPanelFocusRef = useRef<HTMLDivElement | null>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const trayOpenClickGuardRef = useDesktopPopoverOpenGuard(showTray);
	const [iconContextMenu, setIconContextMenu] = useState<{
		kind: 'gaf' | 'tray';
		point: TaskbarIconContextMenuPoint;
	} | null>(null);
	const [panelLayout, setPanelLayout] = useState<{
		x: number;
		y: number;
		width: number;
	} | null>(null);
	const {
		items: trayItems,
		socketConnected,
		gafUnread,
		gafUnreadFetching,
		musicPlaybackErrorActive,
		musicPlaybackErrorMessage,
		friendsIncomingCount,
		ugsActiveTaskCount,
		ugsTrayPollError,
		ugsTrayPollSuccess,
	} = useDesktopTrayItems({
		minimizedPersistent: minimizedPersistentSurfaceApps,
	});

	const hasTrayItems = trayItems.length > 0;
	const gafTrayRow = trayItems.find(
		(row) => row.id === 'gaf-chat' || row.id === 'bg-GAFChatApp'
	);
	const friendsTrayRow = trayItems.find((row) => row.variant === 'friends');
	const ugsTrayRow = trayItems.find((row) => row.variant === 'ugs');
	const traySurfaceBadge = resolveTraySurfaceBadge({ gafUnread });
	const musicTrayRow = trayItems.find((row) => row.variant === 'music');

	const closeIconContextMenu = useCallback(() => {
		setIconContextMenu(null);
	}, []);

	const openTrayApp = useCallback(
		(appComponent: string) => {
			const item = findDesktopAppItemByComponent(apps, appComponent);
			if (item) {
				onOpenApp(item);
				return;
			}
			try {
				window.dispatchEvent(
					new CustomEvent('desktop-open-app', {
						detail: { appComponent },
					})
				);
			} catch {
				// ignore
			}
		},
		[apps, onOpenApp]
	);

	const handleTrayPanelActivate = useCallback(
		(appComponent: string) => {
			openTrayApp(appComponent);
			onCloseTray();
		},
		[openTrayApp, onCloseTray]
	);

	const handleContextOpenApp = useCallback(
		(appComponent: string) => {
			openTrayApp(appComponent);
			closeIconContextMenu();
			onCloseTray();
		},
		[closeIconContextMenu, onCloseTray, openTrayApp]
	);

	useLayoutEffect(() => {
		if (!showTray) {
			setPanelLayout(null);
			return;
		}
		const updateLayout = () => {
			const toggle = trayRef.current?.querySelector<HTMLElement>(
				DESKTOP_TRAY_TOGGLE_SELECTOR
			);
			if (!toggle) return;
			const rect = toggle.getBoundingClientRect();
			const width = Math.min(420, window.innerWidth - 32);
			const height = Math.min(320, Math.max(180, window.innerHeight * 0.42));
			const preferredX = rect.left + rect.width / 2 - width / 2;
			const pos = getFloatingMenuPosition(
				{ x: preferredX, y: rect.top },
				{
					menuWidth: width,
					menuHeight: height,
					preferAbove: true,
					anchorGap: 12,
				}
			);
			setPanelLayout({ x: pos.x, y: pos.y, width });
		};
		updateLayout();
		window.addEventListener('resize', updateLayout);
		return () => window.removeEventListener('resize', updateLayout);
	}, [showTray]);

	useEffect(() => {
		if (!showTray) return;

		const onPointerDown = (e: MouseEvent | PointerEvent) => {
			if (
				!shouldCloseTrayOnOutsidePointer({
					openClickGuardActive: trayOpenClickGuardRef.current,
					target: e.target as Element,
					trayToggleRoot: trayRef.current,
				})
			) {
				return;
			}
			onCloseTray();
		};

		window.addEventListener('mousedown', onPointerDown, { capture: true });
		window.addEventListener('pointerdown', onPointerDown, { capture: true });
		return () => {
			window.removeEventListener('mousedown', onPointerDown, {
				capture: true,
			});
			window.removeEventListener('pointerdown', onPointerDown, {
				capture: true,
			});
		};
	}, [onCloseTray, showTray, trayOpenClickGuardRef]);

	useEffect(() => {
		if (showTray) {
			const active = document.activeElement;
			restoreFocusRef.current = active instanceof HTMLElement ? active : null;
			const focusTimer = window.setTimeout(() => {
				const root = trayPanelFocusRef.current;
				const first = root?.querySelector<HTMLElement>(
					'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
				);
				first?.focus();
			}, 0);
			return () => window.clearTimeout(focusTimer);
		}
		const restore = restoreFocusRef.current;
		restoreFocusRef.current = null;
		if (restore && typeof restore.focus === 'function') {
			restore.focus();
		}
		return undefined;
	}, [showTray]);

	useShellCaptureEscape(showTray, onCloseTray);

	return (
		<>
			{/* GAF Chat: quick launcher (logged-in desktop only) */}
			{hasCurrentUser ? (
				<DesktopChromeTooltip
					content={
						<span className="flex max-w-[260px] flex-col gap-1 text-left text-xs">
							<span className="font-semibold text-(--desktop-text-primary)">
								{t('taskbar.gafHeadline')}
							</span>
							<span className="text-(--desktop-text-secondary) leading-snug">
								{t('taskbar.gafRealtime')}{' '}
								<span
									className={
										socketConnected
											? DESKTOP_TYPOGRAPHY.shellAccentStatusMedium
											: DESKTOP_TYPOGRAPHY.shellMutedStatusMedium
									}
								>
									{socketConnected
										? t('taskbar.gafOnline')
										: t('taskbar.gafOffline')}
								</span>
							</span>
							{gafUnread > 0 ? (
								<span className="text-rose-300">
									{t('taskbar.gafUnread')} {gafUnread > 99 ? '99+' : gafUnread}
								</span>
							) : (
								<span className="text-(--desktop-text-muted)">
									{t('taskbar.gafNoNew')}
								</span>
							)}
							<span className="text-(--desktop-text-muted) border-t border-(--desktop-border-subtle) pt-1">
								{t('taskbar.gafOpenHint')}
							</span>
						</span>
					}
					placement="top"
					offsetExtra={12}
				>
					<m.button
						data-taskbar-interactive="true"
						type="button"
						onClick={() => openTrayApp('GAFChatApp')}
						onContextMenu={(event) => {
							event.preventDefault();
							event.stopPropagation();
							setIconContextMenu({
								kind: 'gaf',
								point: { x: event.clientX, y: event.clientY },
							});
						}}
						className={cn(
							'relative rounded-lg p-1.5',
							taskbar.HIT_MIN_CLASS,
							taskbar.ICON_FOCUS,
							taskbarButtonSurface
						)}
						aria-label={[
							t('taskbar.gafHeadline'),
							socketConnected
								? t('taskbar.gafOnline')
								: t('taskbar.gafOffline'),
							gafUnread > 0
								? `${t('taskbar.gafUnread')} ${gafUnread > 99 ? '99+' : gafUnread}`
								: '',
						]
							.filter(Boolean)
							.join('. ')}
						whileHover={
							finePointerHover && !reduceMotion ? { scale: 1.02 } : undefined
						}
					>
						{socketConnected ? (
							<span
								className="pointer-events-none absolute inset-0 rounded-lg"
								style={{
									backgroundColor: 'rgba(34,197,94,0.22)',
								}}
								aria-hidden
							/>
						) : null}
						{gafUnread > 0 || gafUnreadFetching ? (
							<span
								className="pointer-events-none absolute -inset-px rounded-lg bg-rose-500/22 shadow-[0_0_8px_rgba(244,63,94,0.22)]"
								aria-hidden
							/>
						) : null}
						<ChatBubbleLeftRightIcon
							className={cn(
								'relative z-1',
								taskbar.ICON_CLASS,
								socketConnected && 'text-green-400/95'
							)}
							strokeWidth={DESKTOP_LUCIDE.stroke}
						/>
						<span
							className={cn(
								'pointer-events-none absolute right-0.5 bottom-0.5 z-1 size-1.5 rounded-full border border-(--desktop-surface-app)',
								socketConnected
									? 'bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.42)]'
									: 'bg-(--desktop-text-muted)'
							)}
							aria-hidden
						/>
						<TaskbarCountBadge
							count={gafUnread}
							variant="chat"
							positionClassName="-top-1 -right-1"
							fetchPulse={gafUnreadFetching}
						/>
					</m.button>
				</DesktopChromeTooltip>
			) : null}

			{/* System tray: background apps (chat, music, etc.) */}
			<div ref={trayRef} className="relative">
				<DesktopChromeTooltip
					content={
						hasTrayItems ? (
							<span className="flex max-w-[240px] flex-col gap-0.5 text-left text-xs">
								<span className="font-medium text-(--desktop-text-primary)">
									{t('taskbar.trayHeadline')}
								</span>
								{gafTrayRow ? (
									<span className="text-(--desktop-text-secondary)">
										{t('taskbar.trayGafLine')}{' '}
										<span
											className={
												gafTrayRow.socketConnected
													? DESKTOP_TYPOGRAPHY.shellAccentStatusMedium
													: DESKTOP_TYPOGRAPHY.shellMutedStatusMedium
											}
										>
											{gafTrayRow.socketConnected
												? t('taskbar.gafOnline')
												: t('taskbar.gafOffline')}
										</span>
										{gafUnread > 0
											? ` · ${t('taskbar.gafUnread')} ${gafUnread > 99 ? '99+' : gafUnread}`
											: ''}
									</span>
								) : null}
								{friendsTrayRow && friendsIncomingCount > 0 ? (
									<span className="text-(--desktop-text-secondary)">
										{t('taskbar.trayFriendsIncoming', {
											count:
												friendsIncomingCount > 99
													? '99+'
													: friendsIncomingCount,
										})}
									</span>
								) : null}
								{ugsTrayRow ? (
									<span className="text-(--desktop-text-secondary)">
										{t('taskbar.trayUgsHubLine')}{' '}
										{ugsTrayPollError ? (
											<span className="font-medium text-rose-300/95">
												{t('taskbar.trayUgsPollError')}
											</span>
										) : ugsActiveTaskCount > 0 ? (
											<span className="font-medium text-cyan-200/95">
												{ugsActiveTaskCount > 99 ? '99+' : ugsActiveTaskCount}{' '}
												{t('taskbar.trayUgsActiveShort')}
											</span>
										) : (
											<span className="font-medium text-(--desktop-text-muted)">
												{t('taskbar.trayUgsCollapsedShort')}
											</span>
										)}
									</span>
								) : null}
								{musicPlaybackErrorMessage ? (
									<span className="flex items-start gap-1.5 border-t border-(--desktop-border-subtle) pt-1 text-rose-300/95 leading-snug">
										<ExclamationCircleIcon
											className="mt-0.5 h-3.5 w-3.5 shrink-0"
											strokeWidth={DESKTOP_LUCIDE.stroke}
											aria-hidden
										/>
										<span>
											{t('taskbar.trayMusicErrorPrefix')}{' '}
											{musicPlaybackErrorMessage}
										</span>
									</span>
								) : null}
								<span className="text-(--desktop-text-muted)">
									{t('taskbar.trayProcesses', {
										count: trayItems.length,
									})}
								</span>
							</span>
						) : (
							t('taskbar.trayEmpty')
						)
					}
					placement="top"
					offsetExtra={12}
				>
					<m.button
						data-taskbar-interactive="true"
						data-tray-toggle="true"
						type="button"
						onClick={onToggleTray}
						onContextMenu={(event) => {
							event.preventDefault();
							event.stopPropagation();
							setIconContextMenu({
								kind: 'tray',
								point: { x: event.clientX, y: event.clientY },
							});
						}}
						className={`relative ${taskbar.HIT_MIN_CLASS} p-1.5 rounded-lg ${taskbar.ICON_FOCUS} ${showTray ? taskbarButtonActiveSurface : taskbarButtonSurface} ${
							!hasTrayItems ? 'opacity-80' : ''
						}`}
						aria-label={
							hasTrayItems
								? [
										t('taskbar.trayHeadline'),
										t('taskbar.trayProcesses', {
											count: trayItems.length,
										}),
										gafUnread > 0
											? t('taskbar.gafUnread') +
												' ' +
												(gafUnread > 99 ? '99+' : gafUnread)
											: '',
										ugsTrayRow
											? ugsTrayPollError
												? t('taskbar.trayUgsError')
												: ugsActiveTaskCount > 0
													? `${t('taskbar.trayUgsHubLine')} ${ugsActiveTaskCount > 99 ? '99+' : ugsActiveTaskCount}`
													: t('taskbar.trayUgsCollapsedShort')
											: '',
										musicPlaybackErrorMessage ?? '',
									]
										.filter(Boolean)
										.join('. ')
								: musicPlaybackErrorMessage
									? `${t('taskbar.trayHeadline')}. ${musicPlaybackErrorMessage}`
									: t('taskbar.trayAriaEmpty')
						}
						aria-expanded={showTray}
						aria-controls={DESKTOP_TRAY_PANEL_ID}
						aria-haspopup="dialog"
						whileHover={
							finePointerHover && !reduceMotion ? { scale: 1.02 } : undefined
						}
					>
						<CpuChipIcon
							className={taskbar.ICON_CLASS}
							strokeWidth={DESKTOP_LUCIDE.stroke}
						/>
						{musicPlaybackErrorActive || ugsTrayPollError ? (
							<span
								className="pointer-events-none absolute bottom-1 left-1 z-1 h-2 w-2 rounded-full border border-(--desktop-surface-app) bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.45)]"
								aria-hidden
							/>
						) : null}
						{traySurfaceBadge.kind === 'unread' ? (
							<TaskbarCountBadge
								count={traySurfaceBadge.count}
								variant="chat"
								positionClassName="-top-0.5 -right-0.5"
								fetchPulse={gafUnreadFetching}
							/>
						) : null}
					</m.button>
				</DesktopChromeTooltip>
			</div>

			<DesktopShellFloatingPortal>
				<AnimatePresence>
					{showTray && panelLayout ? (
						<TaskbarTrayPanel
							panelClassName={shellPanelStrong}
							panelId={DESKTOP_TRAY_PANEL_ID}
							panelPosition={{ x: panelLayout.x, y: panelLayout.y }}
							panelWidthPx={panelLayout.width}
							trayItems={trayItems}
							gafUnread={gafUnread}
							ugsActiveTaskCount={ugsActiveTaskCount}
							ugsTrayPollError={ugsTrayPollError}
							ugsTrayPollSuccess={ugsTrayPollSuccess}
							musicPlaybackErrorMessage={musicPlaybackErrorMessage}
							iconStyle={iconStyle}
							onActivateApp={handleTrayPanelActivate}
							listFocusRef={trayPanelFocusRef}
						/>
					) : null}
				</AnimatePresence>
			</DesktopShellFloatingPortal>
			<TaskbarIconContextMenu
				point={iconContextMenu?.point ?? null}
				onClose={closeIconContextMenu}
				menuWidth={236}
				menuHeight={iconContextMenu?.kind === 'tray' ? 188 : 94}
				className="min-w-[236px]"
			>
				{iconContextMenu?.kind === 'gaf' ? (
					<>
						<DesktopAppMenuItem
							type="button"
							role="menuitem"
							onClick={() => handleContextOpenApp('GAFChatApp')}
						>
							{t('taskbar.trayContextOpenGaf')}
						</DesktopAppMenuItem>
						<DesktopAppMenuItem
							type="button"
							role="menuitem"
							onClick={() => {
								if (!showTray) {
									onToggleTray();
								}
								closeIconContextMenu();
							}}
						>
							{t('taskbar.trayContextOpenBackgroundProcesses')}
						</DesktopAppMenuItem>
					</>
				) : (
					<>
						<DesktopAppMenuItem
							type="button"
							role="menuitem"
							onClick={() => {
								onToggleTray();
								closeIconContextMenu();
							}}
						>
							{showTray
								? t('taskbar.trayContextCloseBackgroundProcesses')
								: t('taskbar.trayContextOpenBackgroundProcesses')}
						</DesktopAppMenuItem>
						<DesktopAppMenuDivider />
						<DesktopAppMenuItem
							type="button"
							role="menuitem"
							disabled={!hasCurrentUser}
							onClick={() => handleContextOpenApp('GAFChatApp')}
						>
							{t('taskbar.trayContextOpenGaf')}
						</DesktopAppMenuItem>
						<DesktopAppMenuItem
							type="button"
							role="menuitem"
							disabled={!ugsTrayRow}
							onClick={() => handleContextOpenApp('UGSHubApp')}
						>
							{t('taskbar.trayContextOpenUgs')}
						</DesktopAppMenuItem>
						<DesktopAppMenuItem
							type="button"
							role="menuitem"
							disabled={!musicTrayRow}
							onClick={() => handleContextOpenApp('MusicPlayer')}
						>
							{t('taskbar.trayContextOpenMusic')}
						</DesktopAppMenuItem>
						<DesktopAppMenuItem
							type="button"
							role="menuitem"
							disabled={!friendsTrayRow}
							onClick={() => handleContextOpenApp('SocialHubApp')}
						>
							{t('taskbar.trayContextOpenFriends')}
						</DesktopAppMenuItem>
					</>
				)}
			</TaskbarIconContextMenu>
		</>
	);
});
