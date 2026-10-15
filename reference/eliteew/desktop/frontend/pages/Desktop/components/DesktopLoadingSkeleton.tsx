/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T <keysray70@gmail.com>
 * ---
 *
 * Purpose:
 * CSS-only skeleton and branded loading card for the EliteEW Безраздельный мир shell.
 *
 * Invariants:
 * - Skeleton must stay motion-light and respect `prefers-reduced-motion` through Tailwind motion-reduce classes.
 * - Text stays user-facing; no backend/storage internals are shown while config loads.
 *
 * Related:
 * - `DesktopWorkspaceLoadingShell.tsx`
 * - `src/i18n/locales/ru/desktopUi.json`
 */

import * as React from 'react';
import type { ElitePreloaderProgressVariant } from '@/components/ui/ElitePreloaderProgressQuote';
import { pickEliteTechnicalQuote } from '@/components/ui/eliteTechnicalQuotes';
import { ElitePreloaderPanel } from '@/components/ui/ElitePreloaderPanel';

const DESKTOP_LOADING_SKELETON_KEYS = Array.from(
	{ length: 12 },
	(_, i) => `dsk-sk-${i}`
);
const DESKTOP_LOADING_TASKBAR_KEYS = [
	'dsk-tb-0',
	'dsk-tb-1',
	'dsk-tb-2',
] as const;

/** Skeleton shown while desktop config/items are loading (CSS-only pulse) */
export function DesktopLoadingSkeleton({
	loadingLabel,
	preloaderVariant = 'boot',
}: {
	loadingLabel: string;
	preloaderVariant?: ElitePreloaderProgressVariant;
}): React.JSX.Element {
	const bootQuote = React.useMemo(() => pickEliteTechnicalQuote(), []);

	return (
		<div
			className="absolute inset-0 flex flex-col"
			role="status"
			aria-busy="true"
			aria-label={loadingLabel}
		>
			<div className="flex-1 p-8 grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-6 content-start max-w-4xl">
				{DESKTOP_LOADING_SKELETON_KEYS.map((skelKey, i) => (
					<div
						key={skelKey}
						className="flex flex-col items-center gap-2 motion-safe:ew-skeleton-pulse motion-reduce:animate-none motion-reduce:opacity-80"
						style={{ animationDelay: `${i * 0.06}s` }}
					>
						<div className="w-14 h-14 rounded-xl bg-[rgb(var(--desktop-fg-primary-rgb)/0.1)]" />
						<div className="w-16 h-3 rounded bg-[rgb(var(--desktop-fg-primary-rgb)/0.1)]" />
					</div>
				))}
			</div>
			<div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5">
				<ElitePreloaderPanel
					quote={preloaderVariant === 'boot' ? bootQuote : undefined}
					quoteAnimate={preloaderVariant === 'recovery'}
					variant={preloaderVariant}
				/>
			</div>
			<div className="h-10 bg-(--desktop-surface-soft) border-t border-(--desktop-border-subtle) flex items-center px-3 gap-2">
				<div className="size-8 rounded-[0.65rem] bg-[rgb(var(--desktop-fg-primary-rgb)/0.1)] motion-safe:animate-pulse motion-reduce:animate-none" />
				<div className="flex-1 flex gap-1.5">
					{DESKTOP_LOADING_TASKBAR_KEYS.map((skelKey, i) => (
						<div
							key={skelKey}
							className="w-10 h-6 rounded-md bg-[rgb(var(--desktop-fg-primary-rgb)/0.1)] motion-safe:animate-pulse motion-reduce:animate-none"
							style={{ animationDelay: `${i * 0.1}s` }}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
