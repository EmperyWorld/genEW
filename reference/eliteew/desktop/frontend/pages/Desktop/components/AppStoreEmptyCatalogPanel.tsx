/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Empty state каталога магазина — подсказки, сброс фильтров, быстрые категории.
 *
 * Invariants:
 * - Только UI; callbacks делегируются AppStore.
 *
 * Related:
 * - AppStore.tsx, AppStoreSectionPanel.tsx
 * - DesktopChromeTooltip.tsx
 */

import { cn } from '@/utils/cn';
import type { ReactElement } from 'react';
import type { TFunction } from 'i18next';
import {
	BuildingStorefrontIcon,
	MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import {
	DesktopAppButton,
	DesktopAppSectionLabel,
	DesktopProductStatePanel,
} from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { useAppStoreShellClasses } from '../hooks/useAppStoreShellClasses';

export type AppStoreEmptyCatalogPanelProps = {
	t: TFunction<'appStore'>;
	activeCategory: string | 'all';
	debouncedSearch: string;
	viewFilter: 'all' | 'installed' | 'available';
	filtersActive: boolean;
	suggestedCategories: ReadonlyArray<{
		id: string;
		label: string;
		count: number;
	}>;
	onClearFilters: () => void;
	onSelectCategory: (categoryId: string) => void;
	onClearSearch: () => void;
	panelId?: string;
};

export function AppStoreEmptyCatalogPanel({
	t,
	activeCategory,
	debouncedSearch,
	viewFilter,
	filtersActive,
	suggestedCategories,
	onClearFilters,
	onSelectCategory,
	onClearSearch,
	panelId,
}: AppStoreEmptyCatalogPanelProps): ReactElement {
	const { statusChip } = useAppStoreShellClasses();
	const categoryOnlyFilter =
		activeCategory !== 'all' && !debouncedSearch && viewFilter === 'all';

	const description = filtersActive
		? categoryOnlyFilter
			? t('empty.filteredDesc')
			: t('empty.noMatchFilters')
		: t('empty.noAppsDesc');

	return (
		<DesktopProductStatePanel
			id={panelId}
			state="empty"
			title={t('empty.title')}
			description={description}
			icon={
				debouncedSearch ? (
					<MagnifyingGlassIcon className="h-4 w-4" aria-hidden />
				) : (
					<BuildingStorefrontIcon className="h-4 w-4" aria-hidden />
				)
			}
			className="min-h-72 border border-dashed border-(--desktop-border-subtle)/70"
			actions={
				<>
					{debouncedSearch ? (
						<DesktopChromeTooltip
							content={t('search.clear')}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="neutral"
								size="sm"
								onClick={onClearSearch}
							>
								{t('search.clear')}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					) : null}
					{categoryOnlyFilter ? (
						<DesktopChromeTooltip
							content={t('empty.allApps')}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="accent"
								size="sm"
								onClick={() => onSelectCategory('all')}
							>
								{t('empty.allApps')}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					) : null}
					{filtersActive && !categoryOnlyFilter ? (
						<DesktopChromeTooltip
							content={t('empty.resetFilters')}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="accent"
								size="sm"
								onClick={onClearFilters}
							>
								{t('empty.resetFilters')}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					) : null}
				</>
			}
		>
			{suggestedCategories.length > 0 ? (
				<div className="w-full max-w-md">
					<DesktopAppSectionLabel className="as-meta-caption mb-2 block">
						{t('empty.tryCategories')}
					</DesktopAppSectionLabel>
					<div className="flex flex-wrap justify-center gap-2">
						{suggestedCategories.map((c) => (
							<DesktopChromeTooltip
								key={c.id}
								content={`${c.label} (${c.count})`}
								placement="top"
								offsetExtra={4}
							>
								<DesktopAppButton
									type="button"
									variant="ghost"
									size="sm"
									className={cn(statusChip, 'rounded-full px-3')}
									onClick={() => onSelectCategory(c.id)}
								>
									{c.label}
									<span className="ml-1.5 tabular-nums text-(--desktop-text-dim)">
										({c.count})
									</span>
								</DesktopAppButton>
							</DesktopChromeTooltip>
						))}
					</div>
				</div>
			) : null}
		</DesktopProductStatePanel>
	);
}
