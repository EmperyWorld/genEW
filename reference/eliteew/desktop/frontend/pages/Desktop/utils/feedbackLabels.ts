/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Labels and badge classes for feedback tickets (desktop Feedback hub + admin).
 *
 * Invariants:
 * - API values stay English (open, wish, …); display via i18n when `t` is passed.
 *
 * Related:
 * - `desktopUi.adminFeedback.statuses` / `kinds`
 */

import type { TFunction } from 'i18next';

export const FEEDBACK_STATUSES = [
	'open',
	'in_progress',
	'resolved',
	'closed',
] as const;

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export function feedbackStatusLabel(
	s: string,
	t?: TFunction<'desktopUi'>
): string {
	if (t) {
		const key = `adminFeedback.statuses.${s}`;
		const label = t(key);
		return label === key ? s : label;
	}
	switch (s) {
		case 'open':
			return 'Открыто';
		case 'in_progress':
			return 'В работе';
		case 'resolved':
			return 'Решено';
		case 'closed':
			return 'Закрыто';
		default:
			return s;
	}
}

export type FeedbackKind = 'wish' | 'bug';

export function feedbackKindLabel(
	kind: string,
	t?: TFunction<'desktopUi'>
): string {
	if (t) {
		const key = `adminFeedback.kinds.${kind}`;
		const label = t(key);
		return label === key ? kind : label;
	}
	switch (kind) {
		case 'wish':
			return 'Пожелание';
		case 'bug':
			return 'Ошибка';
		default:
			return kind;
	}
}

/** Tailwind classes for small bordered pills (desktop + admin). */
export function feedbackKindBadgeClass(kind: string): string {
	switch (kind) {
		case 'bug':
			return 'border-rose-500/35 bg-rose-500/10 text-rose-100';
		case 'wish':
			return 'border-cyan-500/35 bg-cyan-500/10 text-cyan-100';
		default:
			return 'border-white/15 bg-white/5 text-slate-200';
	}
}

export function feedbackStatusBadgeClass(status: string): string {
	switch (status) {
		case 'open':
			return 'border-sky-400/35 bg-sky-500/15 text-sky-100';
		case 'in_progress':
			return 'border-amber-400/35 bg-amber-500/15 text-amber-100';
		case 'resolved':
			return 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100';
		case 'closed':
			return 'border-white/15 bg-slate-800/80 text-slate-300';
		default:
			return 'border-white/15 bg-white/5 text-slate-300';
	}
}
