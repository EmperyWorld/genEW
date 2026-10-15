/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Renders the Start Menu's primary and progressively disclosed tab controls.
 *
 * Invariants:
 * - Categories and Recent are always available; Pinned, All, and Work require More.
 * - The active tab remains controlled by the Start Menu orchestrator.
 *
 * Related:
 * - ../StartMenu.tsx
 * - ../../types/desktopStartMenu.ts
 */

import type { TFunction } from 'i18next';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import type { StartMenuTab } from '../../types/desktopStartMenu';
import { DESKTOP_LUCIDE } from '../../constants';
import { DesktopAppButton } from '../DesktopAppChrome';

type Props = {
	activeTab: StartMenuTab;
	showMoreTabs: boolean;
	setActiveTab: (tab: StartMenuTab) => void;
	setShowMoreTabs: (show: boolean | ((current: boolean) => boolean)) => void;
	t: TFunction<'desktopUi'>;
};

const tabs: { id: StartMenuTab; label: string; ariaLabel: string }[] = [
	{
		id: 'categories',
		label: 'startMenu.tabCategories',
		ariaLabel: 'startMenu.tabCategoriesAria',
	},
	{
		id: 'recent',
		label: 'startMenu.tabRecent',
		ariaLabel: 'startMenu.tabRecentAria',
	},
	{
		id: 'pinned',
		label: 'startMenu.tabPinned',
		ariaLabel: 'startMenu.tabPinnedAria',
	},
	{ id: 'all', label: 'startMenu.tabAll', ariaLabel: 'startMenu.tabAllAria' },
	{
		id: 'work',
		label: 'startMenu.tabWork',
		ariaLabel: 'startMenu.tabWorkAria',
	},
];

export function StartMenuTabStrip({
	activeTab,
	showMoreTabs,
	setActiveTab,
	setShowMoreTabs,
	t,
}: Props) {
	const primaryTabButtons = tabs.filter(
		({ id }) => id === 'categories' || id === 'recent'
	);
	const secondaryTabButtons = tabs.filter(
		({ id }) => id === 'pinned' || id === 'all' || id === 'work'
	);

	return (
		<div className="relative z-1 shrink-0 px-4 pt-3 pb-2 max-sm:px-3 max-sm:pt-2 max-sm:pb-1.5">
			<div className="flex gap-1 rounded-2xl border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-soft)_92%,var(--desktop-surface-panel)_8%)] p-1 shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--desktop-text-primary)_6%,transparent)] max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:overscroll-x-contain max-sm:snap-x max-sm:snap-mandatory max-sm:scrollbar-none max-sm:[&::-webkit-scrollbar]:hidden sm:flex-wrap">
				{primaryTabButtons.map(({ id, label, ariaLabel }) => (
					<DesktopAppButton
						key={id}
						type="button"
						onClick={() => setActiveTab(id)}
						aria-pressed={activeTab === id}
						aria-label={t(ariaLabel)}
						size="md"
						variant={activeTab === id ? 'accent' : 'ghost'}
						className="shrink-0 snap-start rounded-xl px-3.5 py-1.5 max-sm:px-2.5 max-sm:py-1"
					>
						{t(label)}
					</DesktopAppButton>
				))}
				<DesktopAppButton
					type="button"
					onClick={() => setShowMoreTabs((visible) => !visible)}
					aria-expanded={showMoreTabs}
					aria-label={t('startMenu.moreTabsAria')}
					size="md"
					variant={showMoreTabs ? 'neutral' : 'ghost'}
					className="shrink-0 snap-start rounded-xl px-3.5 py-1.5 max-sm:px-2.5 max-sm:py-1"
				>
					<EllipsisHorizontalIcon
						className={DESKTOP_LUCIDE.sm}
						strokeWidth={DESKTOP_LUCIDE.stroke}
						aria-hidden
					/>
					<span className="ms-1.5">{t('startMenu.moreTabs')}</span>
				</DesktopAppButton>
				{showMoreTabs
					? secondaryTabButtons.map(({ id, label, ariaLabel }) => (
							<DesktopAppButton
								key={id}
								type="button"
								onClick={() => setActiveTab(id)}
								aria-pressed={activeTab === id}
								aria-label={t(ariaLabel)}
								size="md"
								variant={activeTab === id ? 'accent' : 'ghost'}
								className="shrink-0 snap-start rounded-xl px-3.5 py-1.5 max-sm:px-2.5 max-sm:py-1"
							>
								{t(label)}
							</DesktopAppButton>
						))
					: null}
			</div>
		</div>
	);
}
