/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared premium glass and pill chrome primitives for active companion surfaces.
 * Keeps repeated visual class chains in one local module without owning behavior or backend contracts.
 *
 * Invariants:
 * - Primitives are presentational only; they must not dispatch companion actions or call APIs.
 * - Focus styling stays aligned with Desktop chrome controls.
 *
 * Related:
 * - src/features/ewa/EwaCompanionQuickPresetsStrip.tsx
 * - src/features/ewa/companionLeftRailSection.tsx
 * - src/features/ewa/companionOutputSurface/CompanionMusicXlBaseWizardMode.tsx
 */
import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';

import { DESKTOP_CHROME_FOCUS_VISIBLE } from '@/pages/Desktop/components/DesktopAppChrome';
import { cn } from '@/utils/cn';

export type CompanionGlassCardTone =
	| 'aura'
	| 'muted'
	| 'popover'
	| 'caution'
	| 'mission';
export type CompanionPillTone =
	| 'neutral'
	| 'aura'
	| 'brand'
	| 'success'
	| 'info'
	| 'soft';

const GLASS_CARD_TONE_CLASS: Record<CompanionGlassCardTone, string> = {
	aura: cn(
		'border-(--companion-divider)',
		'bg-[radial-gradient(circle_at_0%_0%,var(--companion-bg),transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.42),rgba(15,23,42,0.20))]',
		'shadow-[0_10px_28px_rgba(2,6,23,0.14)]'
	),
	muted: 'border-white/10 bg-white/[0.05]',
	popover: cn(
		'border-(--companion-divider)',
		'bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.88))]',
		'shadow-2xl shadow-black/30 backdrop-blur-md'
	),
	/** Honest degrade / decision — calm amber edge, not alarm chrome */
	caution: cn(
		'border-amber-300/30',
		'bg-[linear-gradient(180deg,rgba(15,23,42,0.48),rgba(15,23,42,0.22))]',
		'shadow-[0_10px_28px_rgba(2,6,23,0.12)]'
	),
	/** Active mission canvas — shared cyan-soft glass */
	mission: cn(
		'border-(--companion-divider)',
		'bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.10),transparent_40%),linear-gradient(180deg,rgba(15,23,42,0.48),rgba(15,23,42,0.20))]',
		'shadow-[0_12px_32px_rgba(2,6,23,0.16)]'
	),
};

export function CompanionGlassCard({
	tone = 'aura',
	className,
	...props
}: HTMLAttributes<HTMLDivElement> & { tone?: CompanionGlassCardTone }) {
	return (
		<div
			className={cn(
				'rounded-2xl border',
				GLASS_CARD_TONE_CLASS[tone],
				className
			)}
			{...props}
		/>
	);
}

export function CompanionGlassSection({
	tone = 'aura',
	className,
	...props
}: HTMLAttributes<HTMLElement> & { tone?: CompanionGlassCardTone }) {
	return (
		<section
			className={cn(
				'rounded-2xl border',
				GLASS_CARD_TONE_CLASS[tone],
				className
			)}
			{...props}
		/>
	);
}

export function CompanionHeroCard({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<CompanionGlassCard
			className={cn(
				'overflow-hidden p-3',
				'bg-[radial-gradient(circle_at_15%_0%,var(--companion-glow),transparent_36%),linear-gradient(135deg,rgba(15,23,42,0.74),rgba(15,23,42,0.45))]',
				className
			)}
			{...props}
		/>
	);
}

export function CompanionIconTile({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				'shrink-0 rounded-2xl border border-(--companion-divider) bg-(--companion-bg) p-3 text-(--companion-aura)',
				className
			)}
			{...props}
		/>
	);
}

export const COMPANION_PILL_CHROME_CLASS = cn(
	'inline-flex shrink-0 items-center gap-1 rounded-full',
	'border border-white/10 bg-white/[0.06]',
	'px-2 py-1 text-[10px] font-medium text-(--desktop-text-secondary)',
	'shadow-sm shadow-black/10 hover:border-(--companion-divider) hover:bg-(--companion-bg)',
	'transition-[background-color,border-color,box-shadow] duration-150',
	DESKTOP_CHROME_FOCUS_VISIBLE
);

const COMPANION_PILL_TONE_CLASS: Record<CompanionPillTone, string> = {
	neutral: 'border-white/10 bg-white/[0.06] text-(--companion-text-soft)',
	aura: 'border-(--companion-divider) bg-(--companion-bg) text-(--companion-aura)',
	brand:
		'border-(--companion-aura) bg-(--companion-bg) text-(--companion-aura) shadow-[0_0_18px_var(--companion-glow)]',
	success: 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100',
	info: 'border-sky-300/30 bg-sky-400/10 text-sky-100',
	soft: 'border-white/10 bg-white/5 text-(--companion-text-soft)',
};

export function CompanionPillButton({
	className,
	...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button
			type="button"
			className={cn(COMPANION_PILL_CHROME_CLASS, className)}
			{...props}
		/>
	);
}

export function CompanionPillBadge({
	tone = 'neutral',
	className,
	...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: CompanionPillTone }) {
	return (
		<span
			className={cn(
				'shrink-0 rounded-full border',
				'px-2 py-0.5 tabular-nums text-[10px] font-medium',
				COMPANION_PILL_TONE_CLASS[tone],
				className
			)}
			{...props}
		/>
	);
}
