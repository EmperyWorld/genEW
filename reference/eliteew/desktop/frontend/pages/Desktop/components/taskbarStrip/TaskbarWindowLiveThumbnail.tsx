/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Live-style window thumbnail for taskbar hover preview when `TASKBAR_WINDOW_PREVIEW` is enabled.
 *
 * Invariants:
 * - Respects reduce-motion: no scale animation when user prefers reduced motion.
 * - Does not capture DOM pixels (window layer is plan 02); uses aspect-ratio mock from window state.
 *
 * Related:
 * - `TaskbarWindowPreviewFlyout.tsx`, `DESKTOP_FEATURE_FLAGS.TASKBAR_WINDOW_PREVIEW`
 */

import * as React from 'react';
import { cn } from '@/utils/cn';
import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import type { WindowState } from '../../types/desktop.types';

export type TaskbarWindowLiveThumbnailProps = {
	window: WindowState;
	reduceMotion: boolean;
	children: React.ReactNode;
};

export function TaskbarWindowLiveThumbnail({
	window,
	reduceMotion,
	children,
}: TaskbarWindowLiveThumbnailProps): React.JSX.Element {
	const aspect =
		window.size.width > 0 && window.size.height > 0
			? window.size.width / window.size.height
			: 16 / 10;

	return (
		<div
			className={cn(
				'relative w-full overflow-hidden rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)',
				!reduceMotion &&
					'motion-safe:transition-transform motion-safe:duration-200'
			)}
			style={{ aspectRatio: String(aspect) }}
			data-testid="taskbar-window-live-thumbnail"
		>
			<div className="absolute inset-0 bg-linear-to-br from-[rgb(var(--desktop-bg-primary-rgb))] via-[rgb(var(--desktop-bg-secondary-rgb))] to-[rgb(var(--desktop-accent-rgb)/0.08)]" />
			<div className="relative flex h-full flex-col">
				<div className="flex h-6 shrink-0 items-center gap-1 border-b border-(--desktop-border-subtle)/60 px-2">
					<span className="size-1.5 rounded-full bg-red-400/70" aria-hidden />
					<span className="size-1.5 rounded-full bg-amber-300/70" aria-hidden />
					<span className="size-1.5 rounded-full bg-lime-400/70" aria-hidden />
				</div>
				<div className="flex flex-1 items-center justify-center p-3">
					{children}
				</div>
			</div>
			{window.isMinimized ? (
				<div
					className={cn(
						DESKTOP_TYPOGRAPHY.micro,
						'absolute bottom-1 right-1 rounded bg-black/40 px-1 py-0.5 text-white/90'
					)}
				>
					min
				</div>
			) : null}
		</div>
	);
}
