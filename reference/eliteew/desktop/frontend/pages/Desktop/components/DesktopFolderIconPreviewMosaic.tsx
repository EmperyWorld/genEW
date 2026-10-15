/**
 * 2×2 mosaic of direct folder children on desktop folder icons (decorative).
 */

import { cn } from '@/utils/cn';
import * as React from 'react';
import { memo } from 'react';
import type { DesktopIconStyle } from '@/types/profile';
import { DESKTOP_LUCIDE, type IconSizePreference } from '../constants';
import type { DesktopFolderPreviewEntry } from '../types/desktop.types';
import { DesktopAppSymbol } from '../utils/desktopVisualSystem';
import {
	ArchiveBoxIcon,
	CodeBracketIcon,
	DocumentTextIcon,
	FilmIcon,
	FolderIcon,
	MusicalNoteIcon,
	PhotoIcon,
} from '@heroicons/react/24/outline';

const PREVIEW_BOX: Record<IconSizePreference, string> = {
	small: 'h-3.5 w-3.5',
	medium: 'h-4 w-4',
	large: 'h-5 w-5',
};

function PreviewGlyph({
	entry,
	iconSize,
	iconStyle,
}: {
	entry: DesktopFolderPreviewEntry;
	iconSize: IconSizePreference;
	iconStyle: DesktopIconStyle;
}) {
	const box = PREVIEW_BOX[iconSize] ?? PREVIEW_BOX.medium;
	const svg = 'h-[72%] w-[72%]';
	switch (entry.type) {
		case 'app':
			return (
				<span
					className={cn(
						'flex items-center justify-center overflow-hidden',
						box
					)}
				>
					<DesktopAppSymbol
						appComponent={entry.appComponent}
						iconStyle={iconStyle}
						className="h-full w-full max-h-full max-w-full"
					/>
				</span>
			);
		case 'folder':
			return (
				<span className={cn('flex items-center justify-center', box)}>
					<FolderIcon
						className={cn(svg, 'text-(--desktop-text-secondary)')}
						strokeWidth={DESKTOP_LUCIDE.stroke}
					/>
				</span>
			);
		default: {
			const ft = entry.fileType;
			const inner = (() => {
				switch (ft) {
					case 'image':
					case 'png':
					case 'jpg':
					case 'jpeg':
						return (
							<PhotoIcon
								className={cn(svg, 'text-(--desktop-text-secondary)')}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						);
					case 'video':
					case 'mp4':
					case 'mov':
						return (
							<FilmIcon
								className={cn(svg, 'text-(--desktop-text-secondary)')}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						);
					case 'audio':
					case 'mp3':
					case 'wav':
						return (
							<MusicalNoteIcon
								className={cn(svg, 'text-(--desktop-text-secondary)')}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						);
					case 'archive':
					case 'zip':
						return (
							<ArchiveBoxIcon
								className={cn(svg, 'text-(--desktop-text-secondary)')}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						);
					case 'code':
						return (
							<CodeBracketIcon
								className={cn(svg, 'text-(--desktop-text-secondary)')}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						);
					default:
						return (
							<DocumentTextIcon
								className={cn(svg, 'text-(--desktop-text-secondary)')}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						);
				}
			})();
			return (
				<span className={cn('flex items-center justify-center', box)}>
					{inner}
				</span>
			);
		}
	}
}

export const DesktopFolderIconPreviewMosaic: React.FC<{
	entries: readonly DesktopFolderPreviewEntry[];
	iconSize: IconSizePreference;
	visualStyle: DesktopIconStyle;
}> = memo(({ entries, iconSize, visualStyle }) => {
	if (entries.length === 0) return null;
	const slots: (DesktopFolderPreviewEntry | null)[] = [...entries];
	while (slots.length < 4) slots.push(null);
	const show = slots.slice(0, 4) as (DesktopFolderPreviewEntry | null)[];

	return (
		<div
			aria-hidden
			className={cn(
				'pointer-events-none absolute left-[12%] right-[12%] bottom-[11%] h-[34%] rounded-lg',
				'border border-[rgb(var(--desktop-fg-primary-rgb)/0.12)]',
				'bg-[rgb(var(--desktop-bg-primary-rgb)/0.45)] backdrop-blur-[2px]',
				'grid grid-cols-2 grid-rows-2 gap-px p-px'
			)}
		>
			{show.map((slot, i) => (
				<div
					key={slot?.id ?? `e-${i}`}
					className={cn(
						'flex min-h-0 min-w-0 items-center justify-center rounded-[5px]',
						slot
							? 'bg-(--desktop-surface-soft)'
							: 'bg-[rgb(var(--desktop-fg-primary-rgb)/0.04)]'
					)}
				>
					{slot ? (
						<PreviewGlyph
							entry={slot}
							iconSize={iconSize}
							iconStyle={visualStyle}
						/>
					) : null}
				</div>
			))}
		</div>
	);
});
DesktopFolderIconPreviewMosaic.displayName = 'DesktopFolderIconPreviewMosaic';
