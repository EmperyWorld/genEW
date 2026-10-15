/**
 * Saved Content Manager filter shortcuts (shell_state.content_shortcuts, type saved-filter).
 *
 * `DesktopContentShortcut.target` is Record<string, string>. Only non-empty string values are stored.
 */

import type { ContentManagerInitialFilterSnapshot } from '../types/desktop.types';
import type { DesktopContentShortcut } from '../types/desktopExpansion.types';

const TARGET_KEYS = [
	'searchQuery',
	'filterType',
	'filterVisibility',
	'filterFolderId',
	'filterCompanyId',
	'filterProjectId',
	'filesBrowseMode',
	'explorerFolderTarget',
] as const;

export type ContentShortcutFilterTargetKey = (typeof TARGET_KEYS)[number];

/** Build snapshot for {@link WindowInitialPayload.contentManagerInitialFilter} from shortcut.target. */
export function contentManagerFilterSnapshotFromShortcutTarget(
	target: Record<string, string> | undefined | null
): ContentManagerInitialFilterSnapshot | undefined {
	if (!target || typeof target !== 'object') return undefined;
	const out: ContentManagerInitialFilterSnapshot = {};
	for (const k of TARGET_KEYS) {
		const raw = target[k];
		if (typeof raw !== 'string') continue;
		const v = raw.trim();
		if (!v) continue;
		out[k] = v;
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

export type SavedFilterContentShortcutFields = {
	label: string;
	searchQuery?: string;
	filterType?: string;
	filterVisibility?: string;
	filterFolderId?: string;
	filterCompanyId?: string;
	filterProjectId?: string;
	filesBrowseMode?: string;
	explorerFolderTarget?: string;
};

/** Build target map for persistence (omits empty values). */
export function shortcutTargetFromSavedFilterFields(
	fields: SavedFilterContentShortcutFields
): Record<string, string> {
	const target: Record<string, string> = {};
	const put = (
		key: ContentShortcutFilterTargetKey,
		value: string | undefined
	) => {
		const t = value?.trim();
		if (t) target[key] = t;
	};
	put('searchQuery', fields.searchQuery);
	put('filterType', fields.filterType);
	put('filterVisibility', fields.filterVisibility);
	put('filterFolderId', fields.filterFolderId);
	put('filterCompanyId', fields.filterCompanyId);
	put('filterProjectId', fields.filterProjectId);
	put('filesBrowseMode', fields.filesBrowseMode);
	put('explorerFolderTarget', fields.explorerFolderTarget);
	return target;
}

export function isSavedFilterContentShortcut(
	shortcut: Pick<DesktopContentShortcut, 'type'>
): boolean {
	return shortcut.type === 'saved-filter';
}

/** Accept shortcut target or a plain object on CustomEvent detail (string values only). */
export function normalizeContentManagerInitialFilterPayload(
	value: unknown
): ContentManagerInitialFilterSnapshot | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		return undefined;
	const asStrings: Record<string, string> = {};
	for (const [k, v] of Object.entries(value)) {
		if (typeof v !== 'string') continue;
		const t = v.trim();
		if (t) asStrings[k] = t;
	}
	return contentManagerFilterSnapshotFromShortcutTarget(asStrings);
}
