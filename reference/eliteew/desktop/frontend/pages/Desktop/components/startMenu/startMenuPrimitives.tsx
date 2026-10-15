/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared Start Menu list/expansion row primitives used by Recent discovery and Work expansion.
 *
 * Invariants:
 * - Presentation helpers only; no Start Menu state ownership.
 *
 * Related:
 * - ./StartMenuRecentDiscovery.tsx
 * - ./StartMenuWorkExpansion.tsx
 */

import * as React from 'react';
import { cn } from '@/utils/cn';
import { DESKTOP_INTERACTIVE } from '../../constants';
import { DesktopChromeTooltip } from '../DesktopChromeTooltip';

export const START_MENU_LIST_ROW_CLASS = cn(
	'w-full rounded-xl border border-transparent px-3 py-2.5 text-left text-sm text-(--desktop-text-primary)',
	'transition-[background-color,border-color] duration-150 motion-reduce:transition-none',
	'hover:border-(--desktop-border-subtle) hover:bg-[color-mix(in_srgb,var(--desktop-surface-soft-hover)_72%,transparent)]',
	DESKTOP_INTERACTIVE.focusRing
);

export function startMenuFileRowTooltip(
	name: string,
	path?: string | null
): string {
	const label = name.trim();
	const sub = path?.trim();
	return sub ? `${label}\n${sub}` : label;
}

export function StartMenuListRowButton({
	tooltip,
	className,
	children,
	...rest
}: {
	tooltip: string;
	children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<DesktopChromeTooltip content={tooltip} placement="top" offsetExtra={4}>
			<button
				type="button"
				className={cn(START_MENU_LIST_ROW_CLASS, className)}
				{...rest}
			>
				{children}
			</button>
		</DesktopChromeTooltip>
	);
}

export const START_MENU_EXPANSION_CARD_CLASS = cn(
	'w-full rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2 text-left hover:border-(--desktop-border-strong) hover:bg-(--desktop-surface-soft-hover)',
	DESKTOP_INTERACTIVE.focusRing
);

export function StartMenuExpansionCardButton({
	tooltip,
	className,
	children,
	...rest
}: {
	tooltip: string;
	children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<DesktopChromeTooltip content={tooltip} placement="top" offsetExtra={4}>
			<button
				type="button"
				className={cn(START_MENU_EXPANSION_CARD_CLASS, className)}
				{...rest}
			>
				{children}
			</button>
		</DesktopChromeTooltip>
	);
}
