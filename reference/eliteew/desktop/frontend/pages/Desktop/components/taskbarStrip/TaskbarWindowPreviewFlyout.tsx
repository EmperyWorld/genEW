/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Taskbar hover flyout for open windows: metadata panel (default) or live thumbnail mock (feature flag).
 *
 * Invariants:
 * - Rendered only when hover delay elapsed (`showPreviewForWin === window.id`).
 * - Live thumbnail path gated by `DESKTOP_FEATURE_FLAGS.TASKBAR_WINDOW_PREVIEW`.
 *
 * Related:
 * - `TaskbarPinnedAndWindowsStrip.tsx`, `TaskbarWindowLiveThumbnail.tsx`
 */

import { AnimatePresence, m } from 'framer-motion';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { DESKTOP_FEATURE_FLAGS } from '@/pages/Desktop/constants';
import { DesktopChromeTooltip } from '../DesktopChromeTooltip';
import type { WindowState } from '../../types/desktop.types';
import { TaskbarWindowLiveThumbnail } from './TaskbarWindowLiveThumbnail';

export type TaskbarWindowPreviewFlyoutProps = {
	window: WindowState;
	taskbarTitle: string;
	shellPanel: string;
	portalStackBase: number;
	reduceMotion: boolean;
	visible: boolean;
	renderWindowIcon: (
		desktopWindow: WindowState,
		variant: 'taskbar' | 'preview' | 'list'
	) => React.ReactNode;
};

export function TaskbarWindowPreviewFlyout({
	window: w,
	taskbarTitle,
	shellPanel,
	portalStackBase,
	reduceMotion,
	visible,
	renderWindowIcon,
}: TaskbarWindowPreviewFlyoutProps): React.JSX.Element {
	const { t } = useTranslation('desktopUi');
	const livePreview = DESKTOP_FEATURE_FLAGS.TASKBAR_WINDOW_PREVIEW;

	return (
		<AnimatePresence>
			{visible ? (
				<m.div
					data-taskbar-flyout
					initial={
						reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.95 }
					}
					animate={
						reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
					}
					exit={
						reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.95 }
					}
					className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 ${livePreview ? 'w-72' : 'w-64'} ${shellPanel} overflow-hidden`}
					style={{ zIndex: portalStackBase }}
				>
					{livePreview ? (
						<div className="space-y-2 p-3">
							<div className="flex items-center gap-2">
								{renderWindowIcon(w, 'preview')}
								<span className="truncate text-sm font-medium text-(--desktop-text-primary)">
									{taskbarTitle}
								</span>
							</div>
							<TaskbarWindowLiveThumbnail
								window={w}
								reduceMotion={reduceMotion}
							>
								{renderWindowIcon(w, 'preview')}
							</TaskbarWindowLiveThumbnail>
						</div>
					) : (
						<>
							<div className="flex items-center gap-2 border-b border-(--desktop-border-subtle) p-3">
								{renderWindowIcon(w, 'preview')}
								<DesktopChromeTooltip
									content={taskbarTitle}
									placement="top"
									offsetExtra={4}
								>
									<span className="flex-1 truncate text-sm font-medium text-(--desktop-text-primary)">
										{taskbarTitle}
									</span>
								</DesktopChromeTooltip>
								<DesktopChromeTooltip
									content={
										w.isMinimized
											? t('taskbar.statusDotMinimized')
											: w.isMaximized
												? t('taskbar.statusDotMaximized')
												: t('taskbar.statusDotActive')
									}
									placement="top"
									offsetExtra={4}
								>
									<div
										className={`h-2 w-2 shrink-0 rounded-full ${w.isMinimized ? 'bg-[rgb(var(--desktop-accent-rgb)/0.45)]' : w.isMaximized ? 'bg-[rgb(var(--desktop-accent-rgb))]' : 'bg-[rgb(var(--desktop-accent-rgb)/0.78)]'}`}
									/>
								</DesktopChromeTooltip>
							</div>
							<div className="space-y-2 border-b border-(--desktop-border-subtle) bg-(--desktop-surface-soft) p-3">
								<div className="flex items-center justify-between text-xs">
									<span className="text-(--desktop-text-dim)">
										{t('taskbar.previewType')}
									</span>
									<span className="text-(--desktop-text-secondary)">
										{w.type === 'folder'
											? t('taskbar.previewFolder')
											: (w.appComponent ?? t('taskSwitcher.appFallback'))}
									</span>
								</div>
								{w.type === 'folder' && w.path.length > 0 && (
									<div className="flex flex-col gap-0.5">
										<span className="text-xs text-(--desktop-text-dim)">
											{t('taskbar.previewPath')}
										</span>
										<span className="truncate text-xs text-(--desktop-text-secondary)">
											{w.path.join(' › ')}
										</span>
									</div>
								)}
								<div className="flex items-center justify-between text-xs">
									<span className="text-(--desktop-text-dim)">
										{t('taskbar.previewSize')}
									</span>
									<span className="text-(--desktop-text-secondary)">
										{Math.round(w.size.width)}×{Math.round(w.size.height)}
									</span>
								</div>
								<div className="flex items-center justify-between text-xs">
									<span className="text-(--desktop-text-dim)">
										{t('taskbar.previewPosition')}
									</span>
									<span className="text-(--desktop-text-secondary)">
										{Math.round(w.position.x)}, {Math.round(w.position.y)}
									</span>
								</div>
							</div>
							<div className="flex items-center justify-between bg-(--desktop-surface-soft) p-2 text-xs text-(--desktop-text-dim)">
								<span>
									{w.isMinimized
										? t('taskbar.statusDotMinimized')
										: w.isMaximized
											? t('taskbar.statusDotMaximized')
											: t('taskSwitcher.restored')}
								</span>
								<span>{t('taskbar.previewZIndex', { z: w.zIndex })}</span>
							</div>
						</>
					)}
					<div
						className="absolute -bottom-2 left-1/2 h-0 w-0 -translate-x-1/2 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-(--desktop-surface-panel-strong)"
						aria-hidden
					/>
				</m.div>
			) : null}
		</AnimatePresence>
	);
}
