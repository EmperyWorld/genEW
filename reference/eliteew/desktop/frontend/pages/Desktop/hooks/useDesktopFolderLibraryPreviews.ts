/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * React Query loader for up to four Unified Content rows per folder (desktop icon mosaic).
 *
 * Invariants:
 * - Fetched only for folders without nested desktop children but with library totals.
 * - Invalidated together with folder library count queries.
 * - One ``GET /content/folder-previews`` after idle arm (not N× compact list).
 *
 * Related:
 * - utils/desktopFolderLibraryCounts.ts · useDesktopWorkspaceVisualProfileBridge.ts
 */

import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { DesktopFolderPreviewEntry } from '../types/desktop.types';
import { fetchDesktopFolderLibraryPreviewsBatch } from '../utils/desktopFolderLibraryCounts';

export const DESKTOP_FOLDER_LIBRARY_PREVIEW_QUERY_ROOT = [
	'desktop',
	'folder-library-preview',
] as const;

export function desktopFolderLibraryPreviewBatchQueryKey(
	folderIds: readonly string[]
) {
	return [
		...DESKTOP_FOLDER_LIBRARY_PREVIEW_QUERY_ROOT,
		'batch',
		...folderIds,
	] as const;
}

/** @deprecated Prefer batch key; kept for targeted invalidation of one folder. */
export function desktopFolderLibraryPreviewQueryKey(folderId: string) {
	return [...DESKTOP_FOLDER_LIBRARY_PREVIEW_QUERY_ROOT, folderId] as const;
}

export async function invalidateDesktopFolderLibraryPreviews(
	queryClient: QueryClient,
	folderIds?: Iterable<string>
): Promise<void> {
	const ids = folderIds
		? [...new Set([...folderIds].filter((id) => id.length > 0))]
		: [];
	if (ids.length === 0) {
		await queryClient.invalidateQueries({
			queryKey: DESKTOP_FOLDER_LIBRARY_PREVIEW_QUERY_ROOT,
		});
		return;
	}
	await queryClient.invalidateQueries({
		queryKey: DESKTOP_FOLDER_LIBRARY_PREVIEW_QUERY_ROOT,
	});
}

export function useDesktopFolderLibraryPreviews(
	folderIds: readonly string[],
	enabled: boolean
): Record<string, DesktopFolderPreviewEntry[]> {
	const uniqueIds = useMemo(
		() => [...new Set(folderIds.filter((id) => id.length > 0))].sort(),
		[folderIds]
	);
	const [idleArmed, setIdleArmed] = useState(false);

	useEffect(() => {
		if (!enabled || uniqueIds.length === 0) {
			setIdleArmed(false);
			return;
		}
		let cancelled = false;
		let idleHandle = 0;
		let timeoutHandle = 0;
		const arm = () => {
			if (!cancelled) setIdleArmed(true);
		};
		if (typeof window.requestIdleCallback === 'function') {
			idleHandle = window.requestIdleCallback(arm, { timeout: 2_500 });
		} else {
			timeoutHandle = window.setTimeout(arm, 1_200);
		}
		return () => {
			cancelled = true;
			if (idleHandle && typeof window.cancelIdleCallback === 'function') {
				window.cancelIdleCallback(idleHandle);
			}
			if (timeoutHandle) window.clearTimeout(timeoutHandle);
		};
	}, [enabled, uniqueIds.length]);

	const query = useQuery({
		queryKey: desktopFolderLibraryPreviewBatchQueryKey(uniqueIds),
		queryFn: () => fetchDesktopFolderLibraryPreviewsBatch(uniqueIds),
		enabled: enabled && idleArmed && uniqueIds.length > 0,
		staleTime: 60_000,
	});

	return useMemo(() => query.data ?? {}, [query.data]);
}
