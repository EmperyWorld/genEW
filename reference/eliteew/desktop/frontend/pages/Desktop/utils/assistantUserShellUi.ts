/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Пользовательские классы Справочника: accent и surface tokens рабочего стола, без operator amber/rose.
 *
 * Invariants:
 * - CSS-переменные наследуются от `#desktop-main` / DesktopAppContentWrapper.
 *
 * Related:
 * - pages/Desktop/components/AssistantApp.tsx
 * - hooks/useDesktopShellTheme.ts
 */

import { cn } from '@/utils/cn';
import type { DesktopShellTheme } from '@/hooks/useDesktopShellTheme';

/** Успех (копирование, «помогло») — читаемо в light/dark shell. */
export function assistantSuccessIconClass(theme: DesktopShellTheme): string {
	return theme === 'light' ? 'text-emerald-700' : 'text-emerald-300/95';
}

/** Подсказка / вторичный статус в баннерах. */
export function assistantHintTextClass(theme: DesktopShellTheme): string {
	return theme === 'light'
		? 'text-(--desktop-text-muted)'
		: 'text-(--desktop-text-dim)';
}

/** Ответ из блока «Частые вопросы» — accent shell. */
export const ASSISTANT_FAQ_HINT_BUBBLE_CLASS = cn(
	'border border-dashed border-(--desktop-border-subtle)/85',
	'border-l-[3px] border-l-[rgb(var(--desktop-accent-rgb)/0.52)]',
	'bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb))_7%,var(--desktop-surface-panel))]'
);

export const ASSISTANT_MESSAGE_AUTHOR_CLASS = cn(
	'text-[11px] font-medium leading-none text-(--desktop-text-dim)'
);

export const ASSISTANT_MESSAGE_AUTHOR_ASSISTANT_CLASS = cn(
	ASSISTANT_MESSAGE_AUTHOR_CLASS,
	'text-[rgb(var(--desktop-accent-rgb)/0.88)]'
);

export const ASSISTANT_USER_BUBBLE_SHELL_CLASS = cn(
	'border border-[rgb(var(--desktop-accent-rgb)/0.22)]',
	'bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb))_10%,var(--desktop-surface-panel))]',
	'shadow-[0_1px_0_color-mix(in_srgb,var(--desktop-border-subtle)_55%,transparent)]'
);

export const ASSISTANT_ASSISTANT_BUBBLE_SHELL_CLASS =
	'border-l-[3px] border-l-[rgb(var(--desktop-accent-rgb)/0.55)]';

export const ASSISTANT_STREAMING_THINKING_CLASS = cn(
	'inline-flex items-center gap-2 text-xs text-(--desktop-text-muted)'
);

export const ASSISTANT_FAQ_SIDEBAR_HINT_DOT_CLASS =
	'h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--desktop-accent-rgb)/0.85)] ring-2 ring-(--desktop-surface-panel)';

export const ASSISTANT_FAQ_COUNT_BADGE_SHELL_CLASS = cn(
	'border border-[rgb(var(--desktop-accent-rgb)/0.22)]',
	'bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb))_8%,var(--desktop-surface-panel))]',
	'text-[rgb(var(--desktop-accent-rgb)/0.92)]'
);
