/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Library file row actions and selection handlers for Desktop folder window list body.
 *
 * Invariants:
 * - Library row interactions clear nested selection; preview uses authenticated ContentThumbnail path.
 *
 * Related:
 * - useFolderWindowListKeyboard.ts · DesktopFolderListBodyPanel.tsx
 */

import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { notify } from '@/notifications';
import { contentApi } from '@/services/contentApi';
import type { FolderFileItem } from '../../hooks/useFolderContents';
import { emitDesktopFileOpened } from '../../hooks/useRecentFiles';
import { requestPlayInMusicPlayer } from '../../utils/desktopDeepLink';
import { beginFolderWindowLibraryFileDrag } from '../../utils/folderWindowLibraryDrag';
import type { FolderFileAction } from './useFolderWindowListKeyboard';

export interface UseFolderWindowLibraryRowHandlersOptions {
	filesList: FolderFileItem[];
	selectedIds: Set<string>;
	clearNestedSelection: () => void;
	selectOne: (id: string) => void;
	toggleSelect: (id: string) => void;
	selectAllIds: (ids: Iterable<string>) => void;
	setFocusedIndex: Dispatch<SetStateAction<number>>;
	setFolderFileContextMenu: Dispatch<
		SetStateAction<{
			x: number;
			y: number;
			targets: FolderFileItem[];
			submenu?: 'move';
		} | null>
	>;
	setPreviewFile: Dispatch<
		SetStateAction<{
			id: string;
			name: string;
			content_type: string;
			mime_type?: string | null;
		} | null>
	>;
	setFolderDeletePending: Dispatch<SetStateAction<FolderFileItem[] | null>>;
	openFolderRename: (file: FolderFileItem) => void;
}

export function useFolderWindowLibraryRowHandlers({
	filesList,
	selectedIds,
	clearNestedSelection,
	selectOne,
	toggleSelect,
	selectAllIds,
	setFocusedIndex,
	setFolderFileContextMenu,
	setPreviewFile,
	setFolderDeletePending,
	openFolderRename,
}: UseFolderWindowLibraryRowHandlersOptions) {
	const { t } = useTranslation('desktopUi');
	const lastClickedIndexRef = useRef<number | null>(null);

	const handleFolderFileAction = useCallback(
		(action: FolderFileAction, file: FolderFileItem) => {
			setFolderFileContextMenu(null);
			if (action === 'play-in-player') {
				requestPlayInMusicPlayer({
					id: file.id,
					name: file.name || file.id,
					thumbnail_url:
						typeof file.thumbnail_url === 'string' ? file.thumbnail_url : null,
					source_surface: 'desktop-widget',
				});
				return;
			}
			if (action === 'view') {
				emitDesktopFileOpened({
					id: file.id,
					name: file.name,
					type:
						file.content_type === 'document' ||
						file.content_type === 'image' ||
						file.content_type === 'video' ||
						file.content_type === 'audio' ||
						file.content_type === 'folder'
							? file.content_type
							: 'document',
					path: `#/content/${file.id}`,
				});
				const previewContentType =
					file.content_type === 'document' ||
					file.content_type === 'image' ||
					file.content_type === 'video' ||
					file.content_type === 'audio' ||
					file.content_type === 'folder'
						? file.content_type
						: 'document';
				setPreviewFile({
					id: file.id,
					name: file.name,
					content_type: previewContentType,
					mime_type: typeof file.mime_type === 'string' ? file.mime_type : null,
				});
			} else if (action === 'download') {
				notify.info(t('folderWindow.downloadPreparing'), file.name || '');
				void contentApi
					.downloadContentToBrowser({
						contentId: file.id,
						preferredFilename:
							file.name ||
							(file as { original_filename?: string }).original_filename ||
							'download',
					})
					.catch((err: unknown) => {
						console.error(
							'[DesktopFolderWindow] ArrowDownTrayIcon failed',
							err
						);
					});
			} else if (action === 'rename') {
				openFolderRename(file);
			} else if (action === 'delete') {
				setFolderDeletePending([file]);
			}
		},
		[
			openFolderRename,
			setFolderDeletePending,
			setFolderFileContextMenu,
			setPreviewFile,
			t,
		]
	);

	const openFileContextMenu = useCallback(
		(e: React.MouseEvent, file: FolderFileItem, index: number) => {
			e.preventDefault();
			e.stopPropagation();
			let targets: FolderFileItem[];
			if (selectedIds.has(file.id) && selectedIds.size > 1) {
				targets = filesList.filter((f) => selectedIds.has(f.id));
			} else {
				targets = [file];
				selectOne(file.id);
			}
			lastClickedIndexRef.current = index;
			setFolderFileContextMenu({
				x: e.clientX,
				y: e.clientY,
				targets,
			});
		},
		[filesList, selectedIds, selectOne, setFolderFileContextMenu]
	);

	const onRowClick = useCallback(
		(e: React.MouseEvent, file: FolderFileItem, index: number) => {
			clearNestedSelection();
			setFocusedIndex(index);
			if (e.shiftKey && lastClickedIndexRef.current != null) {
				const a = Math.min(lastClickedIndexRef.current, index);
				const b = Math.max(lastClickedIndexRef.current, index);
				const range = filesList.slice(a, b + 1).map((f) => f.id);
				selectAllIds(range);
			} else if (e.metaKey || e.ctrlKey) {
				toggleSelect(file.id);
				lastClickedIndexRef.current = index;
			} else {
				selectOne(file.id);
				lastClickedIndexRef.current = index;
			}
		},
		[
			clearNestedSelection,
			filesList,
			selectAllIds,
			selectOne,
			setFocusedIndex,
			toggleSelect,
		]
	);

	const onRowDoubleClick = useCallback(
		(e: React.MouseEvent, file: FolderFileItem) => {
			e.preventDefault();
			e.stopPropagation();
			handleFolderFileAction('view', file);
		},
		[handleFolderFileAction]
	);

	const toggleRowSelected = useCallback(
		(e: React.MouseEvent, file: FolderFileItem, index: number) => {
			e.stopPropagation();
			e.preventDefault();
			clearNestedSelection();
			toggleSelect(file.id);
			lastClickedIndexRef.current = index;
			setFocusedIndex(index);
		},
		[clearNestedSelection, setFocusedIndex, toggleSelect]
	);

	const beginLibraryFileDrag = useCallback(
		(e: React.DragEvent, file: FolderFileItem) => {
			clearNestedSelection();
			beginFolderWindowLibraryFileDrag(e, file, {
				filesList,
				selectedIds,
			});
		},
		[clearNestedSelection, filesList, selectedIds]
	);

	const libraryFileDragProps = useCallback(
		(file: FolderFileItem) => ({
			draggable: true as const,
			onDragStart: (e: React.DragEvent) => beginLibraryFileDrag(e, file),
		}),
		[beginLibraryFileDrag]
	);

	return {
		handleFolderFileAction,
		openFileContextMenu,
		onRowClick,
		onRowDoubleClick,
		toggleRowSelected,
		libraryFileDragProps,
	};
}
