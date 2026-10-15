/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Compact/dense taskbar secondary cluster: guided tour + keyboard shortcuts under
 * a single «More» overflow control so the primary tray stays uncluttered.
 *
 * Invariants:
 * - Primary session/GAF/notify/volume/clock controls stay outside this menu.
 * - Menu uses TaskbarIconContextMenu Escape/outside-dismiss and focus-first menuitem.
 * - Welcome-guide anchors remain on menu items (`taskbar-tour-launch`, `shortcuts`).
 *
 * Related:
 * - TaskbarRightToolbar.tsx
 * - documentation/product/desktop/DESKTOP-TASKBAR-ARCHITECTURE.md
 */

import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { m } from 'framer-motion';
import { memo, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { themeDesignTokens } from '@/theme/designTokens';
import { DESKTOP_LUCIDE } from '../constants';
import { useFinePointerHover } from '../hooks/useFinePointerHover';
import { DesktopAppMenuItem } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import {
	TaskbarIconContextMenu,
	type TaskbarIconContextMenuPoint,
} from './TaskbarIconContextMenu';

export type TaskbarSecondaryOverflowProps = {
	onShowShortcuts?: () => void;
	onOpenDesktopWelcomeTour?: () => void;
	taskbarButtonSurface: string;
	reduceMotion: boolean | null;
};

export const TaskbarSecondaryOverflow = memo(function TaskbarSecondaryOverflow({
	onShowShortcuts,
	onOpenDesktopWelcomeTour,
	taskbarButtonSurface,
	reduceMotion,
}: TaskbarSecondaryOverflowProps) {
	const { t } = useTranslation('desktopUi');
	const { taskbar } = themeDesignTokens.desktop;
	const finePointerHover = useFinePointerHover();
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const [menuPoint, setMenuPoint] =
		useState<TaskbarIconContextMenuPoint | null>(null);
	const menuOpen = menuPoint != null;

	const closeMenu = useCallback(() => setMenuPoint(null), []);

	const openMenu = useCallback(() => {
		const el = triggerRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		setMenuPoint((prev) =>
			prev
				? null
				: {
						x: rect.left + rect.width / 2,
						y: rect.top,
					}
		);
	}, []);

	const hasTour = Boolean(onOpenDesktopWelcomeTour);
	const hasShortcuts = Boolean(onShowShortcuts);
	if (!hasTour && !hasShortcuts) return null;

	return (
		<>
			<DesktopChromeTooltip
				content={t('taskbar.secondaryOverflowTooltip')}
				placement="top"
				offsetExtra={12}
			>
				<m.button
					ref={triggerRef}
					data-taskbar-interactive="true"
					data-taskbar-secondary-overflow="true"
					data-desktop-welcome-guide="taskbar-secondary-overflow"
					type="button"
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					aria-label={t('taskbar.secondaryOverflowAria')}
					onClick={openMenu}
					className={`${taskbar.HIT_MIN_CLASS} p-1.5 rounded-lg ${taskbar.ICON_FOCUS} ${taskbarButtonSurface}`}
					whileHover={
						finePointerHover && !reduceMotion ? { scale: 1.02 } : undefined
					}
				>
					<EllipsisHorizontalIcon
						className={taskbar.ICON_CLASS}
						strokeWidth={DESKTOP_LUCIDE.stroke}
					/>
				</m.button>
			</DesktopChromeTooltip>
			<TaskbarIconContextMenu
				point={menuPoint}
				onClose={closeMenu}
				menuWidth={240}
				menuHeight={hasTour && hasShortcuts ? 120 : 72}
			>
				{hasTour ? (
					<DesktopAppMenuItem
						type="button"
						role="menuitem"
						data-desktop-welcome-guide="taskbar-tour-launch"
						onClick={() => {
							closeMenu();
							onOpenDesktopWelcomeTour?.();
						}}
					>
						{t('titleBarChrome.guideTour')}
					</DesktopAppMenuItem>
				) : null}
				{hasShortcuts ? (
					<DesktopAppMenuItem
						type="button"
						role="menuitem"
						data-desktop-welcome-guide="shortcuts"
						onClick={() => {
							closeMenu();
							onShowShortcuts?.();
						}}
					>
						{t('taskbar.shortcutsAria')}
					</DesktopAppMenuItem>
				) : null}
			</TaskbarIconContextMenu>
		</>
	);
});
