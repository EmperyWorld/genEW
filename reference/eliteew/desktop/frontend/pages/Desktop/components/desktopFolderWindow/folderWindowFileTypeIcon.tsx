/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Content-type icon mapping for Desktop folder window library rows (non-thumbnail fallback).
 *
 * Invariants:
 * - Decorative icons are aria-hidden; callers provide accessible row labels separately.
 *
 * Related:
 * - DesktopFolderLibraryFileList.tsx
 */

import {
	DocumentTextIcon,
	FilmIcon,
	MusicalNoteIcon,
	PhotoIcon,
} from '@heroicons/react/24/outline';
import type * as React from 'react';

export function getFolderWindowFileTypeIcon(
	contentType: string
): React.ReactNode {
	const ty = (contentType || '').toLowerCase();
	let inner: React.ReactNode;
	if (ty.includes('image') || ty === 'image')
		inner = <PhotoIcon className="h-5 w-5 shrink-0 text-pink-400" />;
	else if (ty.includes('video') || ty === 'video')
		inner = <FilmIcon className="h-5 w-5 shrink-0 text-red-400" />;
	else if (ty.includes('audio') || ty === 'audio')
		inner = (
			<MusicalNoteIcon className="h-5 w-5 shrink-0 text-[rgb(var(--desktop-accent-rgb))]/90" />
		);
	else
		inner = (
			<DocumentTextIcon className="h-5 w-5 shrink-0 text-(--desktop-text-dim)" />
		);
	return (
		<span className="inline-flex shrink-0" aria-hidden="true">
			{inner}
		</span>
	);
}
