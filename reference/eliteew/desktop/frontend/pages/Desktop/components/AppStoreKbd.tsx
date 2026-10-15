/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Единый chip для отображения клавиш в App Store (sidebar hints, поиск `/`).
 *
 * Invariants:
 * - Только presentation; без обработки keyboard events.
 *
 * Related:
 * - AppStoreKeyboardHints.tsx, AppStore.tsx
 */

import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { cn } from '@/utils/cn';
import type { ReactElement } from 'react';

export type AppStoreKbdProps = {
	children: string;
	className?: string;
	'aria-hidden'?: boolean | 'true' | 'false';
};

export function AppStoreKbd({
	children,
	className,
	'aria-hidden': ariaHidden,
}: AppStoreKbdProps): ReactElement {
	return (
		<kbd
			className={cn(
				'inline-flex min-w-[1.25rem] items-center justify-center rounded border border-(--desktop-border-subtle)/70 bg-[color-mix(in_srgb,var(--desktop-surface-soft)_92%,transparent)] px-1 py-0.5 font-mono font-medium text-(--desktop-text-dim) shadow-[0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.05)_inset]',
				DESKTOP_TYPOGRAPHY.captionInherit,
				className
			)}
			aria-hidden={ariaHidden}
		>
			{children}
		</kbd>
	);
}
