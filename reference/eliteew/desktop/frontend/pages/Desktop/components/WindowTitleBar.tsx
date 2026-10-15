/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared desktop window title bar: drag handle, window identity, optional instance-policy badge, and OS-style minimize / maximize / close with correct a11y labels.
 *
 * Invariants:
 * - Window chrome controls must not rely on fragile `querySelectorAll(button)` ordering elsewhere; OS controls carry `data-desktop-window-control`.
 * - Guided tour launch lives in the title bar (left of minimize) when the app registers `useDesktopGuideTourOpener`; collapses into overflow on narrow windows.
 * - `title` and `aria-label` for minimize/maximize/close stay aligned (i18n `desktopUi.titleBarChrome`); tooltips via `DesktopChromeTooltip`.
 *
 * Related:
 * - EnhancedWindow.tsx
 * - pages/Desktop/constants (WINDOW_TITLE_BAR, DESKTOP_TYPOGRAPHY)
 */

import { GuideTourLaunchButton } from '@/components/guided-tour/GuideTourLaunchButton';
import * as React from 'react';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import type { DesktopWindowStyle } from '../../../types/profile';
import {
	DESKTOP_LUCIDE,
	DESKTOP_TYPOGRAPHY,
	WINDOW_TITLE_BAR,
} from '../constants';
import { DESKTOP_WINDOW_TITLEBAR_STYLES } from '../utils/desktopVisualSystem';
import {
	ArrowsPointingOutIcon,
	EllipsisHorizontalIcon,
	FolderOpenIcon,
	MapPinIcon,
	MinusIcon,
	MinusSmallIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { DesktopWindowMorphChip } from './DesktopWindowMorphChip';
import { DesktopAppMenuItem, DesktopAppMenuSurface } from './DesktopAppChrome';
import { DesktopShellFloatingPortal } from './DesktopShellFloatingPortal';

const NARROW_TITLE_BAR_PX = 520;

export interface WindowTitleBarProps {
	title: string;
	icon?: React.ReactNode;
	/** When set, title-bar app icon participates in shared layout morph to taskbar. */
	windowId?: string;
	windowMorphActive?: boolean;
	onClose: () => void;
	onMinimize: () => void;
	onMaximize: () => void;
	isMaximized: boolean;
	alwaysOnTop?: boolean;
	onToggleAlwaysOnTop?: () => void;
	windowType?: 'folder' | 'app';
	onDragStart?: (e: React.MouseEvent) => void;
	className?: string;
	onContextMenu?: (e: React.MouseEvent) => void;
	visualStyle?: DesktopWindowStyle;
	/** Optional: single vs multi-instance hint from catalog (App Store policy). */
	instancePolicyPill?: string;
	/** When the app registers a guided tour opener, show «Экскурсия» before window controls. */
	onGuideTour?: () => void;
}

export const WindowTitleBar = memo<WindowTitleBarProps>(
	function WindowTitleBar({
		title,
		icon,
		onClose,
		onMinimize,
		onMaximize,
		isMaximized,
		alwaysOnTop = false,
		onToggleAlwaysOnTop,
		windowType = 'folder',
		onDragStart,
		className = '',
		onContextMenu,
		visualStyle = 'glass',
		instancePolicyPill,
		onGuideTour,
		windowId,
		windowMorphActive = false,
	}) {
		const { t } = useTranslation('desktopUi');
		const headerRef = useRef<HTMLElement>(null);
		const [isNarrow, setIsNarrow] = useState(false);
		const [overflowOpen, setOverflowOpen] = useState(false);
		const [overflowPos, setOverflowPos] = useState({ x: 0, y: 0 });

		useEffect(() => {
			const el = headerRef.current;
			if (!el || typeof ResizeObserver === 'undefined') return;
			const ro = new ResizeObserver((entries) => {
				const w = entries[0]?.contentRect.width ?? el.offsetWidth;
				setIsNarrow(w < NARROW_TITLE_BAR_PX);
			});
			ro.observe(el);
			return () => ro.disconnect();
		}, []);

		const handleControlClick = (e: React.MouseEvent, fn: () => void) => {
			e.stopPropagation();
			fn();
		};
		const stopDragPointer = (e: React.PointerEvent) => {
			e.stopPropagation();
		};
		const styles =
			DESKTOP_WINDOW_TITLEBAR_STYLES[visualStyle] ??
			DESKTOP_WINDOW_TITLEBAR_STYLES.glass;
		const iconColorClass = 'text-(--desktop-text-primary)';
		const glyphClass = 'w-3.5 h-3.5 pointer-events-none';

		const showInlineGuideTour = Boolean(onGuideTour) && !isNarrow;
		const showOverflowGuideTour = Boolean(onGuideTour) && isNarrow;

		const instancePolicyVisible =
			windowType === 'app' &&
			instancePolicyPill &&
			instancePolicyPill.trim().length > 0;

		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: Window chrome drag surface (mouse + touch).
			<header
				ref={headerRef}
				className={`desktop-window-titlebar flex items-center justify-between gap-3 pl-3 pr-2.5 py-2 cursor-move select-none antialiased touch-none ${styles.root} ${className}`}
				onMouseDown={onDragStart}
				onPointerDown={onDragStart}
				onDoubleClick={(e) => handleControlClick(e, onMaximize)}
				onContextMenu={onContextMenu}
			>
				<div className="flex items-center gap-2.5 min-w-0 flex-1">
					<DesktopWindowMorphChip
						windowId={windowId ?? title}
						active={windowMorphActive && Boolean(windowId)}
						className={`${WINDOW_TITLE_BAR.iconBox} ${styles.iconShell} ${iconColorClass} flex items-center justify-center`}
					>
						{icon ?? (
							<FolderOpenIcon
								className="w-full h-full"
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						)}
					</DesktopWindowMorphChip>
					<DesktopChromeTooltip
						content={title}
						placement="bottom"
						offsetExtra={4}
					>
						<span
							className={`${DESKTOP_TYPOGRAPHY.body} truncate max-w-[min(360px,52vw)] font-semibold tracking-tight ${styles.title}`}
						>
							{title}
						</span>
					</DesktopChromeTooltip>
					<span
						className={`shrink-0 rounded-md px-2 py-0.5 font-medium uppercase tracking-[0.08em] ${DESKTOP_TYPOGRAPHY.caption} ${styles.pill}`}
					>
						{windowType === 'app'
							? t('titleBarChrome.windowTypeApp')
							: t('titleBarChrome.windowTypeFolder')}
					</span>
					{instancePolicyVisible ? (
						<DesktopChromeTooltip
							content={instancePolicyPill}
							placement="bottom"
							offsetExtra={4}
						>
							<span
								className={`shrink-0 max-w-[min(160px,24vw)] truncate rounded-md border border-(--desktop-border-subtle)/80 px-2 py-0.5 font-medium normal-case tracking-tight ${DESKTOP_TYPOGRAPHY.caption} text-(--desktop-text-secondary) bg-[color-mix(in_srgb,var(--desktop-surface-soft)_92%,transparent)]`}
							>
								{t('titleBarChrome.instancePolicyShort')}
							</span>
						</DesktopChromeTooltip>
					) : null}
					{alwaysOnTop ? (
						<MapPinIcon
							className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--desktop-accent-rgb))]"
							strokeWidth={DESKTOP_LUCIDE.stroke}
							aria-hidden
						/>
					) : null}
				</div>

				<div className={cn('shrink-0 flex items-center', styles.controlGroup)}>
					{onToggleAlwaysOnTop ? (
						<DesktopChromeTooltip
							content={
								alwaysOnTop
									? t('titleBarChrome.unpinAlwaysOnTop')
									: t('titleBarChrome.pinAlwaysOnTop')
							}
							placement="bottom"
							offsetExtra={6}
						>
							<button
								type="button"
								data-desktop-window-control="always-on-top"
								onMouseDown={(e) => e.stopPropagation()}
								onPointerDown={stopDragPointer}
								onDoubleClick={(e) => e.stopPropagation()}
								onClick={(e) => handleControlClick(e, onToggleAlwaysOnTop)}
								className={cn(
									WINDOW_TITLE_BAR.controlHit,
									styles.control,
									alwaysOnTop &&
										'border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.12)]'
								)}
								aria-label={
									alwaysOnTop
										? t('titleBarChrome.unpinAlwaysOnTop')
										: t('titleBarChrome.pinAlwaysOnTop')
								}
								aria-pressed={alwaysOnTop}
							>
								<MapPinIcon className={glyphClass} strokeWidth={2} />
							</button>
						</DesktopChromeTooltip>
					) : null}
					{showInlineGuideTour ? (
						<DesktopChromeTooltip
							content={t('titleBarChrome.guideTour')}
							placement="bottom"
							offsetExtra={6}
						>
							{/* biome-ignore lint/a11y/noStaticElementInteractions: stop title-bar drag on guide control cluster */}
							<div
								className="flex shrink-0"
								data-desktop-window-control="guide-tour"
								onMouseDown={(e) => e.stopPropagation()}
								onPointerDown={stopDragPointer}
								onDoubleClick={(e) => e.stopPropagation()}
							>
								<GuideTourLaunchButton
									compact
									onClick={onGuideTour}
									ariaLabel={t('titleBarChrome.guideTour')}
									className={cn(
										WINDOW_TITLE_BAR.controlHit,
										styles.control,
										'border-0 bg-transparent shadow-none hover:border-violet-400/35'
									)}
								/>
							</div>
						</DesktopChromeTooltip>
					) : null}
					{showOverflowGuideTour ? (
						<DesktopChromeTooltip
							content={t('titleBarChrome.moreActions')}
							placement="bottom"
							offsetExtra={6}
						>
							<button
								type="button"
								data-desktop-window-control="overflow"
								onMouseDown={(e) => e.stopPropagation()}
								onPointerDown={stopDragPointer}
								onClick={(e) => {
									e.stopPropagation();
									const rect = (
										e.currentTarget as HTMLElement
									).getBoundingClientRect();
									setOverflowPos({
										x: rect.right,
										y: rect.bottom + 4,
									});
									setOverflowOpen((v) => !v);
								}}
								className={`${WINDOW_TITLE_BAR.controlHit} ${styles.control}`}
								aria-label={t('titleBarChrome.moreActions')}
								aria-expanded={overflowOpen}
							>
								<EllipsisHorizontalIcon
									className={glyphClass}
									strokeWidth={2}
								/>
							</button>
						</DesktopChromeTooltip>
					) : null}
					<DesktopChromeTooltip
						content={t('titleBarChrome.minimize')}
						placement="bottom"
						offsetExtra={6}
					>
						<button
							type="button"
							data-desktop-window-control="minimize"
							onMouseDown={(e) => e.stopPropagation()}
							onPointerDown={stopDragPointer}
							onDoubleClick={(e) => e.stopPropagation()}
							onClick={(e) => handleControlClick(e, onMinimize)}
							className={`${WINDOW_TITLE_BAR.controlHit} ${styles.control}`}
							aria-label={t('titleBarChrome.minimize')}
						>
							<MinusIcon className={glyphClass} strokeWidth={2} />
						</button>
					</DesktopChromeTooltip>
					<DesktopChromeTooltip
						content={
							isMaximized
								? t('titleBarChrome.restore')
								: t('titleBarChrome.maximize')
						}
						placement="bottom"
						offsetExtra={6}
					>
						<button
							type="button"
							data-desktop-window-control="maximize"
							onMouseDown={(e) => e.stopPropagation()}
							onPointerDown={stopDragPointer}
							onDoubleClick={(e) => e.stopPropagation()}
							onClick={(e) => handleControlClick(e, onMaximize)}
							className={`${WINDOW_TITLE_BAR.controlHit} ${styles.control}`}
							aria-label={
								isMaximized
									? t('titleBarChrome.restore')
									: t('titleBarChrome.maximize')
							}
						>
							{isMaximized ? (
								<MinusSmallIcon className={glyphClass} strokeWidth={2} />
							) : (
								<ArrowsPointingOutIcon className={glyphClass} strokeWidth={2} />
							)}
						</button>
					</DesktopChromeTooltip>
					<DesktopChromeTooltip
						content={t('titleBarChrome.close')}
						placement="bottom"
						offsetExtra={6}
					>
						<button
							type="button"
							data-desktop-window-control="close"
							onMouseDown={(e) => e.stopPropagation()}
							onPointerDown={stopDragPointer}
							onDoubleClick={(e) => e.stopPropagation()}
							onClick={(e) => handleControlClick(e, onClose)}
							className={`${WINDOW_TITLE_BAR.controlHitClose} ${styles.close}`}
							aria-label={t('titleBarChrome.close')}
						>
							<XMarkIcon className={glyphClass} strokeWidth={2} />
						</button>
					</DesktopChromeTooltip>
				</div>
				{overflowOpen && showOverflowGuideTour ? (
					<DesktopShellFloatingPortal>
						<div
							className="fixed inset-0"
							aria-hidden
							onClick={() => setOverflowOpen(false)}
						/>
						<div
							className="fixed"
							style={{ left: overflowPos.x, top: overflowPos.y, zIndex: 10000 }}
						>
							<DesktopAppMenuSurface windowStyle={visualStyle}>
								<DesktopAppMenuItem
									type="button"
									onClick={() => {
										setOverflowOpen(false);
										onGuideTour?.();
									}}
								>
									{t('titleBarChrome.guideTour')}
								</DesktopAppMenuItem>
							</DesktopAppMenuSurface>
						</div>
					</DesktopShellFloatingPortal>
				) : null}
			</header>
		);
	}
);
