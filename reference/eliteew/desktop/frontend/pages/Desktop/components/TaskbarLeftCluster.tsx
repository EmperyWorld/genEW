/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Левая зона таскбара: кнопка Пуск, разделители, дочерние узлы (виртуальные столы).
 *
 * Invariants:
 * - memo: при открытии трея/уведомлений пропсы здесь не меняются — блок не перерисовывается.
 * - Кнопка Пуск помечена `data-start-menu-toggle` для исключения из outside-click закрытия StartMenu.
 * - Plain button (no Framer hover/tap scale) for RDP-safe paint.
 *
 * Related:
 * - components/StartMenu.tsx
 * - components/Taskbar.tsx
 */

import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { themeDesignTokens } from '@/theme/designTokens';
import type { Variants } from 'framer-motion';
import { memo, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DESKTOP_INTERACTIVE } from '@/pages/Desktop/constants';

export type TaskbarLeftClusterProps = {
	showStart: boolean;
	taskbarDividerClass: string;
	taskbarButtonSurface: string;
	taskbarButtonActiveSurface: string;
	/** Kept for Taskbar API compat; unused (no Framer on Start). */
	buttonVariants: Variants;
	/** Kept for Taskbar API compat; unused. */
	reduceMotion: boolean | null;
	onStartClick: () => void;
	onStartContextMenu: (e: MouseEvent<HTMLButtonElement>) => void;
	children?: ReactNode;
};

export const TaskbarLeftCluster = memo(function TaskbarLeftCluster({
	showStart,
	taskbarDividerClass,
	taskbarButtonSurface,
	taskbarButtonActiveSurface,
	buttonVariants: _buttonVariants,
	reduceMotion: _reduceMotion,
	onStartClick,
	onStartContextMenu,
	children,
}: TaskbarLeftClusterProps) {
	const { t } = useTranslation('desktopUi');
	const { taskbar } = themeDesignTokens.desktop;

	return (
		<div className={`flex items-center ${taskbar.GAP} shrink-0`}>
			<DesktopChromeTooltip
				content={t('taskbar.startTooltip')}
				placement="top"
				offsetExtra={12}
			>
				<button
					data-taskbar-interactive="true"
					data-start-menu-toggle="true"
					type="button"
					onClick={onStartClick}
					onContextMenu={onStartContextMenu}
					className={`${taskbar.HIT_MIN_CLASS} p-1.5 rounded-xl leading-none focus:outline-none transition-colors duration-200 ${DESKTOP_INTERACTIVE.focusRing} ${showStart ? taskbarButtonActiveSurface : taskbarButtonSurface}`}
					aria-label={t('taskbar.startAria')}
					aria-expanded={showStart}
					aria-controls="start-menu-panel"
				>
					<div className="relative size-[24px]">
						<div
							className={`absolute inset-0 overflow-hidden rounded-[0.65rem] border border-[rgb(var(--desktop-accent-rgb)/0.28)] bg-[linear-gradient(155deg,rgba(255,255,255,0.1)_0%,rgba(0,0,0,0.35)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${
								showStart
									? 'ring-2 ring-[rgb(var(--desktop-accent-rgb)/0.5)]'
									: ''
							}`}
						>
							<img
								src="/logo.webp"
								alt="EliteEW"
								className="w-full h-full object-contain mix-blend-screen"
								loading="lazy"
							/>
						</div>
					</div>
				</button>
			</DesktopChromeTooltip>

			<div className={`w-px h-7 mx-0.5 shrink-0 ${taskbarDividerClass}`} />

			{children && (
				<>
					{children}
					<div className={`w-px h-7 mx-0.5 ${taskbarDividerClass}`} />
				</>
			)}
		</div>
	);
});

TaskbarLeftCluster.displayName = 'TaskbarLeftCluster';
