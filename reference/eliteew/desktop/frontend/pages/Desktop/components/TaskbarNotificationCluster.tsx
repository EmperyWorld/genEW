/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Колокольчик + центр уведомлений: подписка на store изолирована от Taskbar.
 *
 * Invariants:
 * - Кнопка колокольчика помечена `data-notification-toggle` для Quest outside-click guard.
 *
 * Related:
 * - components/NotificationCenter.tsx
 */

import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { useNotifications } from '@/notifications';
import { themeDesignTokens } from '@/theme/designTokens';
import { cn } from '@/utils/cn';
import { m } from 'framer-motion';
import { memo, useState } from 'react';
import { BellIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import type { DesktopWindowStyle } from '@/types/profile';
import { DESKTOP_LUCIDE, DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { useFinePointerHover } from '../hooks/useFinePointerHover';
import { DesktopAppMenuDivider, DesktopAppMenuItem } from './DesktopAppChrome';
import { NotificationCenter } from './NotificationCenter';
import {
	TaskbarIconContextMenu,
	type TaskbarIconContextMenuPoint,
} from './TaskbarIconContextMenu';

export type TaskbarNotificationClusterProps = {
	showNotifications: boolean;
	onBellClick: () => void;
	onClosePanel: () => void;
	shellWindowStyle: DesktopWindowStyle;
	taskbarButtonSurface: string;
	taskbarButtonActiveSurface: string;
	reduceMotion: boolean | null;
};

export const TaskbarNotificationCluster = memo(
	function TaskbarNotificationCluster({
		showNotifications,
		onBellClick,
		onClosePanel,
		shellWindowStyle,
		taskbarButtonSurface,
		taskbarButtonActiveSurface,
		reduceMotion,
	}: TaskbarNotificationClusterProps) {
		const { t } = useTranslation('desktopUi');
		const { taskbar } = themeDesignTokens.desktop;
		const finePointerHover = useFinePointerHover();
		const [contextMenu, setContextMenu] =
			useState<TaskbarIconContextMenuPoint | null>(null);
		const {
			notifications,
			markAsRead,
			markAllAsRead,
			markAsReadByType,
			dismiss,
			clearAll,
			unreadCount,
		} = useNotifications();
		const closeContextMenu = () => setContextMenu(null);
		const openNotifications = () => {
			if (!showNotifications) {
				onBellClick();
			}
			closeContextMenu();
		};

		return (
			<>
				<DesktopChromeTooltip
					content={
						unreadCount > 0
							? t('taskbar.notificationsUnread', { count: unreadCount })
							: t('taskbar.notifications')
					}
					placement="top"
					offsetExtra={12}
				>
					<m.button
						data-taskbar-interactive="true"
						data-notification-toggle="true"
						type="button"
						onClick={onBellClick}
						onContextMenu={(event) => {
							event.preventDefault();
							event.stopPropagation();
							setContextMenu({ x: event.clientX, y: event.clientY });
						}}
						className={`relative ${taskbar.HIT_MIN_CLASS} p-1.5 rounded-lg ${taskbar.ICON_FOCUS} ${showNotifications ? taskbarButtonActiveSurface : taskbarButtonSurface}`}
						aria-label={
							unreadCount > 0
								? t('taskbar.notificationsAria', { count: unreadCount })
								: t('taskbar.notificationsAriaZero')
						}
						aria-expanded={showNotifications}
						whileHover={
							finePointerHover && !reduceMotion ? { scale: 1.02 } : undefined
						}
					>
						<BellIcon
							className={taskbar.ICON_CLASS}
							strokeWidth={DESKTOP_LUCIDE.stroke}
						/>
						{unreadCount > 0 && (
							<m.span
								className={cn(
									DESKTOP_TYPOGRAPHY.badgeCompact,
									'absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 flex items-center justify-center bg-red-500 font-bold rounded-full px-0.5'
								)}
								initial={reduceMotion ? undefined : { scale: 0 }}
								animate={{ scale: 1 }}
								transition={
									reduceMotion
										? { duration: 0 }
										: { type: 'spring', stiffness: 500, damping: 25 }
								}
							>
								{unreadCount > 99 ? '99+' : unreadCount}
							</m.span>
						)}
					</m.button>
				</DesktopChromeTooltip>

				<NotificationCenter
					isOpen={showNotifications}
					onClose={onClosePanel}
					notifications={notifications}
					onMarkAsRead={markAsRead}
					onMarkAllAsRead={markAllAsRead}
					onMarkGroupAsRead={markAsReadByType}
					onDismiss={dismiss}
					onClearAll={clearAll}
					shellWindowStyle={shellWindowStyle}
				/>
				<TaskbarIconContextMenu
					point={contextMenu}
					onClose={closeContextMenu}
					menuWidth={228}
					menuHeight={134}
					className="min-w-[228px]"
				>
					<DesktopAppMenuItem
						type="button"
						role="menuitem"
						onClick={openNotifications}
					>
						{t('taskbar.trayContextOpenNotifications')}
					</DesktopAppMenuItem>
					<DesktopAppMenuItem
						type="button"
						role="menuitem"
						disabled={unreadCount === 0}
						onClick={() => {
							markAllAsRead();
							closeContextMenu();
						}}
					>
						{t('taskbar.trayContextMarkNotificationsRead')}
					</DesktopAppMenuItem>
					<DesktopAppMenuDivider />
					<DesktopAppMenuItem
						type="button"
						role="menuitem"
						tone="danger"
						disabled={notifications.length === 0}
						onClick={() => {
							if (window.confirm(t('notifications.clearAllConfirmTitle'))) {
								clearAll();
							}
							closeContextMenu();
						}}
					>
						{t('taskbar.trayContextClearNotifications')}
					</DesktopAppMenuItem>
				</TaskbarIconContextMenu>
			</>
		);
	}
);
