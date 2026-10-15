/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Progressive-disclosure section for Personalize tab (fine-tune / looks tiers).
 *
 * Invariants:
 * - Default collapsed unless `defaultOpen`.
 *
 * Related:
 * - `DesktopSettingsPersonalizeTab.tsx`
 */
import { cn } from '@/utils/cn';
import type { FC, ReactNode } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { DESKTOP_CHROME_FOCUS_VISIBLE } from '../../DesktopAppChrome';
import { DESKTOP_TYPOGRAPHY } from '../../../constants';

export const DesktopSettingsPersonalizeDisclosure: FC<{
	title: string;
	description?: string;
	defaultOpen?: boolean;
	children: ReactNode;
	'test-id'?: string;
}> = ({
	title,
	description,
	defaultOpen = false,
	children,
	'test-id': testId,
}) => (
	<details
		className="group rounded-(--desktop-radius-lg) border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/40 open:bg-(--desktop-surface-soft)/55"
		defaultOpen={defaultOpen}
		data-testid={testId}
	>
		<summary
			className={cn(
				'flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden',
				DESKTOP_CHROME_FOCUS_VISIBLE
			)}
		>
			<span className="min-w-0">
				<span
					className={cn(
						'block font-medium text-(--desktop-text-primary)',
						DESKTOP_TYPOGRAPHY.body
					)}
				>
					{title}
				</span>
				{description ? (
					<span
						className={cn(
							'mt-0.5 block text-(--desktop-text-dim)',
							DESKTOP_TYPOGRAPHY.captionInherit
						)}
					>
						{description}
					</span>
				) : null}
			</span>
			<ChevronDownIcon
				className="mt-0.5 h-5 w-5 shrink-0 text-(--desktop-text-muted) transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
				aria-hidden
			/>
		</summary>
		<div className="space-y-5 border-t border-(--desktop-border-subtle)/70 px-3 pb-4 pt-4 sm:px-4">
			{children}
		</div>
	</details>
);
