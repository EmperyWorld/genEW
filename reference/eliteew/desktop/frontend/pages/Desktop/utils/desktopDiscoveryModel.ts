import type { RecentFile } from '../types/desktop.types';
import type { DesktopExpansionDiscoveryState } from '../types/desktopExpansion.types';
import { mergeRecentDocumentsDiscovery } from './mergeRecentDocumentsDiscovery';

/** Limits for library slices shown in Start Menu / Quick Search browse mode. */
export type DesktopLibraryDiscoveryLimits = {
	recentDocuments: number;
	projects: number;
	generated: number;
	uploaded: number;
	added: number;
};

const DEFAULT_LIMITS: DesktopLibraryDiscoveryLimits = {
	recentDocuments: 8,
	projects: 6,
	generated: 6,
	uploaded: 6,
	added: 6,
};

export type DesktopLibraryDiscoverySlices = {
	recentDocumentsUnified: RecentFile[];
	projects: RecentFile[];
	generated: RecentFile[];
	uploaded: RecentFile[];
	added: RecentFile[];
	/** True if any slice has at least one row (after limits). */
	hasAnyLibraryRows: boolean;
};

export type BuildDesktopLibraryDiscoverySlicesParams = {
	recentFiles: RecentFile[];
	recentLibraryOpened: RecentFile[];
	recentLibraryAdded: RecentFile[];
	recentLibraryGenerated: RecentFile[];
	recentLibraryUploaded: RecentFile[];
	recentLibraryProjects: RecentFile[];
	limits?: Partial<DesktopLibraryDiscoveryLimits>;
};

/**
 * Normalizes library feed + shell MRU into the same slices used by Start Menu and Quick Search.
 */
export function buildDesktopLibraryDiscoverySlices(
	p: BuildDesktopLibraryDiscoverySlicesParams
): DesktopLibraryDiscoverySlices {
	const L = { ...DEFAULT_LIMITS, ...p.limits };
	const recentDocumentsUnified = mergeRecentDocumentsDiscovery(
		p.recentLibraryOpened,
		p.recentFiles,
		L.recentDocuments
	);
	const projects = p.recentLibraryProjects.slice(0, L.projects);
	const generated = p.recentLibraryGenerated.slice(0, L.generated);
	const uploaded = p.recentLibraryUploaded.slice(0, L.uploaded);
	const added = p.recentLibraryAdded.slice(0, L.added);
	const hasAnyLibraryRows =
		recentDocumentsUnified.length > 0 ||
		projects.length > 0 ||
		generated.length > 0 ||
		uploaded.length > 0 ||
		added.length > 0;
	return {
		recentDocumentsUnified,
		projects,
		generated,
		uploaded,
		added,
		hasAnyLibraryRows,
	};
}

export type DesktopExpansionDiscoveryCounts = {
	workspaceProfilesCount: number;
	appCollectionsCount: number;
	contentShortcutsCount: number;
	assistantActionsEnabledCount: number;
};

export function getDesktopExpansionDiscoveryCounts(
	expansion?: DesktopExpansionDiscoveryState
): DesktopExpansionDiscoveryCounts {
	if (!expansion) {
		return {
			workspaceProfilesCount: 0,
			appCollectionsCount: 0,
			contentShortcutsCount: 0,
			assistantActionsEnabledCount: 0,
		};
	}
	return {
		workspaceProfilesCount: expansion.workspaceProfiles.length,
		appCollectionsCount: expansion.appCollections.length,
		contentShortcutsCount: expansion.contentShortcuts.length,
		assistantActionsEnabledCount: expansion.assistantContextActions.filter(
			(a) => a.enabled
		).length,
	};
}

/** Dedupe by id; first occurrence wins (caller controls order). */
export function dedupeRecentFilesById(
	files: readonly RecentFile[]
): RecentFile[] {
	const seen = new Set<string>();
	const out: RecentFile[] = [];
	for (const f of files) {
		if (seen.has(f.id)) continue;
		seen.add(f.id);
		out.push(f);
	}
	return out;
}

/**
 * Pool for Quick Search / launcher: shell MRU + all recent-content-feed slices.
 * Order: recentFiles, opened, generated, uploaded, added, projects.
 */
export function buildQuickSearchRecentFilePool(params: {
	recentFiles: RecentFile[];
	recentLibraryOpened: RecentFile[];
	recentLibraryAdded: RecentFile[];
	recentLibraryGenerated: RecentFile[];
	recentLibraryUploaded: RecentFile[];
	recentLibraryProjects: RecentFile[];
}): RecentFile[] {
	return dedupeRecentFilesById([
		...params.recentFiles,
		...params.recentLibraryOpened,
		...params.recentLibraryGenerated,
		...params.recentLibraryUploaded,
		...params.recentLibraryAdded,
		...params.recentLibraryProjects,
	]);
}

export function scoreRecentFileForQuery(
	file: RecentFile,
	qLower: string
): number {
	if (!qLower) return 0;
	const name = file.name.toLowerCase();
	const path = file.path.toLowerCase();
	if (name === qLower) return 1000;
	if (name.startsWith(qLower)) return 800;
	if (name.includes(qLower)) return 600;
	if (path.includes(qLower)) return 400;
	let lastIndex = -1;
	let consecutive = 0;
	let matched = true;
	for (const char of qLower) {
		const index = name.indexOf(char, lastIndex + 1);
		if (index === -1) {
			matched = false;
			break;
		}
		if (index === lastIndex + 1) consecutive++;
		lastIndex = index;
	}
	if (matched) return 200 + consecutive * 50;
	return 0;
}

export function rankRecentFilesForQuery(
	pool: readonly RecentFile[],
	query: string,
	limit: number
): RecentFile[] {
	const q = query.trim().toLowerCase();
	if (!q || limit <= 0) return [];
	const scored = pool
		.map((f) => ({ f, score: scoreRecentFileForQuery(f, q) }))
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score);
	const out: RecentFile[] = [];
	const seen = new Set<string>();
	for (const { f } of scored) {
		if (seen.has(f.id)) continue;
		seen.add(f.id);
		out.push(f);
		if (out.length >= limit) break;
	}
	return out;
}
