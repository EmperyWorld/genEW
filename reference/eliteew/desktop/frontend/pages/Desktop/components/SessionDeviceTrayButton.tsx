/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Taskbar tray status button for session/device health. It exposes a calm glow
 * when the desktop is healthy and escalates to amber/red pulse when attention is needed.
 *
 * Invariants:
 * - Click opens the canonical session/device panel; this button does not own a duplicate popover.
 * - Realtime state comes from the desktop GAF process and is only one input to the health model.
 *
 * Related:
 * - `components/ui/useSessionDeviceHealth.ts`
 * - `components/ui/AuthStatusIndicator.tsx`
 * - `pages/Desktop/context/GAFChatProvider.tsx`
 */

import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { useSessionDeviceHealth } from '@/components/ui/useSessionDeviceHealth';
import { cn } from '@/utils/cn';
import { m } from 'framer-motion';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { DESKTOP_LUCIDE } from '../constants';
import { useSocketConnectionState } from '@/services/communication/socketConnectionStore';
import { useFinePointerHover } from '../hooks/useFinePointerHover';
import { DesktopAppMenuDivider, DesktopAppMenuItem } from './DesktopAppChrome';
import {
	TaskbarIconContextMenu,
	type TaskbarIconContextMenuPoint,
} from './TaskbarIconContextMenu';

export type SessionDeviceTrayButtonProps = {
	onOpenSessionInfo?: () => void;
	taskbarButtonSurface: string;
	taskbarButtonActiveSurface: string;
	reduceMotion: boolean | null;
};

type TrayVisuals = {
	color: string;
	glow: string;
	labelKey: string;
	descriptionKey: string;
	pulseDuration: number;
};

function getTrayVisuals(
	level: ReturnType<typeof useSessionDeviceHealth>['level']
): TrayVisuals {
	switch (level) {
		case 'healthy':
			return {
				color: 'rgb(34 197 94)',
				glow: 'rgba(34,197,94,0.42)',
				labelKey: 'taskbar.sessionDeviceHealthy',
				descriptionKey: 'taskbar.sessionDeviceHealthyHint',
				pulseDuration: 2.8,
			};
		case 'warning':
			return {
				color: 'rgb(245 158 11)',
				glow: 'rgba(245,158,11,0.45)',
				labelKey: 'taskbar.sessionDeviceWarning',
				descriptionKey: 'taskbar.sessionDeviceWarningHint',
				pulseDuration: 1.5,
			};
		case 'critical':
			return {
				color: 'rgb(153 27 27)',
				glow: 'rgba(153,27,27,0.64)',
				labelKey: 'taskbar.sessionDeviceCritical',
				descriptionKey: 'taskbar.sessionDeviceCriticalHint',
				pulseDuration: 0.62,
			};
		default:
			return {
				color: 'rgb(59 130 246)',
				glow: 'rgba(59,130,246,0.34)',
				labelKey: 'taskbar.sessionDeviceChecking',
				descriptionKey: 'taskbar.sessionDeviceCheckingHint',
				pulseDuration: 1.2,
			};
	}
}

export const SessionDeviceTrayButton = memo(function SessionDeviceTrayButton({
	onOpenSessionInfo,
	taskbarButtonSurface,
	taskbarButtonActiveSurface,
	reduceMotion,
}: SessionDeviceTrayButtonProps) {
	const { t } = useTranslation('desktopUi');
	const finePointerHover = useFinePointerHover();
	const { connected: socketConnected } = useSocketConnectionState();
	const health = useSessionDeviceHealth({ realtimeConnected: socketConnected });
	const visuals = getTrayVisuals(health.level);
	const active = health.level === 'warning' || health.level === 'critical';
	const shouldPulse = active && !reduceMotion;
	const [contextMenu, setContextMenu] =
		useState<TaskbarIconContextMenuPoint | null>(null);
	const closeContextMenu = () => setContextMenu(null);
	const openSessionInfo = () => {
		onOpenSessionInfo?.();
		closeContextMenu();
	};
	const tooltip = (
		<span className="flex max-w-[260px] flex-col gap-1 text-left text-xs">
			<span className="font-semibold text-(--desktop-text-primary)">
				{t('taskbar.sessionDeviceTitle')}
			</span>
			<span className="text-(--desktop-text-secondary)">
				{t(visuals.labelKey)}
			</span>
			<span className="text-(--desktop-text-muted)">
				{t(visuals.descriptionKey)}
			</span>
			<span className="border-t border-(--desktop-border-subtle) pt-1 text-(--desktop-text-muted)">
				{t('taskbar.sessionDeviceOpenHint')}
			</span>
		</span>
	);

	return (
		<>
			<DesktopChromeTooltip content={tooltip} placement="top" offsetExtra={12}>
				<m.button
					data-taskbar-interactive="true"
					type="button"
					onClick={onOpenSessionInfo}
					onContextMenu={(event) => {
						event.preventDefault();
						event.stopPropagation();
						setContextMenu({ x: event.clientX, y: event.clientY });
					}}
					className={cn(
						'relative h-8 min-w-8 rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.55)]',
						active ? taskbarButtonActiveSurface : taskbarButtonSurface
					)}
					aria-label={`${t('taskbar.sessionDeviceTitle')}. ${t(visuals.labelKey)}`}
					whileHover={
						finePointerHover && !reduceMotion ? { scale: 1.02 } : undefined
					}
				>
					<m.span
						className="pointer-events-none absolute inset-0 rounded-lg"
						style={{
							backgroundColor: visuals.glow,
							opacity: shouldPulse ? undefined : active ? 0.3 : 0.18,
						}}
						animate={
							shouldPulse
								? {
										opacity:
											health.level === 'critical'
												? [0.22, 0.78, 0.22]
												: [0.18, 0.5, 0.18],
										scale:
											health.level === 'critical'
												? [0.94, 1.08, 0.94]
												: [0.98, 1.03, 0.98],
									}
								: undefined
						}
						transition={
							shouldPulse
								? {
										duration: visuals.pulseDuration,
										repeat: Infinity,
										ease: 'easeInOut',
									}
								: undefined
						}
						aria-hidden
					/>
					<ShieldCheckIcon
						className="relative z-1 h-5 w-5"
						strokeWidth={DESKTOP_LUCIDE.stroke}
						style={{ color: visuals.color }}
						aria-hidden
					/>
					<span
						className="pointer-events-none absolute right-1 bottom-1 z-1 h-1.5 w-1.5 rounded-full border border-(--desktop-surface-app)"
						style={{
							backgroundColor: visuals.color,
							boxShadow: `0 0 8px ${visuals.glow}`,
						}}
						aria-hidden
					/>
				</m.button>
			</DesktopChromeTooltip>
			<TaskbarIconContextMenu
				point={contextMenu}
				onClose={closeContextMenu}
				menuWidth={228}
				menuHeight={166}
				className="min-w-[228px]"
			>
				<DesktopAppMenuItem
					type="button"
					role="menuitem"
					onClick={openSessionInfo}
				>
					{t('taskbar.trayContextOpenSession')}
				</DesktopAppMenuItem>
				<DesktopAppMenuItem
					type="button"
					role="menuitem"
					disabled={health.manualCheckInProgress}
					onClick={() => {
						closeContextMenu();
						void health.checkNow();
					}}
				>
					{t('taskbar.trayContextCheckSession')}
				</DesktopAppMenuItem>
				<DesktopAppMenuDivider />
				<DesktopAppMenuItem
					type="button"
					role="menuitem"
					disabled={health.tokenRefreshInProgress}
					onClick={() => {
						closeContextMenu();
						void health.refreshTokenNow();
					}}
				>
					{t('taskbar.trayContextRefreshToken')}
				</DesktopAppMenuItem>
				<DesktopAppMenuItem
					type="button"
					role="menuitem"
					onClick={() => {
						closeContextMenu();
						health.refreshLogin();
					}}
				>
					{t('taskbar.trayContextRefreshLogin')}
				</DesktopAppMenuItem>
			</TaskbarIconContextMenu>
		</>
	);
});
