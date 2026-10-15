/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Glass-панель секции каталога магазина (как Marketing Cabinet SectionPanel).
 *
 * Invariants:
 * - Обёртка layout; children — контент секции (сетка, горизонтальный scroll).
 *
 * Related:
 * - AppStoreSectionHeading.tsx, SectionPanel.tsx
 */

import { cn } from '@/utils/cn';
import type { ReactElement, ReactNode } from 'react';
import { AppStoreSectionHeading } from './AppStoreSectionHeading';
import { useAppStoreShellClasses } from '../hooks/useAppStoreShellClasses';

export type AppStoreSectionPanelProps = {
	title: string;
	description?: string;
	headingId?: string;
	icon?: ReactNode;
	count?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
	/** Skip inner glass panel — only heading + children (e.g. full-width grid). */
	bare?: boolean;
};

export function AppStoreSectionPanel({
	title,
	description,
	headingId,
	icon,
	count,
	actions,
	children,
	className,
	bare = false,
}: AppStoreSectionPanelProps): ReactElement {
	const { contentPanel, sectionPanelShadow } = useAppStoreShellClasses();

	if (bare) {
		return (
			<section className={cn('as-section-root mb-8 md:mb-9', className)}>
				<AppStoreSectionHeading
					title={title}
					description={description}
					headingId={headingId}
					icon={icon}
					count={count}
					actions={actions}
				/>
				{children}
			</section>
		);
	}

	return (
		<section
			className={cn(
				'as-section-root relative mb-8 flex flex-col gap-3 rounded-(--desktop-radius-frame) p-3 lg:p-4',
				contentPanel,
				sectionPanelShadow,
				className
			)}
		>
			<AppStoreSectionHeading
				title={title}
				description={description}
				headingId={headingId}
				icon={icon}
				count={count}
				actions={actions}
				className="mb-0 border-b-0 pb-0"
			/>
			<div className="border-t border-(--desktop-border-subtle)/55 pt-4">
				{children}
			</div>
		</section>
	);
}
