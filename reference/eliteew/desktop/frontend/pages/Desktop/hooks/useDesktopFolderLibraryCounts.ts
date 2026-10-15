/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * React Query loader for desktop folder badge totals via one folder-totals API call.
 *
 * Invariants:
 * - One ``GET /content/folder-totals`` for all root folder icons (not N× list probes).
 * - `invalidateDesktopFolderLibraryCounts` refreshes badges and icon previews after folder mutations.
 *
 * Related:
 * - utils/desktopFolderLibraryCounts.ts · useDesktopWorkspaceVisualProfileBridge.ts
 */

import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
	fetchDesktopFolderLibraryTotals,
	resolveDesktopFolderLibraryTotal,
} from '../utils/desktopFolderLibraryCounts';
import { invalidateDesktopFolderLibraryPreviews } from './useDesktopFolderLibraryPreviews';

export const DESKTOP_FOLDER_LIBRARY_TOTALS_QUERY_KEY = [
	'desktop',
	'folder-library-totals',
] as const;

/** @deprecated Use DESKTOP_FOLDER_LIBRARY_TOTALS_QUERY_KEY */
export const DESKTOP_FOLDER_LIBRARY_TOTAL_QUERY_ROOT =
	DESKTOP_FOLDER_LIBRARY_TOTALS_QUERY_KEY;

export function desktopFolderLibraryTotalQueryKey(folderId: string) {
	return [...DESKTOP_FOLDER_LIBRARY_TOTALS_QUERY_KEY, folderId] as const;
}

export async function invalidateDesktopFolderLibraryCounts(
	queryClient: QueryClient,
	folderIds?: Iterable<string>
): Promise<void> {
	await queryClient.invalidateQueries({
		queryKey: DESKTOP_FOLDER_LIBRARY_TOTALS_QUERY_KEY,
	});
	const ids = folderIds
		? [...new Set([...folderIds].filter((id) => id.length > 0))]
		: [];
	await invalidateDesktopFolderLibraryPreviews(
		queryClient,
		ids.length > 0 ? ids : undefined
	);
}

export function useDesktopFolderLibraryCounts(
	folderIds: readonly string[],
	enabled: boolean
): Record<string, number> {
	const uniqueIds = useMemo(
		() => [...new Set(folderIds.filter((id) => id.length > 0))].sort(),
		[folderIds]
	);

	const { data: totals } = useQuery({
		queryKey: DESKTOP_FOLDER_LIBRARY_TOTALS_QUERY_KEY,
		queryFn: fetchDesktopFolderLibraryTotals,
		enabled: enabled && uniqueIds.length > 0,
		staleTime: 60_000,
	});

	return useMemo(() => {
		const out: Record<string, number> = {};
		if (!totals) return out;
		for (const folderId of uniqueIds) {
			const total = resolveDesktopFolderLibraryTotal(totals, folderId);
			if (total > 0) {
				out[folderId] = total;
			}
		}
		return out;
	}, [totals, uniqueIds]);
}
