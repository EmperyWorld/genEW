/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared Start Menu app card grid used by categories, recent, pinned, and all tabs.
 *
 * Invariants:
 * - Presentation-only extract from StartMenu; open / context / pin handlers stay parent-owned.
 * - No Framer stagger/hover scale on cards (RDP-safe).
 *
 * Related:
 * - ../StartMenu.tsx
 */

import * as React from 'react';
import { cn } from '@/utils/cn';
import type { TFunction } from 'i18next';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import type { DesktopIconStyle } from '../../../../types/profile';
import {
	DESKTOP_INTERACTIVE,
	DESKTOP_LUCIDE,
	DESKTOP_TYPOGRAPHY,
} from '../../constants';
import type { DesktopItem } from '../../types/desktop.types';
import { isSystemDesktopApp } from '../../utils/desktopAppRegistry';
import { DESKTOP_APP_STYLE_CONTRACT } from '../DesktopAppChrome';
import { DesktopAppBadge } from '../../utils/desktopVisualSystem';
import { DesktopChromeTooltip } from '../DesktopChromeTooltip';

const START_MENU_APP_NAME_CLASS = cn(
	'text-xs font-semibold leading-snug text-(--desktop-text-primary) antialiased',
	'w-full px-0.5 text-center break-words wrap-anywhere'
);

const START_MENU_APP_CARD_CLASS = cn(
	'relative flex flex-col items-center gap-2 rounded-2xl p-3.5 group min-h-28',
	DESKTOP_APP_STYLE_CONTRACT.softCard,
	'border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-soft)_90%,var(--desktop-surface-panel)_10%)]',
	'hover:border-(--desktop-border-strong) hover:bg-(--desktop-surface-soft-hover) hover:shadow-[0_12px_32px_rgba(0,0,0,0.2)]',
	DESKTOP_INTERACTIVE.focusRing
);

function startMenuDesktopStatusBadgeClass(onDesktop: boolean): string {
	return cn(
		DESKTOP_TYPOGRAPHY.small,
		'inline-flex items-center justify-center rounded-full border px-2 py-0.5',
		'font-semibold leading-none shadow-sm',
		onDesktop
			? 'border-emerald-300/35 bg-emerald-400/12 text-emerald-200 shadow-emerald-950/10'
			: 'border-rose-300/35 bg-rose-400/12 text-rose-200 shadow-rose-950/10'
	);
}

function isStartMenuAppCardSecondaryClick(target: HTMLElement): boolean {
	return Boolean(
		target.closest(
			'[data-start-app-menu-trigger], [data-start-app-desktop-toggle]'
		)
	);
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightMatch(text: string, query: string): React.ReactNode {
	if (!query.trim()) return text;
	const escaped = escapeRegex(query.trim());
	const re = new RegExp(`(${escaped})`, 'gi');
	const parts = text.split(re);
	let sliceStart = 0;
	return parts.map((part, i) => {
		const markKey = `sm-${sliceStart}`;
		sliceStart += part.length;
		return i % 2 === 1 ? (
			<mark
				key={markKey}
				className="rounded bg-[rgb(var(--desktop-accent-rgb)/0.18)] px-0.5 font-medium text-(--desktop-text-primary)"
			>
				{part}
			</mark>
		) : (
			part
		);
	});
}

type StartMenuDesktopStatusBadgeProps = {
	app: DesktopItem;
	onDesktop: boolean;
	canToggle: boolean;
	onToggle: (app: DesktopItem, onDesktop: boolean) => void;
	labelOnDesktop: string;
	labelNotOnDesktop: string;
	ariaPin: string;
	ariaUnpin: string;
};

function StartMenuDesktopStatusBadge({
	app,
	onDesktop,
	canToggle,
	onToggle,
	labelOnDesktop,
	labelNotOnDesktop: _labelNotOnDesktop,
	ariaPin,
	ariaUnpin,
}: StartMenuDesktopStatusBadgeProps): React.ReactElement | null {
	// Progressive disclosure: red «Не отображён» wall removed — only show when on desktop.
	if (!onDesktop) {
		if (!canToggle) return null;
		return (
			<DesktopChromeTooltip content={ariaPin} placement="top" offsetExtra={6}>
				<button
					type="button"
					data-start-app-desktop-toggle="true"
					className={cn(
						'mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-(--desktop-text-muted)',
						'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
						'cursor-pointer hover:text-(--desktop-text-primary)',
						'focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
					)}
					aria-label={ariaPin}
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onToggle(app, onDesktop);
					}}
				>
					{ariaPin}
				</button>
			</DesktopChromeTooltip>
		);
	}
	if (!canToggle) {
		return (
			<span className={startMenuDesktopStatusBadgeClass(true)}>
				{labelOnDesktop}
			</span>
		);
	}
	return (
		<DesktopChromeTooltip content={ariaUnpin} placement="top" offsetExtra={6}>
			<button
				type="button"
				data-start-app-desktop-toggle="true"
				className={cn(
					startMenuDesktopStatusBadgeClass(true),
					'cursor-pointer transition-[filter,transform] hover:brightness-110 active:scale-[0.98]',
					'focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)] focus-visible:ring-offset-1 focus-visible:ring-offset-[rgb(var(--desktop-bg-primary-rgb))]'
				)}
				aria-label={ariaUnpin}
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onToggle(app, onDesktop);
				}}
			>
				{labelOnDesktop}
			</button>
		</DesktopChromeTooltip>
	);
}

export type StartMenuAppGridProps = {
	apps: DesktopItem[];
	search: string;
	iconStyle: DesktopIconStyle;
	desktopAppIdSet: Set<string>;
	canToggleDesktopPin: boolean;
	t: TFunction<'desktopUi'>;
	openAppFromStart: (app: DesktopItem) => void;
	onOpenAppContext: (app: DesktopItem, x: number, y: number) => void;
	onAppContextMenu: (e: React.MouseEvent, app: DesktopItem) => void;
	onAppMouseDown: (e: React.MouseEvent, app: DesktopItem) => void;
	onPreloadApp: (app: DesktopItem) => void;
	toggleAppDesktopPin: (app: DesktopItem, onDesktop: boolean) => void;
};

export function StartMenuAppGrid({
	apps,
	search,
	iconStyle,
	desktopAppIdSet,
	canToggleDesktopPin,
	t,
	openAppFromStart,
	onOpenAppContext,
	onAppContextMenu,
	onAppMouseDown,
	onPreloadApp,
	toggleAppDesktopPin,
}: StartMenuAppGridProps) {
	return (
		<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
			{apps.map((app) => (
				<button
					key={app.id}
					data-start-app-id={app.id}
					type="button"
					onClick={(e) => {
						const target = e.target as HTMLElement;
						if (isStartMenuAppCardSecondaryClick(target)) {
							if (target.closest('[data-start-app-menu-trigger]')) {
								e.preventDefault();
								e.stopPropagation();
								const trigger = target.closest(
									'[data-start-app-menu-trigger]'
								) as HTMLElement;
								const rect = trigger.getBoundingClientRect();
								onOpenAppContext(app, rect.right - 6, rect.bottom + 4);
							}
							return;
						}
						openAppFromStart(app);
					}}
					onContextMenu={(e) => onAppContextMenu(e, app)}
					onMouseDown={(e) => onAppMouseDown(e, app)}
					onPointerEnter={() => onPreloadApp(app)}
					className={START_MENU_APP_CARD_CLASS}
					aria-label={app.name}
				>
					<DesktopChromeTooltip
						content={t('startMenu.appMenuTriggerTitle')}
						placement="top"
						offsetExtra={4}
					>
						<span
							data-start-app-menu-trigger="true"
							className={cn(
								'absolute right-1 top-1 rounded-lg border border-transparent p-1.5 text-(--desktop-text-muted) transition-colors',
								'hover:border-(--desktop-border-subtle) hover:bg-(--desktop-surface-soft-hover) hover:text-(--desktop-text-secondary)',
								'focus:outline-none focus-visible:border-[rgb(var(--desktop-accent-rgb)/0.35)] focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb))]/30 focus-visible:ring-inset'
							)}
						>
							<EllipsisHorizontalIcon
								className={DESKTOP_LUCIDE.sm}
								strokeWidth={DESKTOP_LUCIDE.stroke}
								aria-hidden
							/>
						</span>
					</DesktopChromeTooltip>
					<DesktopAppBadge
						appComponent={app.appComponent}
						icon={app.icon}
						variant="start"
						className="h-11 w-11 shrink-0 sm:h-12 sm:w-12"
						iconStyle={iconStyle}
					/>
					<span className={START_MENU_APP_NAME_CLASS}>
						{highlightMatch(app.name, search)}
					</span>
					<StartMenuDesktopStatusBadge
						app={app}
						onDesktop={desktopAppIdSet.has(app.id)}
						canToggle={canToggleDesktopPin && !isSystemDesktopApp(app)}
						onToggle={toggleAppDesktopPin}
						labelOnDesktop={t('startMenu.onDesktop')}
						labelNotOnDesktop={t('startMenu.notOnDesktop')}
						ariaPin={t('startMenu.pinToDesktop')}
						ariaUnpin={t('startMenu.unpinFromDesktop')}
					/>
				</button>
			))}
		</div>
	);
}
