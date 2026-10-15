/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Taskbar notification center flyout: list hub + actions; closes on outside click with Quest open guard.
 *
 * Invariants:
 * - Outside `mousedown` respects `useDesktopPopoverOpenGuard` and ignores the bell toggle.
 *
 * Related:
 * - components/TaskbarNotificationCluster.tsx
 * - utils/desktopShellOutsideDismiss.ts
 * - DesktopChromeTooltip.tsx
 */

import type { Notification, NotificationType } from '@/notifications';
import { cn } from '@/utils/cn';
import { AnimatePresence, m } from 'framer-motion';
import * as React from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
	DESKTOP_LUCIDE,
	DESKTOP_SHELL_FLYOUT,
	DESKTOP_TYPOGRAPHY,
	DESKTOP_Z_INDEX,
} from '../constants';
import { useDesktopPopoverOpenGuard } from '../hooks/useDesktopPopoverOpenGuard';
import type { DesktopWindowStyle } from '@/types/profile';
import { shouldCloseNotificationCenterOnOutsidePointer } from '../utils/desktopShellOutsideDismiss';
import { getDesktopShellPanelClassName } from '../utils/desktopVisualSystem';
import { DesktopAppButton, DesktopAppStatusBadge } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { NotificationHubBody } from './NotificationHubBody';
import {
	NH_CENTER_HEADER_WRAP_CLASS,
	NH_CENTER_OPEN_FULL_BUTTON_CLASS,
	NH_UNREAD_COUNT_BADGE_CLASS,
} from './notificationHub/notificationHubLayoutTokens';
import {
	ArrowTopRightOnSquareIcon,
	BellIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';

export type { Notification };

interface NotificationCenterProps {
	isOpen: boolean;
	onClose: () => void;
	notifications: Notification[];
	onMarkAsRead: (id: string) => void;
	onMarkAllAsRead: () => void;
	onMarkGroupAsRead?: (type: NotificationType) => void;
	onDismiss: (id: string) => void;
	onClearAll: () => void;
	shellWindowStyle?: DesktopWindowStyle;
}

const dispatchOpenNotificationsApp = () => {
	window.dispatchEvent(
		new CustomEvent('desktop-open-app', {
			detail: { appComponent: 'NotificationsApp' },
		})
	);
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
	isOpen,
	onClose,
	notifications,
	onMarkAsRead,
	onMarkAllAsRead,
	onMarkGroupAsRead,
	onDismiss,
	onClearAll,
	shellWindowStyle = 'glass',
}) => {
	const { t } = useTranslation('desktopUi', { keyPrefix: 'notificationHub' });
	const unreadCount = notifications.filter((n) => !n.read).length;
	const panelRef = useRef<HTMLDivElement>(null);
	const openClickGuardRef = useDesktopPopoverOpenGuard(isOpen);

	useEffect(() => {
		const handlePointerDown = (e: MouseEvent) => {
			if (
				!shouldCloseNotificationCenterOnOutsidePointer({
					openClickGuardActive: openClickGuardRef.current,
					target: e.target as Element,
					panelRoot: panelRef.current,
				})
			) {
				return;
			}
			onClose();
		};
		if (isOpen) {
			document.addEventListener('mousedown', handlePointerDown);
		}
		return () => document.removeEventListener('mousedown', handlePointerDown);
	}, [isOpen, onClose, openClickGuardRef]);

	useEffect(() => {
		if (!isOpen) return;
		const root = panelRef.current;
		if (!root) return;
		const selector =
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
		const focusables = Array.from(
			root.querySelectorAll<HTMLElement>(selector)
		).filter((el) => !el.hasAttribute('disabled'));
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		window.requestAnimationFrame(() => first?.focus());

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Tab' || focusables.length === 0) return;
			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last?.focus();
				}
			} else if (document.activeElement === last) {
				e.preventDefault();
				first?.focus();
			}
		};
		root.addEventListener('keydown', onKeyDown);
		return () => root.removeEventListener('keydown', onKeyDown);
	}, [isOpen]);

	return (
		<AnimatePresence>
			{isOpen && (
				<m.div
					ref={panelRef}
					id="notification-center-panel"
					role="dialog"
					aria-modal="true"
					aria-labelledby="notification-center-heading"
					initial={{ opacity: 0, x: 16, scale: 0.98 }}
					animate={{ opacity: 1, x: 0, scale: 1 }}
					exit={{ opacity: 0, x: 16, scale: 0.98 }}
					transition={{ type: 'spring', damping: 28, stiffness: 320 }}
					className={cn(
						'fixed flex min-h-0 flex-col overflow-hidden',
						DESKTOP_SHELL_FLYOUT.RIGHT_INSET_CLASS,
						DESKTOP_SHELL_FLYOUT.BOTTOM_OFFSET_CLASS,
						DESKTOP_SHELL_FLYOUT.WIDTH_CLASS,
						DESKTOP_SHELL_FLYOUT.MAX_HEIGHT_CLASS,
						getDesktopShellPanelClassName(shellWindowStyle, 'strong')
					)}
					style={{ zIndex: DESKTOP_Z_INDEX.PANEL }}
					data-taskbar-interactive="true"
				>
					<div className={NH_CENTER_HEADER_WRAP_CLASS}>
						<div className="flex items-center justify-between gap-2">
							<div className="flex min-w-0 items-center gap-2">
								<BellIcon
									className={`${DESKTOP_LUCIDE.lg} shrink-0 text-(--desktop-text-primary)`}
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
								<h2
									id="notification-center-heading"
									className={DESKTOP_TYPOGRAPHY.title}
								>
									{t('title')}
								</h2>
								{unreadCount > 0 && (
									<DesktopAppStatusBadge
										className={NH_UNREAD_COUNT_BADGE_CLASS}
									>
										{unreadCount > 99 ? '99+' : unreadCount}
									</DesktopAppStatusBadge>
								)}
							</div>
							<DesktopChromeTooltip
								content={t('closeAria')}
								placement="top"
								offsetExtra={4}
							>
								<DesktopAppButton
									variant="ghost"
									size="icon"
									onClick={onClose}
									className="shrink-0 text-(--desktop-text-muted) hover:text-(--desktop-text-primary)"
									aria-label={t('closeAria')}
								>
									<XMarkIcon
										className={DESKTOP_LUCIDE.lg}
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								</DesktopAppButton>
							</DesktopChromeTooltip>
						</div>
						<DesktopChromeTooltip
							content={t('openFull')}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="sm"
								className={NH_CENTER_OPEN_FULL_BUTTON_CLASS}
								onClick={() => {
									onClose();
									dispatchOpenNotificationsApp();
								}}
								aria-label={t('openFullAria')}
							>
								<ArrowTopRightOnSquareIcon
									className={DESKTOP_LUCIDE.sm}
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
								{t('openFull')}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					</div>

					<NotificationHubBody
						density="panel"
						notifications={notifications}
						onMarkAsRead={onMarkAsRead}
						onMarkAllAsRead={onMarkAllAsRead}
						onMarkGroupAsRead={onMarkGroupAsRead}
						onDismiss={onDismiss}
						onClearAll={onClearAll}
						onRequestClose={onClose}
						onOpenFull={() => {
							onClose();
							dispatchOpenNotificationsApp();
						}}
					/>
				</m.div>
			)}
		</AnimatePresence>
	);
};

export default NotificationCenter;
