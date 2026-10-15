import type { RecentFile } from '../types/desktop.types';

/**
 * Wave 11: single discovery list — library “opened” slice first (server), then shell
 * `recent_file_ids` MRU items not already present. De-duplicates by content id.
 */
export function mergeRecentDocumentsDiscovery(
	libraryOpened: RecentFile[],
	shellRecentFiles: RecentFile[],
	maxItems: number
): RecentFile[] {
	if (maxItems <= 0) return [];
	const seen = new Set<string>();
	const out: RecentFile[] = [];
	for (const f of libraryOpened) {
		if (seen.has(f.id)) continue;
		seen.add(f.id);
		out.push(f);
		if (out.length >= maxItems) return out;
	}
	for (const f of shellRecentFiles) {
		if (seen.has(f.id)) continue;
		seen.add(f.id);
		out.push(f);
		if (out.length >= maxItems) break;
	}
	return out;
}
