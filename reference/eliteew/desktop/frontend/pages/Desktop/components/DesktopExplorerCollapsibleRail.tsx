/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Collapsible left rail shell for folder explorer (Content Manager + desktop folder windows).
 *
 * Invariants:
 * - Collapsed state shows a shimmer expand control; expanded state shows children + collapse control.
 * - Honors reduce-motion / disabled animations via profile accessibility flags.
 *
 * Related:
 * - useDesktopFolderExplorerRailCollapsed.ts · DesktopChromeTooltip.tsx
 */

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { ReactNode } from 'react';
import { useUserPreferencesApp } from '@/contexts/UserPreferencesAppContext';
import { cn } from '@/utils/cn';
import { DesktopAppButton } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

export type DesktopExplorerCollapsibleRailProps = {
	collapsed: boolean;
	onToggle: () => void;
	expandAriaLabel: string;
	collapseAriaLabel: string;
	children: ReactNode;
	/** Icon-only strip shown while collapsed (toolbar, folder monograms). */
	collapsedContent?: ReactNode;
	expandedClassName?: string;
	collapsedClassName?: string;
	contentClassName?: string;
	/** Accessible name for the expanded rail landmark (e.g. folder tree). */
	landmarkLabel?: string;
	/** Optional label row rendered beside the collapse control when expanded. */
	headerLabel?: ReactNode;
};

export function DesktopExplorerCollapsibleRail({
	collapsed,
	onToggle,
	expandAriaLabel,
	collapseAriaLabel,
	collapsedContent,
	children,
	expandedClassName,
	collapsedClassName,
	contentClassName,
	landmarkLabel,
	headerLabel,
}: DesktopExplorerCollapsibleRailProps): React.JSX.Element {
	const preferencesApp = useUserPreferencesApp();
	const reduceMotion =
		preferencesApp?.preferences?.accessibility?.reduce_motion === true ||
		preferencesApp?.preferences?.ui?.animations_enabled === false;

	if (collapsed) {
		return (
			<aside
				aria-label={landmarkLabel}
				className={cn(
					'flex w-12 shrink-0 flex-col border-e border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-soft)_55%,transparent)]',
					collapsedClassName
				)}
			>
				<div className="flex shrink-0 justify-center px-1 pb-1 pt-2">
					<DesktopChromeTooltip
						content={expandAriaLabel}
						placement="right"
						offsetExtra={6}
					>
						<button
							type="button"
							onClick={onToggle}
							aria-label={expandAriaLabel}
							aria-expanded={false}
							className={cn(
								'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgb(var(--desktop-accent-rgb)/0.5)] bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb)/0.16)_100%,var(--desktop-surface-panel))] text-[rgb(var(--desktop-accent-rgb))] shadow-[0_0_10px_rgb(var(--desktop-accent-rgb)/0.22)] transition-colors hover:bg-[rgb(var(--desktop-accent-rgb)/0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.5)]',
								!reduceMotion && 'desktop-explorer-rail-toggle-shimmer'
							)}
						>
							<ChevronRightIcon className="h-5 w-5" aria-hidden />
						</button>
					</DesktopChromeTooltip>
				</div>
				{collapsedContent ? (
					<div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-1 pb-2 custom-scrollbar">
						{collapsedContent}
					</div>
				) : null}
			</aside>
		);
	}

	return (
		<aside
			aria-label={landmarkLabel}
			className={cn('flex min-h-0 min-w-0 flex-col', expandedClassName)}
		>
			<div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-1">
				{headerLabel ? (
					<div className="min-w-0 flex-1">{headerLabel}</div>
				) : (
					<span className="sr-only">{collapseAriaLabel}</span>
				)}
				<DesktopChromeTooltip
					content={collapseAriaLabel}
					placement="left"
					offsetExtra={6}
				>
					<DesktopAppButton
						type="button"
						variant="ghost"
						size="icon"
						className="h-8 w-8 shrink-0"
						onClick={onToggle}
						aria-label={collapseAriaLabel}
						aria-expanded={true}
					>
						<ChevronLeftIcon className="h-4 w-4" aria-hidden />
					</DesktopAppButton>
				</DesktopChromeTooltip>
			</div>
			<div
				className={cn(
					'min-h-0 min-w-0 flex-1 overflow-y-auto',
					contentClassName
				)}
			>
				{children}
			</div>
		</aside>
	);
}
