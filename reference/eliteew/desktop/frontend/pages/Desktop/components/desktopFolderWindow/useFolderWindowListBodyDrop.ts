/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Main list pane drop zone: file upload, library content move, nested shortcut move.
 *
 * Invariants:
 * - Drop highlight clears on leave when pointer exits the list body root.
 *
 * Related:
 * - DesktopFolderListBodyPanel.tsx; folderWindowTreeDrop.ts
 */

import { useCallback, useState } from 'react';
import { parseContentDragPayloadFromDataTransfer } from '@/pages/ContentManager/utils/contentManagerDrag';
import { parseDesktopNestedItemDragIds } from '../../utils/desktopNestedItemDrag';
import {
	classifyFolderDropPayload,
	dataTransferActivatesFolderDropOverlay,
	type FolderDropPayloadKind,
} from './folderWindowDropUtils';

export interface UseFolderWindowListBodyDropOptions {
	effectiveFolderId: string;
	handleNestedItemDropToFolder: (
		e: React.DragEvent,
		targetFolderId: string
	) => void;
	handleLibraryContentDropToFolder: (
		e: React.DragEvent,
		targetFolderId: string
	) => void;
	runFolderUploadFiles: (fileList: FileList | File[]) => void | Promise<void>;
}

export function useFolderWindowListBodyDrop({
	effectiveFolderId,
	handleNestedItemDropToFolder,
	handleLibraryContentDropToFolder,
	runFolderUploadFiles,
}: UseFolderWindowListBodyDropOptions) {
	const [folderDropActive, setFolderDropActive] = useState(false);
	const [folderDropKind, setFolderDropKind] =
		useState<FolderDropPayloadKind>(null);

	const syncDropHighlight = useCallback((dt: DataTransfer | null) => {
		if (!dataTransferActivatesFolderDropOverlay(dt)) {
			setFolderDropActive(false);
			setFolderDropKind(null);
			return;
		}
		setFolderDropActive(true);
		setFolderDropKind(classifyFolderDropPayload(dt));
	}, []);

	const handleFolderBodyDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setFolderDropActive(false);
			setFolderDropKind(null);
			if (parseDesktopNestedItemDragIds(e.dataTransfer).length > 0) {
				handleNestedItemDropToFolder(e, effectiveFolderId);
				return;
			}
			const payload = parseContentDragPayloadFromDataTransfer(e.dataTransfer);
			if (payload?.ids?.length) {
				handleLibraryContentDropToFolder(e, effectiveFolderId);
				return;
			}
			if (e.dataTransfer.files?.length) {
				void runFolderUploadFiles(e.dataTransfer.files);
			}
		},
		[
			effectiveFolderId,
			handleLibraryContentDropToFolder,
			handleNestedItemDropToFolder,
			runFolderUploadFiles,
		]
	);

	const onListBodyDragEnter = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			syncDropHighlight(e.dataTransfer);
		},
		[syncDropHighlight]
	);

	const onListBodyDragOver = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const kind = classifyFolderDropPayload(e.dataTransfer);
			if (!kind) return;
			e.dataTransfer.dropEffect = kind === 'upload' ? 'copy' : 'move';
			syncDropHighlight(e.dataTransfer);
		},
		[syncDropHighlight]
	);

	const onListBodyDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!e.currentTarget.contains(e.relatedTarget as Node)) {
			setFolderDropActive(false);
			setFolderDropKind(null);
		}
	}, []);

	return {
		folderDropActive,
		folderDropKind,
		handleFolderBodyDrop,
		onListBodyDragEnter,
		onListBodyDragOver,
		onListBodyDragLeave,
	};
}
