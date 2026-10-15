/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Заголовок секции каталога магазина — визуальный parity с Marketing Cabinet SectionPanel.
 *
 * Invariants:
 * - Только presentation; без фильтров и API.
 *
 * Related:
 * - AppStore.tsx, AppStoreFeaturedRow.tsx, SectionPanel.tsx (Marketing Cabinet)
 */

import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { cn } from '@/utils/cn';
import type { ReactElement, ReactNode } from 'react';
import { appStoreSectionHeadingClass } from '../utils/appStoreCompactCardUi';
import { useAppStoreShellClasses } from '../hooks/useAppStoreShellClasses';

export type AppStoreSectionHeadingProps = {
	title: string;
	description?: string;
	headingId?: string;
	icon?: ReactNode;
	count?: ReactNode;
	actions?: ReactNode;
	className?: string;
};

export function AppStoreSectionHeading({
	title,
	description,
	headingId,
	icon,
	count,
	actions,
	className,
}: AppStoreSectionHeadingProps): ReactElement {
	const { insetIconTile } = useAppStoreShellClasses();

	return (
		<header
			className={cn(
				'mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-(--desktop-border-subtle)/60 pb-3.5',
				className
			)}
		>
			<div className="min-w-0 flex-1 space-y-1.5">
				<div className="flex flex-wrap items-center gap-2.5">
					<span
						className="h-px w-6 shrink-0 rounded-full bg-[linear-gradient(90deg,var(--mc-accent),transparent)] opacity-80"
						aria-hidden
					/>
					{icon ? (
						<span
							className={cn(
								insetIconTile,
								'text-(--desktop-text-primary) ring-1 ring-(--mc-accent-22)'
							)}
							aria-hidden
						>
							{icon}
						</span>
					) : null}
					<h3 id={headingId} className={appStoreSectionHeadingClass}>
						{title}
					</h3>
					{count}
				</div>
				{description ? (
					<p
						className={cn(
							DESKTOP_TYPOGRAPHY.body,
							'w-full max-w-none leading-6'
						)}
					>
						{description}
					</p>
				) : null}
			</div>
			{actions}
		</header>
	);
}
