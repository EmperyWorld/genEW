/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared visual primitives for Desktop Settings Center (style pickers, alerts, loading skeletons).
 *
 * Invariants:
 * - Tokens align with `DesktopSettingsPanel` status strip and `DESKTOP_CHROME_FOCUS_VISIBLE`.
 *
 * Related:
 * - `DesktopSettingsFormCard.tsx`, tab modules under `settings/`
 */

import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { DESKTOP_TYPOGRAPHY } from '../../constants';
import { DESKTOP_CHROME_FOCUS_VISIBLE } from '../DesktopAppChrome';

export type SettingsInlineAlertTone =
	| 'warning'
	| 'error'
	| 'success'
	| 'neutral';

export function desktopSettingsInlineAlertClassName(
	tone: SettingsInlineAlertTone,
	className?: string
): string {
	return cn(
		'flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 leading-snug',
		DESKTOP_TYPOGRAPHY.captionInherit,
		tone === 'error' &&
			'border-red-500/35 bg-red-500/10 text-(--desktop-text-primary)',
		tone === 'warning' &&
			'border-amber-500/35 bg-amber-500/10 text-(--desktop-text-primary)',
		tone === 'success' &&
			'border-[rgb(var(--desktop-accent-rgb))]/30 bg-(--desktop-surface-accent)/50 text-(--desktop-text-primary)',
		tone === 'neutral' &&
			'border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-secondary)',
		className
	);
}

export function SettingsInlineAlert({
	tone,
	icon,
	children,
	className,
	...rest
}: {
	tone: SettingsInlineAlertTone;
	icon?: ReactNode;
	children: ReactNode;
	className?: string;
} & ComponentPropsWithoutRef<'div'>) {
	return (
		<div
			className={desktopSettingsInlineAlertClassName(tone, className)}
			{...rest}
		>
			{icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}

/** Style picker tile used in Chrome, Icons, and Shell widget-style grids. */
export function desktopSettingsStylePickerCardClass(
	active: boolean,
	className?: string
): string {
	return cn(
		'relative flex w-full flex-col items-stretch gap-2 overflow-hidden rounded-2xl border px-3 pb-3 pt-2.5 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 motion-reduce:transition-none outline-none',
		DESKTOP_CHROME_FOCUS_VISIBLE,
		active
			? 'border-[rgb(var(--desktop-accent-rgb))] bg-[rgb(var(--desktop-accent-rgb)/0.14)] ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.38)] shadow-[0_14px_40px_rgba(0,0,0,0.2)]'
			: 'border-(--desktop-border-subtle) hover:border-(--desktop-border-strong) hover:bg-(--desktop-surface-soft) motion-safe:hover:-translate-y-px',
		className
	);
}

export function ExpansionCardSkeleton() {
	return (
		<div
			className="animate-pulse space-y-3 rounded-2xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/55 p-5 motion-reduce:animate-none"
			aria-hidden
		>
			<div className="h-3 w-36 rounded-md bg-(--desktop-surface-panel)" />
			<div className="h-2.5 max-w-md rounded-md bg-(--desktop-surface-panel)/75" />
			<div className="grid gap-2.5 pt-1 sm:grid-cols-2">
				<div className="h-11 rounded-xl bg-(--desktop-surface-panel)/70" />
				<div className="h-11 rounded-xl bg-(--desktop-surface-panel)/70" />
			</div>
		</div>
	);
}

export function DesktopSettingsTabLoadingFallback({
	label,
}: {
	label: string;
}) {
	return (
		<div
			className={cn(
				DESKTOP_TYPOGRAPHY.caption,
				'flex items-center gap-2.5 text-(--desktop-text-dim)'
			)}
			role="status"
			aria-live="polite"
		>
			<span
				className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-(--desktop-border-subtle) border-t-[rgb(var(--desktop-accent-rgb))] motion-reduce:animate-none"
				aria-hidden
			/>
			{label}
		</div>
	);
}
