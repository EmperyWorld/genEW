/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * GET /desktop/recent-content-feed — server slices for Start / Quick Search:
 * opened, added (all origins), generated (source_service), uploaded (no source_service),
 * projects (user's marketing projects via companies).
 * `recentLibraryAdded` excludes ids already shown under generated/uploaded to avoid duplicate rows.
 *
 * Invariants:
 * - Mount/limit-change fetch uses AbortController; abort is silent (no console noise).
 *
 * Related:
 * - `useDesktopWorkspaceRecentFilesAndViewport.ts`, `DesktopWorkspaceContent.tsx`
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/services/api/client';
import { isHttpRequestAbortLikeError } from '@/services/auth/authSessionHttpAbort';
import type { RecentFile } from '../types/desktop.types';
import {
	mapApiRowsToRecentFiles,
	type RecentFilesApiRow,
} from './useRecentFiles';

const DESKTOP_REQUEST_OPTIONS = { baseURL: '/api/v1' };
const DEFAULT_LIMIT = 6;

function extractRows(
	raw: unknown,
	key: 'opened' | 'added' | 'generated' | 'uploaded' | 'projects'
): RecentFilesApiRow[] {
	if (!raw || typeof raw !== 'object') return [];
	const v = (raw as Record<string, unknown>)[key];
	if (!Array.isArray(v)) return [];
	return v.filter(
		(x): x is RecentFilesApiRow =>
			x != null &&
			typeof x === 'object' &&
			typeof (x as RecentFilesApiRow).id === 'string'
	);
}

function dedupeAddedVersusSlices(
	added: RecentFile[],
	generated: RecentFile[],
	uploaded: RecentFile[]
): RecentFile[] {
	const hide = new Set<string>();
	for (const f of generated) hide.add(f.id);
	for (const f of uploaded) hide.add(f.id);
	if (hide.size === 0) return added;
	return added.filter((f) => !hide.has(f.id));
}

export function useDesktopRecentContentFeed(options?: { limit?: number }) {
	const limit = options?.limit ?? DEFAULT_LIMIT;
	const [opened, setOpened] = useState<RecentFile[]>([]);
	const [addedRaw, setAddedRaw] = useState<RecentFile[]>([]);
	const [generated, setGenerated] = useState<RecentFile[]>([]);
	const [uploaded, setUploaded] = useState<RecentFile[]>([]);
	const [projects, setProjects] = useState<RecentFile[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
	const inflightAbortRef = useRef<AbortController | null>(null);

	const load = useCallback(async () => {
		inflightAbortRef.current?.abort();
		const ac = new AbortController();
		inflightAbortRef.current = ac;
		const { signal } = ac;

		setIsLoading(true);
		setError(null);
		try {
			const { ensureDesktopShellBootstrap, peekDesktopShellBootstrap } =
				await import('../services/desktopShellBootstrap');
			await ensureDesktopShellBootstrap({ forceDesktop: true });
			const bootFeed = peekDesktopShellBootstrap()?.recent_content_feed;
			const res =
				bootFeed && limit === DEFAULT_LIMIT
					? bootFeed
					: await api.get<unknown>('/desktop/recent-content-feed', {
							...DESKTOP_REQUEST_OPTIONS,
							params: { limit },
							signal,
						});
			if (signal.aborted) return;
			const body =
				res !== null && typeof res === 'object' && 'opened' in (res as object)
					? res
					: res !== null && typeof res === 'object' && 'data' in (res as object)
						? (res as { data: unknown }).data
						: res;
			const genRows = mapApiRowsToRecentFiles(extractRows(body, 'generated'));
			const upRows = mapApiRowsToRecentFiles(extractRows(body, 'uploaded'));
			setOpened(mapApiRowsToRecentFiles(extractRows(body, 'opened')));
			setAddedRaw(mapApiRowsToRecentFiles(extractRows(body, 'added')));
			setGenerated(genRows);
			setUploaded(upRows);
			setProjects(mapApiRowsToRecentFiles(extractRows(body, 'projects')));
			setLastLoadedAt(Date.now());
		} catch (e) {
			if (signal.aborted || isHttpRequestAbortLikeError(e)) {
				return;
			}
			const message =
				e instanceof Error ? e.message : 'recent-content-feed failed';
			setError(message);
			console.warn('[useDesktopRecentContentFeed] load failed', e);
		} finally {
			if (!signal.aborted) {
				setIsLoading(false);
			}
		}
	}, [limit]);

	useEffect(() => {
		void load();
		return () => {
			inflightAbortRef.current?.abort();
		};
	}, [load]);

	const recentLibraryAdded = useMemo(
		() => dedupeAddedVersusSlices(addedRaw, generated, uploaded),
		[addedRaw, generated, uploaded]
	);

	const hasRecentContentFeedItems = useMemo(
		() =>
			opened.length > 0 ||
			addedRaw.length > 0 ||
			generated.length > 0 ||
			uploaded.length > 0 ||
			projects.length > 0,
		[
			opened.length,
			addedRaw.length,
			generated.length,
			uploaded.length,
			projects.length,
		]
	);

	return {
		recentLibraryOpened: opened,
		recentLibraryAdded,
		recentLibraryGenerated: generated,
		recentLibraryUploaded: uploaded,
		recentLibraryProjects: projects,
		refetch: load,
		isLoading,
		error,
		lastLoadedAt,
		hasRecentContentFeedItems,
	};
}
