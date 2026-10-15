/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Sanitizes Clipboard Manager history before it is persisted into desktop `shell_state`.
 *
 * Invariants:
 * - Keep frontend caps aligned with backend `_MAX_CLIPBOARD_SHELL_ITEMS` / `_MAX_CLIPBOARD_SHELL_STRING`.
 * - Oversized image data URLs are not persisted; current-session UI may still keep them in memory.
 *
 * Related:
 * - src/pages/Desktop/components/ClipboardManager.tsx
 * - api/routers/desktop.py
 */

import type { DesktopClipboardShellRecord } from '../services/desktopApi';

export type DesktopClipboardHistoryItem = {
	id: string;
	type: 'text' | 'image' | 'html';
	content: string;
	preview?: string;
	timestamp: Date | string;
	pinned: boolean;
	source?: string;
};

export const DESKTOP_CLIPBOARD_SHELL_MAX_ITEMS = 25;
export const DESKTOP_CLIPBOARD_SHELL_MAX_STRING = 120_000;

function truncateShellString(value: string): string {
	return value.length > DESKTOP_CLIPBOARD_SHELL_MAX_STRING
		? value.slice(0, DESKTOP_CLIPBOARD_SHELL_MAX_STRING)
		: value;
}

function shouldSkipShellRecord(item: DesktopClipboardHistoryItem): boolean {
	return (
		item.type === 'image' &&
		item.content.startsWith('data:') &&
		item.content.length > DESKTOP_CLIPBOARD_SHELL_MAX_STRING
	);
}

export function shellRecordsToClipboardItems(
	records: DesktopClipboardShellRecord[]
): DesktopClipboardHistoryItem[] {
	const out: DesktopClipboardHistoryItem[] = [];
	for (const r of records) {
		if (typeof r?.id !== 'string' || typeof r.content !== 'string') continue;
		const t =
			r.type === 'text' || r.type === 'image' || r.type === 'html'
				? r.type
				: 'text';
		const ts = r.timestamp ? Date.parse(r.timestamp) : NaN;
		out.push({
			id: r.id,
			type: t,
			content: r.content,
			preview: typeof r.preview === 'string' ? r.preview : undefined,
			timestamp: Number.isNaN(ts) ? new Date() : new Date(ts),
			pinned: Boolean(r.pinned),
			source: typeof r.source === 'string' ? r.source : undefined,
		});
	}
	return out;
}

export function clipboardItemsToShellRecords(
	items: DesktopClipboardHistoryItem[]
): DesktopClipboardShellRecord[] {
	return items
		.slice(0, DESKTOP_CLIPBOARD_SHELL_MAX_ITEMS)
		.filter((item) => !shouldSkipShellRecord(item))
		.map((item) => {
			const preview =
				typeof item.preview === 'string' &&
				item.preview.length <= DESKTOP_CLIPBOARD_SHELL_MAX_STRING
					? item.preview
					: undefined;
			return {
				id: item.id,
				type: item.type,
				content: truncateShellString(item.content),
				preview,
				timestamp:
					item.timestamp instanceof Date
						? item.timestamp.toISOString()
						: new Date(item.timestamp).toISOString(),
				pinned: item.pinned,
				source: item.source,
			};
		});
}
