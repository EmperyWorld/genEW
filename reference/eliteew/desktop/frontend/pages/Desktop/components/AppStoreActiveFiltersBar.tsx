/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Полоса активных фильтров каталога магазина — снимаемые chips для поиска,
 * категории, вида и сортировки.
 *
 * Invariants:
 * - Только UI; сброс делегируется AppStore через callbacks.
 *
 * Related:
 * - AppStore.tsx, MarketingCabinet filter strips
 * - DesktopChromeTooltip.tsx
 */

import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { cn } from '@/utils/cn';
import type { ReactElement } from 'react';
import type { TFunction } from 'i18next';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { DesktopAppButton, DesktopAppSectionLabel } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { useAppStoreShellClasses } from '../hooks/useAppStoreShellClasses';

export type AppStoreActiveFiltersBarProps = {
	t: TFunction<'appStore'>;
	debouncedSearch: string;
	activeCategory: string | 'all';
	activeCategoryLabel: string;
	viewFilter: 'all' | 'installed' | 'available';
	sortMode: 'catalog' | 'name' | 'price';
	onClearSearch: () => void;
	onClearCategory: () => void;
	onClearViewFilter: () => void;
	onClearSort: () => void;
	onClearAll: () => void;
};

type FilterChip = {
	id: string;
	label: string;
	onRemove: () => void;
};

export function AppStoreActiveFiltersBar({
	t,
	debouncedSearch,
	activeCategory,
	activeCategoryLabel,
	viewFilter,
	sortMode,
	onClearSearch,
	onClearCategory,
	onClearViewFilter,
	onClearSort,
	onClearAll,
}: AppStoreActiveFiltersBarProps): ReactElement | null {
	const { filterStrip, toolbarCluster } = useAppStoreShellClasses();
	const chips: FilterChip[] = [];

	if (debouncedSearch) {
		chips.push({
			id: 'search',
			label: t('filters.chipSearch', { query: debouncedSearch }),
			onRemove: onClearSearch,
		});
	}
	if (activeCategory !== 'all') {
		chips.push({
			id: 'category',
			label: t('filters.chipCategory', { name: activeCategoryLabel }),
			onRemove: onClearCategory,
		});
	}
	if (viewFilter === 'installed') {
		chips.push({
			id: 'view-installed',
			label: t('filters.chipViewInstalled'),
			onRemove: onClearViewFilter,
		});
	} else if (viewFilter === 'available') {
		chips.push({
			id: 'view-available',
			label: t('filters.chipViewAvailable'),
			onRemove: onClearViewFilter,
		});
	}
	if (sortMode === 'name') {
		chips.push({
			id: 'sort-name',
			label: t('filters.chipSortName'),
			onRemove: onClearSort,
		});
	} else if (sortMode === 'price') {
		chips.push({
			id: 'sort-price',
			label: t('filters.chipSortPrice'),
			onRemove: onClearSort,
		});
	}

	if (chips.length === 0) {
		return null;
	}

	return (
		<section
			className={cn('mb-5', filterStrip, toolbarCluster)}
			aria-label={t('filters.chipsAria')}
		>
			<DesktopAppSectionLabel className="as-meta-caption shrink-0 self-center">
				{t('filter.label')}
			</DesktopAppSectionLabel>
			<ul className="flex min-w-0 flex-1 list-none flex-wrap gap-1.5">
				{chips.map((chip) => (
					<li key={chip.id}>
						<DesktopChromeTooltip
							content={t('filters.removeChip', { label: chip.label })}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="sm"
								className={cn(
									'h-auto max-w-full gap-1 rounded-full border border-(--desktop-border-subtle)/60 bg-(--desktop-surface-soft)/60 py-1 pl-2.5 pr-1.5 ring-1 ring-inset ring-[rgb(var(--desktop-fg-primary-rgb)/0.04)]',
									DESKTOP_TYPOGRAPHY.captionInherit
								)}
								aria-label={t('filters.removeChip', { label: chip.label })}
								onClick={chip.onRemove}
							>
								<span className="truncate">{chip.label}</span>
								<XMarkIcon
									className="h-3.5 w-3.5 shrink-0 opacity-70"
									aria-hidden
								/>
							</DesktopAppButton>
						</DesktopChromeTooltip>
					</li>
				))}
			</ul>
			{chips.length > 1 ? (
				<DesktopChromeTooltip
					content={t('empty.resetFilters')}
					placement="top"
					offsetExtra={4}
				>
					<DesktopAppButton
						type="button"
						variant="neutral"
						size="sm"
						className={cn(
							'shrink-0 rounded-full px-2.5',
							DESKTOP_TYPOGRAPHY.captionInherit
						)}
						onClick={onClearAll}
					>
						{t('empty.resetFilters')}
					</DesktopAppButton>
				</DesktopChromeTooltip>
			) : null}
		</section>
	);
}
