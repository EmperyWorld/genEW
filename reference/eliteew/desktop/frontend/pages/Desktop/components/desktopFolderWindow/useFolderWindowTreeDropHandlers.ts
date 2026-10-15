/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Tree/path/sidebar and library batch move drop handlers for Desktop folder window.
 *
 * Invariants:
 * - Library content moves skip when target equals current folder item id.
 *
 * Related:
 * - DesktopFolderWindow.tsx; folderWindowTreeDrop.ts; folderWindowLibraryDrag.ts
 */

import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import { notify } from '@/notifications';
import { api } from '@/services/api/client';
import { DESKTOP_API_V1_BASE } from '../../services/desktopApi';
import type { FolderFileItem } from '../../hooks/useFolderContents';
import { FOLDER_WINDOW_ROOT_ID } from '../../utils/desktopItemTree';
import { parseDesktopNestedItemDragIds } from '../../utils/desktopNestedItemDrag';
import { treeFolderIdToLibraryFolderItemId } from '../../utils/folderWindowLibraryDrag';
import { parseContentDragPayloadFromDataTransfer } from '@/pages/ContentManager/utils/contentManagerDrag';
import type { useDesktopAppProps } from '../../context/DesktopAppPropsContext';

type AppProps = ReturnType<typeof useDesktopAppProps>;

export interface UseFolderWindowTreeDropHandlersOptions {
	appProps: AppProps;
	effectiveFolderId: string;
	clearNestedSelection: () => void;
	clearSelection: () => void;
	setFolderFiles: Dispatch<SetStateAction<FolderFileItem[] | undefined>>;
	refreshFolderBadgeCounts: (
		...folderIds: Array<string | null | undefined>
	) => void;
	t: TFunction<'desktopUi'>;
}

export function useFolderWindowTreeDropHandlers({
	appProps,
	effectiveFolderId,
	clearNestedSelection,
	clearSelection,
	setFolderFiles,
	refreshFolderBadgeCounts,
	t,
}: UseFolderWindowTreeDropHandlersOptions) {
	const [treeDropHighlight, setTreeDropHighlight] = useState<string | null>(
		null
	);

	const currentLibraryFolderItemId = useMemo((): string | null => {
		if (
			!effectiveFolderId ||
			effectiveFolderId === '' ||
			effectiveFolderId === FOLDER_WINDOW_ROOT_ID
		) {
			return null;
		}
		return effectiveFolderId;
	}, [effectiveFolderId]);

	const moveContentIdsToFolder = useCallback(
		(contentIds: string[], folderItemId: string | null) => {
			if (contentIds.length === 0) return;
			void (async () => {
				let ok = 0;
				let fail = 0;
				for (const id of contentIds) {
					try {
						await api.patch(
							`${DESKTOP_API_V1_BASE}/content/${id}`,
							{ folder_item_id: folderItemId },
							{ baseURL: '' }
						);
						ok += 1;
						setFolderFiles((prev) =>
							prev ? prev.filter((f) => f.id !== id) : prev
						);
					} catch {
						fail += 1;
					}
				}
				clearSelection();
				if (ok > 0) {
					refreshFolderBadgeCounts(effectiveFolderId, folderItemId);
				}
				if (fail > 0 && ok === 0) {
					notify.error(
						t('folderWindow.batchMoveFailedTitle'),
						t('folderWindow.batchMoveFailedBody')
					);
				} else if (fail > 0) {
					notify.error(
						t('folderWindow.batchPartialTitle'),
						t('folderWindow.batchPartialBody', { ok, fail })
					);
				}
			})();
		},
		[
			clearSelection,
			effectiveFolderId,
			refreshFolderBadgeCounts,
			setFolderFiles,
			t,
		]
	);

	const handleNestedItemDropToFolder = useCallback(
		(e: React.DragEvent, targetFolderId: string) => {
			e.preventDefault();
			e.stopPropagation();
			setTreeDropHighlight(null);
			const ids = parseDesktopNestedItemDragIds(e.dataTransfer);
			if (ids.length === 0) return;
			appProps?.moveDesktopNestedItemsToFolder?.(ids, targetFolderId);
			clearNestedSelection();
		},
		[appProps, clearNestedSelection]
	);

	const handleLibraryContentDropToFolder = useCallback(
		(e: React.DragEvent, targetFolderId: string) => {
			e.preventDefault();
			e.stopPropagation();
			setTreeDropHighlight(null);
			const payload = parseContentDragPayloadFromDataTransfer(e.dataTransfer);
			const ids = payload?.ids ?? [];
			if (ids.length === 0) return;
			const folderItemId = treeFolderIdToLibraryFolderItemId(targetFolderId);
			if (folderItemId === currentLibraryFolderItemId) return;
			moveContentIdsToFolder(ids, folderItemId);
		},
		[currentLibraryFolderItemId, moveContentIdsToFolder]
	);

	const handleTreeDropToFolder = useCallback(
		(e: React.DragEvent, targetFolderId: string) => {
			if (parseDesktopNestedItemDragIds(e.dataTransfer).length > 0) {
				handleNestedItemDropToFolder(e, targetFolderId);
				return;
			}
			handleLibraryContentDropToFolder(e, targetFolderId);
		},
		[handleLibraryContentDropToFolder, handleNestedItemDropToFolder]
	);

	const handleMoveTargetsToFolder = useCallback(
		(targets: FolderFileItem[], folderItemId: string | null) => {
			moveContentIdsToFolder(
				targets.map((file) => file.id),
				folderItemId
			);
		},
		[moveContentIdsToFolder]
	);

	return {
		treeDropHighlight,
		setTreeDropHighlight,
		handleNestedItemDropToFolder,
		handleLibraryContentDropToFolder,
		handleTreeDropToFolder,
		handleMoveTargetsToFolder,
	};
}
