/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Helpers to create a new Markdown file on the desktop grid (upload + desktop item shape).
 *
 * Invariants:
 * - Desktop file item id equals unified content id returned from upload.
 * - Filenames are unique among visible file items (case-insensitive).
 * - MIME hints for file shortcuts may be inferred from filename when API omits fileType.
 *
 * Related:
 * - hooks/useDesktopStorage.ts
 * - services/contentApi.ts
 */

import type { DesktopItem } from '../types/desktop.types';

const DEFAULT_BASENAME = 'Новый документ';

export function resolveNextMarkdownFilename(items: DesktopItem[]): string {
	const used = new Set(
		items
			.filter((item) => item.type === 'file')
			.map((item) => item.name.trim().toLowerCase())
			.filter(Boolean)
	);
	let index = 1;
	while (index < 500) {
		const candidate =
			index === 1
				? `${DEFAULT_BASENAME}.md`
				: `${DEFAULT_BASENAME} ${index}.md`;
		if (!used.has(candidate.toLowerCase())) {
			return candidate;
		}
		index += 1;
	}
	return `${DEFAULT_BASENAME} ${Date.now()}.md`;
}

export function buildDesktopMarkdownFileItem(params: {
	contentId: string;
	name: string;
	position: { x: number; y: number };
	parentId?: string;
}): DesktopItem {
	return {
		id: params.contentId,
		name: params.name,
		type: 'file',
		position: params.position,
		fileType: 'text/markdown',
		parentId: params.parentId,
		isPinned: false,
	};
}

export function createEmptyMarkdownBlob(filename: string): File {
	return new File(['\n'], filename, { type: 'text/markdown' });
}

/** Best-effort MIME for desktop file shortcuts restored from API (no fileType column). */
export function inferDesktopFileTypeFromName(
	filename: string
): string | undefined {
	const lower = filename.trim().toLowerCase();
	if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
		return 'text/markdown';
	}
	if (lower.endsWith('.txt')) return 'text/plain';
	if (lower.endsWith('.json')) return 'application/json';
	if (lower.endsWith('.csv')) return 'text/csv';
	if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
	if (lower.endsWith('.pdf')) return 'application/pdf';
	return undefined;
}
