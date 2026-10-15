/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Start Menu search field and role strip above the tab controls.
 *
 * Invariants:
 * - Search input remains controlled by the Start Menu orchestrator.
 *
 * Related:
 * - ../StartMenu.tsx
 */

import type { RefObject } from 'react';
import type { TFunction } from 'i18next';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { cn } from '@/utils/cn';
import {
	DESKTOP_INTERACTIVE,
	DESKTOP_LUCIDE,
	DESKTOP_TYPOGRAPHY,
} from '../../constants';
import {
	DESKTOP_APP_STYLE_CONTRACT,
	DesktopAppSectionLabel,
} from '../DesktopAppChrome';

type Props = {
	inputRef: RefObject<HTMLInputElement | null>;
	search: string;
	setSearch: (value: string) => void;
	t: TFunction<'desktopUi'>;
};

export function StartMenuSearchHeader({
	inputRef,
	search,
	setSearch,
	t,
}: Props) {
	return (
		<div className="relative z-1 shrink-0 border-b border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-soft)_82%,var(--desktop-surface-panel)_18%)] px-3 pt-3.5 pb-2.5 max-sm:px-2.5 max-sm:pt-2.5 max-sm:pb-2">
			<div className="relative">
				<div className="pointer-events-none absolute left-3.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-lg bg-(--desktop-surface-soft) text-(--desktop-text-muted) [&_svg]:stroke-[1.35]">
					<MagnifyingGlassIcon
						className={DESKTOP_LUCIDE.md}
						aria-hidden
						strokeWidth={DESKTOP_LUCIDE.stroke}
					/>
				</div>
				<input
					ref={inputRef}
					type="search"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder={t('startMenu.searchPlaceholder')}
					aria-label={t('startMenu.searchAria')}
					className={cn(
						DESKTOP_APP_STYLE_CONTRACT.searchField,
						DESKTOP_TYPOGRAPHY.quickSearchInput,
						'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.4)] focus-visible:border-[rgb(var(--desktop-accent-rgb)/0.65)]',
						'focus:bg-(--desktop-surface-soft-hover)',
						'w-full rounded-2xl py-2.5 pl-11 pr-3.5',
						DESKTOP_INTERACTIVE.inputFocus
					)}
				/>
			</div>
			<div className="mt-3 max-sm:mt-2 hidden sm:flex items-start justify-between gap-3">
				<div className="min-w-0">
					<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.2em]">
						{t('startMenu.roleTitle')}
					</DesktopAppSectionLabel>
					<p className={cn(DESKTOP_TYPOGRAPHY.meta, 'mt-1 leading-relaxed')}>
						{t('startMenu.roleDescription')}
					</p>
				</div>
				<span
					className={cn(
						DESKTOP_TYPOGRAPHY.sectionPill,
						'desktop-shell-display-text shrink-0 rounded-full border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1'
					)}
					aria-hidden
				>
					{t('startMenu.roleBadge')}
				</span>
			</div>
		</div>
	);
}
