/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Lazy-load desktop folder targets when library move submenu opens in folder window context menus.
 *
 * Invariants:
 * - Excludes current window folder id from move target list.
 *
 * Related:
 * - DesktopFolderContextMenus.tsx · getDesktopItems
 */

import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { getDesktopItems } from '../../services/desktopApi';
import { resolveDesktopFolderDisplayName } from '../../utils/desktopSystemFolderLabels';
import type { FolderFileContextMenuState } from './DesktopFolderContextMenus';

export interface UseFolderWindowMoveFoldersLoaderOptions {
	winFolderId: string | undefined;
	folderFileContextMenu: FolderFileContextMenuState;
	setDesktopFoldersForMove: Dispatch<
		SetStateAction<{ id: string; name: string }[]>
	>;
	setDesktopFoldersForMoveLoading: Dispatch<SetStateAction<boolean>>;
}

export function useFolderWindowMoveFoldersLoader({
	winFolderId,
	folderFileContextMenu,
	setDesktopFoldersForMove,
	setDesktopFoldersForMoveLoading,
}: UseFolderWindowMoveFoldersLoaderOptions) {
	const { t: tDesktopUi } = useTranslation('desktopUi');
	useEffect(() => {
		if (folderFileContextMenu?.submenu !== 'move') {
			return;
		}
		let cancelled = false;
		setDesktopFoldersForMoveLoading(true);
		getDesktopItems()
			.then((items) => {
				if (cancelled) return;
				const folders = items
					.filter((i) => i.item_type === 'FOLDER' && i.item_id !== winFolderId)
					.map((i) => ({
						id: i.item_id,
						name: resolveDesktopFolderDisplayName(i, tDesktopUi),
					}));
				setDesktopFoldersForMove(folders);
			})
			.catch((err) => {
				if (!cancelled) {
					setDesktopFoldersForMove([]);
					console.error(
						'[DesktopFolderWindow] Failed to load desktop folders for move',
						err
					);
				}
			})
			.finally(() => {
				if (!cancelled) setDesktopFoldersForMoveLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [
		winFolderId,
		folderFileContextMenu?.submenu,
		folderFileContextMenu,
		setDesktopFoldersForMove,
		setDesktopFoldersForMoveLoading,
		tDesktopUi,
	]);
}
