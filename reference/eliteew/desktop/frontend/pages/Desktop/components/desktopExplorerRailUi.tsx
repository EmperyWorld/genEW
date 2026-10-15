/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared icon-only controls for collapsed folder explorer rails.
 *
 * Invariants:
 * - Folder monograms use first two non-space characters of the display name.
 *
 * Related:
 * - DesktopExplorerCollapsibleRail.tsx, DesktopChromeTooltip.tsx
 */

import { FolderIcon } from '@heroicons/react/24/outline';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

/** First two visible characters for collapsed folder chips (Cyrillic/Latin). */
export function folderNameMonogram(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return '??';
	const chars = [...trimmed].filter((ch) => !/\s/.test(ch));
	if (chars.length === 0) return '??';
	return chars.slice(0, 2).join('').toLocaleUpperCase();
}

const collapsedIconBtnBase = cn(
	'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-(--desktop-border-subtle)',
	'bg-(--desktop-surface-panel) text-(--desktop-text-secondary) transition-colors',
	'hover:border-(--desktop-border-strong) hover:bg-(--desktop-surface-soft-hover) hover:text-(--desktop-text-primary)',
	'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]',
	'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-(--desktop-surface-panel)'
);

export function DesktopExplorerRailIconButton({
	title,
	ariaLabel,
	onClick,
	disabled,
	active,
	accent,
	children,
}: {
	title: string;
	ariaLabel: string;
	onClick: () => void;
	disabled?: boolean;
	active?: boolean;
	accent?: boolean;
	children: ReactNode;
}): React.JSX.Element {
	return (
		<DesktopChromeTooltip content={title} placement="right" offsetExtra={6}>
			<button
				type="button"
				aria-label={ariaLabel}
				disabled={disabled}
				onClick={onClick}
				className={cn(
					collapsedIconBtnBase,
					active &&
						'border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.12)] text-[rgb(var(--desktop-accent-rgb))]',
					accent &&
						'border-[rgb(var(--desktop-accent-rgb)/0.35)] bg-[rgb(var(--desktop-accent-rgb)/0.14)] text-[rgb(var(--desktop-accent-rgb))]'
				)}
			>
				{children}
			</button>
		</DesktopChromeTooltip>
	);
}

export function DesktopExplorerFolderMonogramButton({
	name,
	title,
	ariaLabel,
	active,
	onClick,
	onDragOver,
	onDragLeave,
	onDrop,
}: {
	name: string;
	title: string;
	ariaLabel: string;
	active?: boolean;
	onClick: () => void;
	onDragOver?: (e: React.DragEvent) => void;
	onDragLeave?: (e: React.DragEvent) => void;
	onDrop?: (e: React.DragEvent) => void;
}): React.JSX.Element {
	const monogram = folderNameMonogram(name);
	return (
		<DesktopChromeTooltip content={title} placement="right" offsetExtra={6}>
			<button
				type="button"
				aria-label={ariaLabel}
				onClick={onClick}
				onDragOver={onDragOver}
				onDragLeave={onDragLeave}
				onDrop={onDrop}
				className={cn(
					collapsedIconBtnBase,
					'relative overflow-hidden font-semibold tabular-nums',
					active &&
						'border-[rgb(var(--desktop-accent-rgb)/0.5)] bg-[rgb(var(--desktop-accent-rgb)/0.14)] text-[rgb(var(--desktop-accent-rgb))] shadow-[0_0_12px_rgb(var(--desktop-accent-rgb)/0.2)]'
				)}
			>
				<FolderIcon
					className="pointer-events-none absolute inset-0 h-full w-full p-1.5 text-(--desktop-text-dim) opacity-35"
					aria-hidden
				/>
				<span className="relative z-1 text-[10px] leading-none tracking-tight">
					{monogram}
				</span>
			</button>
		</DesktopChromeTooltip>
	);
}
