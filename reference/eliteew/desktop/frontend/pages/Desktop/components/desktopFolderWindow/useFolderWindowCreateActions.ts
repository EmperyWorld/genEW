/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Create/open-content callbacks shared by folder window empty state, header, and context menus.
 *
 * Invariants:
 * - Content manager opens with `contentManagerFolderItemId` when folder is a real desktop item.
 *
 * Related:
 * - DesktopFolderEmptyStatePanel.tsx; DesktopFolderWindow.tsx
 */

import { useCallback } from 'react';
import type { DesktopAppPropsContextValue } from '../../context/DesktopAppPropsContext';
import {
	FOLDER_WINDOW_ROOT_ID,
	resolveDesktopFolderWindowParentId,
	type DesktopFolderPathSegment,
} from '../../utils/desktopItemTree';

export function useFolderWindowCreateActions(input: {
	appProps: DesktopAppPropsContextValue | null;
	effectiveFolderId: string;
	pathSegments: DesktopFolderPathSegment[];
	onRetargetFolder?: (target: {
		folderId: string;
		title: string;
		path: string[];
	}) => void;
	fetchFolderContent: () => void | Promise<void>;
	refreshFolderBadgeCounts: (
		...folderIds: Array<string | null | undefined>
	) => void;
}) {
	const {
		appProps,
		effectiveFolderId,
		pathSegments,
		onRetargetFolder,
		fetchFolderContent,
		refreshFolderBadgeCounts,
	} = input;

	const openFolderContentManager = useCallback(() => {
		const fid =
			effectiveFolderId &&
			effectiveFolderId !== '' &&
			effectiveFolderId !== FOLDER_WINDOW_ROOT_ID
				? effectiveFolderId.trim()
				: undefined;
		if (appProps?.openContentManager) {
			appProps.openContentManager(
				fid ? { contentManagerFolderItemId: fid } : undefined
			);
		} else {
			appProps?.onNavigate?.('unified-content');
		}
	}, [appProps, effectiveFolderId]);

	const handleOpenNewFolderDialog = useCallback(() => {
		const parentId = resolveDesktopFolderWindowParentId(effectiveFolderId);
		const navigateIntoCreated =
			Boolean(onRetargetFolder) &&
			effectiveFolderId !== '' &&
			effectiveFolderId !== FOLDER_WINDOW_ROOT_ID;
		appProps?.openNewFolderDialog?.(
			parentId,
			navigateIntoCreated
				? (created) => {
						if (created.type !== 'folder') return;
						onRetargetFolder?.({
							folderId: created.id,
							title: created.name,
							path: [
								...pathSegments.map((segment) => segment.name),
								created.name,
							],
						});
					}
				: undefined
		);
	}, [appProps, effectiveFolderId, onRetargetFolder, pathSegments]);

	const handleCreateMarkdownHere = useCallback(async () => {
		if (!appProps?.createMarkdownFileInFolder) return;
		await appProps.createMarkdownFileInFolder(
			effectiveFolderId || FOLDER_WINDOW_ROOT_ID
		);
		void fetchFolderContent();
		refreshFolderBadgeCounts(effectiveFolderId);
	}, [
		appProps,
		effectiveFolderId,
		fetchFolderContent,
		refreshFolderBadgeCounts,
	]);

	return {
		openFolderContentManager,
		handleOpenNewFolderDialog,
		handleCreateMarkdownHere,
	};
}
