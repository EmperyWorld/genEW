/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Folder window controller (slice 6): state, data loaders, effects, and handler wiring
 * extracted from DesktopFolderWindow.tsx.
 *
 * Invariants:
 * - Image/video row tiles use authenticated ContentThumbnail via library row handlers.
 * - companionListingPlain debounce stays in useFolderWindowCompanionListing.
 *
 * Related:
 * - DesktopFolderWindow.tsx · desktopFolderWindow/* hooks · DesktopFolderWindowShell.tsx
 */

import { useDebounce } from '@/hooks/useDebounce';
import { useResizeObserverRect } from '@/hooks/useResizeObserverRect';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useDesktopAppProps } from '../../context/DesktopAppPropsContext';
import {
	type FolderFileItem,
	type FolderWindowSortBy,
	useFolderContents,
} from '../../hooks/useFolderContents';
import { invalidateDesktopFolderLibraryCounts } from '../../hooks/useDesktopFolderLibraryCounts';
import type {
	WindowInitialPayload,
	WindowState,
	DesktopItem,
} from '../../types/desktop.types';
import { FOLDER_WINDOW_ROOT_ID } from '../../utils/desktopItemTree';
import { FOLDER_WINDOW_LIST_VIRTUAL_THRESHOLD } from './folderWindowListUtils';
import { useFolderLibraryRename } from './useFolderLibraryRename';
import { useFolderWindowCompanionListing } from './useFolderWindowCompanionListing';
import { useFolderWindowCreateActions } from './useFolderWindowCreateActions';
import { useFolderWindowLibraryRowHandlers } from './useFolderWindowLibraryRowHandlers';
import { useFolderWindowListBodyDrop } from './useFolderWindowListBodyDrop';
import { useFolderWindowListKeyboard } from './useFolderWindowListKeyboard';
import { useFolderWindowMoveFoldersLoader } from './useFolderWindowMoveFoldersLoader';
import { useFolderWindowNavigation } from './useFolderWindowNavigation';
import { useFolderWindowNestedRowHandlers } from './useFolderWindowNestedRowHandlers';
import { useFolderWindowSelection } from './useFolderWindowSelection';
import { useFolderWindowTreeDropHandlers } from './useFolderWindowTreeDropHandlers';
import { useFolderWindowUpload } from './useFolderWindowUpload';

export interface UseFolderWindowControllerOptions {
	win: WindowState;
	onUpdatePayload?: (
		payload: Pick<WindowInitialPayload, 'companionListingPlain'>
	) => void;
	onRetargetFolder?: (target: {
		folderId: string;
		title: string;
		path: string[];
	}) => void;
}

export function useFolderWindowController({
	win,
	onUpdatePayload,
	onRetargetFolder,
}: UseFolderWindowControllerOptions) {
	const { t } = useTranslation('desktopUi');
	const queryClient = useQueryClient();
	const appProps = useDesktopAppProps();
	const rootSectionLabel = t('folderWindow.rootSection');
	const effectiveFolderId = win.folderId ?? '';

	const refreshFolderBadgeCounts = useCallback(
		(...folderIds: Array<string | null | undefined>) => {
			const resolved = folderIds.filter(
				(id): id is string =>
					typeof id === 'string' &&
					id.length > 0 &&
					id !== FOLDER_WINDOW_ROOT_ID
			);
			if (resolved.length === 0) return;
			void invalidateDesktopFolderLibraryCounts(queryClient, resolved);
		},
		[queryClient]
	);

	const [searchInput, setSearchInput] = useState('');
	const debouncedSearch = useDebounce(searchInput.trim(), 300);
	const [folderSortBy, setFolderSortBy] = useState<FolderWindowSortBy>('name');
	const [contentTypeFilter, setContentTypeFilter] = useState<string>('all');

	const listRequest = useMemo(
		() => ({
			search: debouncedSearch || undefined,
			sortBy: folderSortBy,
			contentType: contentTypeFilter === 'all' ? undefined : contentTypeFilter,
		}),
		[debouncedSearch, folderSortBy, contentTypeFilter]
	);

	const {
		folderFiles,
		folderTotal,
		folderHasMore,
		folderFilesLoading,
		folderLoadingMore,
		folderDesktopChildren,
		refreshFolderContents: fetchFolderContent,
		loadMoreFolderContents,
		setFolderFiles,
	} = useFolderContents(true, effectiveFolderId || undefined, listRequest);

	const setFolderFilesForRename = useCallback<
		React.Dispatch<React.SetStateAction<FolderFileItem[] | null | undefined>>
	>(
		(next) => {
			setFolderFiles((current) => {
				const resolved = typeof next === 'function' ? next(current) : next;
				return resolved ?? undefined;
			});
		},
		[setFolderFiles]
	);

	const folderUploadInputRef = useRef<HTMLInputElement>(null);
	const {
		folderRenameOpen,
		openFolderRename,
		closeFolderRename,
		setFolderRenameDraft,
		confirmFolderRename,
	} = useFolderLibraryRename(setFolderFilesForRename);
	const [folderUploadBusy, setFolderUploadBusy] = useState(false);
	const [folderUploadProgress, setFolderUploadProgress] = useState<{
		index: number;
		total: number;
		percent: number;
	} | null>(null);
	const [folderFileContextMenu, setFolderFileContextMenu] = useState<{
		x: number;
		y: number;
		targets: FolderFileItem[];
		submenu?: 'move';
	} | null>(null);
	const [folderBgContextMenu, setFolderBgContextMenu] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const [nestedMoveMenu, setNestedMoveMenu] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const [renamingNestedId, setRenamingNestedId] = useState<string | null>(null);
	const [desktopFoldersForMove, setDesktopFoldersForMove] = useState<
		{ id: string; name: string }[]
	>([]);
	const [desktopFoldersForMoveLoading, setDesktopFoldersForMoveLoading] =
		useState(false);
	const [folderViewMode, setFolderViewMode] = useState<'grid' | 'list'>('grid');
	const [folderDeletePending, setFolderDeletePending] = useState<
		FolderFileItem[] | null
	>(null);
	const [nestedDeletePending, setNestedDeletePending] = useState<
		DesktopItem[] | null
	>(null);
	const [previewFile, setPreviewFile] = useState<{
		id: string;
		name: string;
		content_type: string;
		mime_type?: string | null;
	} | null>(null);
	const [previewFileIndex, setPreviewFileIndex] = useState<number | null>(null);

	const {
		selectedIds,
		clear: clearSelection,
		setOne: selectOne,
		toggle: toggleSelect,
		setAll: selectAllIds,
	} = useFolderWindowSelection();

	const {
		selectedIds: nestedSelectedIds,
		clear: clearNestedSelection,
		setOne: selectOneNested,
		toggle: toggleNestedSelect,
		setAll: selectAllNestedIds,
	} = useFolderWindowSelection();

	const listFocusRef = useRef<HTMLDivElement>(null);
	const batchActionsRef = useRef<HTMLDivElement>(null);
	const [focusedIndex, setFocusedIndex] = useState(0);

	const clearAllSelection = useCallback(() => {
		clearSelection();
		clearNestedSelection();
	}, [clearNestedSelection, clearSelection]);

	const folderListVirtMeasureRef = useRef<HTMLDivElement>(null);

	const filesList = folderFiles ?? [];
	const desktopItems = appProps?.desktopItems ?? [];

	const {
		pathSegments,
		folderTreeRoots,
		nestedDesktopItems,
		hasNestedDesktopItems,
		nestedFolderPathPrefix,
		navigateToFolder,
		navigateToPathSegment,
		nestedMoveTargetFolders,
		nestedSelectionCanMoveToRoot,
		handleMoveNestedTargetsToFolder,
		handleNestedRenameCommit,
		requestNestedDelete,
	} = useFolderWindowNavigation({
		appProps,
		desktopItems,
		folderDesktopChildren,
		effectiveFolderId,
		rootSectionLabel,
		winTitle: win.title,
		nestedSelectedIds,
		onRetargetFolder,
		clearAllSelection,
		setSearchInput,
		setRenamingNestedId,
		setNestedDeletePending,
		setNestedMoveMenu,
		clearNestedSelection,
	});

	const hasLibraryFiles = filesList.length > 0;
	const filtersActive =
		debouncedSearch.trim() !== '' || contentTypeFilter !== 'all';

	const {
		treeDropHighlight,
		setTreeDropHighlight,
		handleNestedItemDropToFolder,
		handleLibraryContentDropToFolder,
		handleTreeDropToFolder,
		handleMoveTargetsToFolder: moveLibraryTargetsToFolder,
	} = useFolderWindowTreeDropHandlers({
		appProps,
		effectiveFolderId,
		clearNestedSelection,
		clearSelection,
		setFolderFiles,
		refreshFolderBadgeCounts,
		t,
	});

	const { onNestedItemClick, toggleNestedRowSelected, ensureNestedSelected } =
		useFolderWindowNestedRowHandlers({
			clearSelection,
			nestedDesktopItems,
			nestedSelectedIds,
			selectAllNestedIds,
			selectOneNested,
			toggleNestedSelect,
		});

	useFolderWindowCompanionListing({
		onUpdatePayload,
		folderId: win.folderId,
		path: win.path,
		title: win.title,
		folderFiles,
		folderTotal,
		folderFilesLoading,
		folderHasMore,
		nestedDesktopItems,
	});

	useEffect(() => {
		if (!previewFile) {
			setPreviewFileIndex(null);
			return;
		}
		const idx = filesList.findIndex((row) => row.id === previewFile.id);
		setPreviewFileIndex(idx >= 0 ? idx : null);
	}, [filesList, previewFile]);

	const setPreviewIndex = useCallback(
		(index: number) => {
			const file = filesList[index];
			if (!file) return;
			setPreviewFileIndex(index);
			setPreviewFile({
				id: file.id,
				name: file.name,
				content_type: file.content_type ?? 'other',
				mime_type: file.mime_type,
			});
		},
		[filesList]
	);

	const closePreview = useCallback(() => {
		setPreviewFile(null);
		setPreviewFileIndex(null);
	}, []);

	useEffect(() => {
		if (filesList.length === 0) {
			setFocusedIndex(0);
			return;
		}
		setFocusedIndex((fi) => Math.min(fi, Math.max(0, filesList.length - 1)));
	}, [filesList.length]);

	const {
		openFolderContentManager,
		handleOpenNewFolderDialog,
		handleCreateMarkdownHere,
	} = useFolderWindowCreateActions({
		appProps,
		effectiveFolderId,
		pathSegments,
		onRetargetFolder,
		fetchFolderContent,
		refreshFolderBadgeCounts,
	});

	const { runFolderUploadFiles } = useFolderWindowUpload({
		folderId: win.folderId,
		fetchFolderContent,
		refreshFolderBadgeCounts,
		setFolderUploadBusy,
		setFolderUploadProgress,
	});

	const {
		folderDropActive,
		folderDropKind,
		handleFolderBodyDrop,
		onListBodyDragEnter,
		onListBodyDragOver,
		onListBodyDragLeave,
	} = useFolderWindowListBodyDrop({
		effectiveFolderId,
		handleNestedItemDropToFolder,
		handleLibraryContentDropToFolder,
		runFolderUploadFiles,
	});

	useFolderWindowMoveFoldersLoader({
		winFolderId: win.folderId,
		folderFileContextMenu,
		setDesktopFoldersForMove,
		setDesktopFoldersForMoveLoading,
	});

	const handleMoveTargetsToFolder = useCallback(
		(targets: FolderFileItem[], folderItemId: string | null) => {
			setFolderFileContextMenu(null);
			setDesktopFoldersForMove([]);
			moveLibraryTargetsToFolder(targets, folderItemId);
		},
		[moveLibraryTargetsToFolder]
	);

	const virtualFolderListActive =
		folderViewMode === 'list' &&
		filesList.length >= FOLDER_WINDOW_LIST_VIRTUAL_THRESHOLD;

	const folderVirtRect = useResizeObserverRect(
		folderListVirtMeasureRef,
		virtualFolderListActive ? filesList.length : 0
	);

	const folderListVirtHeight = Math.max(Math.floor(folderVirtRect.height), 320);

	const {
		handleFolderFileAction,
		openFileContextMenu,
		onRowClick,
		onRowDoubleClick,
		toggleRowSelected,
		libraryFileDragProps,
	} = useFolderWindowLibraryRowHandlers({
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
	});

	const { handleListKeyDown } = useFolderWindowListKeyboard({
		appProps,
		filesList,
		focusedIndex,
		setFocusedIndex,
		selectedIds,
		nestedSelectedIds,
		nestedDesktopItems,
		nestedFolderPathPrefix,
		pathSegments,
		clearAllSelection,
		clearSelection,
		clearNestedSelection,
		selectAllIds,
		selectAllNestedIds,
		setFolderFileContextMenu,
		setFolderBgContextMenu,
		setNestedMoveMenu,
		setRenamingNestedId,
		setNestedDeletePending,
		setFolderDeletePending,
		requestNestedDelete,
		handleFolderFileAction,
		openFolderRename,
		navigateToFolder,
	});

	const onListBodyPaste = useCallback(
		(e: React.ClipboardEvent) => {
			const files = e.clipboardData?.files;
			if (files && files.length > 0) {
				e.preventDefault();
				void runFolderUploadFiles(files);
			}
		},
		[runFolderUploadFiles]
	);

	const onListBodyContextMenu = useCallback((e: React.MouseEvent) => {
		if (
			(e.target as HTMLElement).closest('[data-desktop-folder-file="true"]')
		) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		setFolderBgContextMenu({ x: e.clientX, y: e.clientY });
	}, []);

	const onListBodyBackgroundClick = useCallback(
		(e: React.MouseEvent) => {
			if (e.target === e.currentTarget) {
				clearAllSelection();
			}
		},
		[clearAllSelection]
	);

	const canOpenNewFolderDialog = Boolean(appProps?.openNewFolderDialog);
	const canCreateMarkdownInFolder = Boolean(
		appProps?.createMarkdownFileInFolder
	);

	const resetFilters = useCallback(() => {
		setSearchInput('');
		setContentTypeFilter('all');
	}, []);

	const clearSearch = useCallback(() => {
		setSearchInput('');
	}, []);

	const listBodyBusy = folderFilesLoading || folderUploadBusy;

	const onUploadClick = useCallback(() => {
		folderUploadInputRef.current?.click();
	}, []);

	return {
		appProps,
		win,
		effectiveFolderId,
		folderUploadInputRef,
		listFocusRef,
		batchActionsRef,
		folderListVirtMeasureRef,
		searchInput,
		setSearchInput,
		contentTypeFilter,
		setContentTypeFilter,
		folderViewMode,
		setFolderViewMode,
		folderSortBy,
		setFolderSortBy,
		folderFiles,
		folderTotal,
		folderHasMore,
		folderFilesLoading,
		folderLoadingMore,
		fetchFolderContent,
		loadMoreFolderContents,
		setFolderFiles,
		folderUploadBusy,
		folderUploadProgress,
		folderFileContextMenu,
		setFolderFileContextMenu,
		folderBgContextMenu,
		setFolderBgContextMenu,
		nestedMoveMenu,
		setNestedMoveMenu,
		renamingNestedId,
		setRenamingNestedId,
		desktopFoldersForMove,
		desktopFoldersForMoveLoading,
		folderDeletePending,
		setFolderDeletePending,
		nestedDeletePending,
		setNestedDeletePending,
		previewFile,
		setPreviewFile,
		previewFileIndex,
		setPreviewIndex,
		closePreview,
		selectedIds,
		nestedSelectedIds,
		clearSelection,
		clearNestedSelection,
		clearAllSelection,
		selectAllIds,
		focusedIndex,
		filesList,
		pathSegments,
		folderTreeRoots,
		nestedDesktopItems,
		hasNestedDesktopItems,
		nestedFolderPathPrefix,
		navigateToFolder,
		navigateToPathSegment,
		nestedMoveTargetFolders,
		nestedSelectionCanMoveToRoot,
		handleMoveNestedTargetsToFolder,
		handleNestedRenameCommit,
		requestNestedDelete,
		hasLibraryFiles,
		filtersActive,
		treeDropHighlight,
		setTreeDropHighlight,
		handleTreeDropToFolder,
		onNestedItemClick,
		toggleNestedRowSelected,
		ensureNestedSelected,
		openFolderContentManager,
		handleOpenNewFolderDialog,
		handleCreateMarkdownHere,
		runFolderUploadFiles,
		folderDropActive,
		folderDropKind,
		handleFolderBodyDrop,
		onListBodyDragEnter,
		onListBodyDragOver,
		onListBodyDragLeave,
		onListBodyPaste,
		onListBodyContextMenu,
		onListBodyBackgroundClick,
		handleMoveTargetsToFolder,
		virtualFolderListActive,
		folderListVirtHeight,
		handleFolderFileAction,
		openFileContextMenu,
		onRowClick,
		onRowDoubleClick,
		toggleRowSelected,
		libraryFileDragProps,
		handleListKeyDown,
		folderRenameOpen,
		closeFolderRename,
		setFolderRenameDraft,
		confirmFolderRename,
		refreshFolderBadgeCounts,
		canOpenNewFolderDialog,
		canCreateMarkdownInFolder,
		resetFilters,
		clearSearch,
		listBodyBusy,
		onUploadClick,
	};
}

export type FolderWindowController = ReturnType<
	typeof useFolderWindowController
>;
