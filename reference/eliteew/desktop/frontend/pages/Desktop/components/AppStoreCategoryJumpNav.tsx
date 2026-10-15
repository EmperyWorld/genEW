/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Горизонтальная навигация «перейти к категории» в режиме «Все» каталога.
 *
 * Invariants:
 * - Только scrollIntoView к секции; не меняет фильтры.
 *
 * Related:
 * - AppStore.tsx
 * - DesktopChromeTooltip.tsx
 */

import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { cn } from '@/utils/cn';
import type { ReactElement } from 'react';
import type { TFunction } from 'i18next';
import { DesktopAppButton } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { appStoreCategoryJumpMobileScrollClass } from '../utils/appStoreCompactCardUi';

export type AppStoreCategoryJumpNavProps = {
	t: TFunction<'appStore'>;
	categories: ReadonlyArray<{ id: string; label: string; count: number }>;
	/** desktop — wrap pills; mobile — horizontal scroll strip. */
	variant?: 'desktop' | 'mobile';
};

export function AppStoreCategoryJumpNav({
	t,
	categories,
	variant = 'desktop',
}: AppStoreCategoryJumpNavProps): ReactElement | null {
	if (categories.length < 2) {
		return null;
	}

	const jumpToCategory = (categoryId: string) => {
		document.getElementById(`store-category-${categoryId}`)?.scrollIntoView({
			behavior: 'smooth',
			block: 'start',
		});
	};

	return (
		<nav
			className={cn(
				'mb-5',
				variant === 'desktop' ? 'hidden lg:block' : 'lg:hidden'
			)}
			aria-label={t('categoryJump.aria')}
		>
			<div
				className={cn(
					variant === 'mobile'
						? appStoreCategoryJumpMobileScrollClass
						: 'flex flex-wrap gap-1.5'
				)}
			>
				{categories.map((c) => (
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
							className={cn(
								'rounded-full px-3',
								DESKTOP_TYPOGRAPHY.captionInherit,
								variant === 'mobile' && 'shrink-0'
							)}
							onClick={() => jumpToCategory(c.id)}
						>
							{c.label}
							<span className="ml-1 tabular-nums text-(--desktop-text-dim)">
								({c.count})
							</span>
						</DesktopAppButton>
					</DesktopChromeTooltip>
				))}
			</div>
		</nav>
	);
}
