/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * HTML5 drag for Unified Content rows inside desktop folder windows (same MIME as Content Manager).
 *
 * Invariants:
 * - Uses `CM_CONTENT_DRAG_MIME` so tree/sidebar drop targets accept CM and folder-window drags alike.
 *
 * Related:
 * - DesktopFolderWindow.tsx · contentManagerDrag.ts
 */

import type * as React from 'react';
import {
	CM_CONTENT_DRAG_MIME,
	setContentManagerDragGhost,
	stringifyContentDragPayload,
} from '@/pages/ContentManager/utils/contentManagerDrag';

import type { FolderFileItem } from '../hooks/useFolderContents';
import { FOLDER_WINDOW_ROOT_ID } from './desktopItemTree';

export function treeFolderIdToLibraryFolderItemId(
	targetFolderId: string
): string | null {
	if (
		!targetFolderId ||
		targetFolderId === FOLDER_WINDOW_ROOT_ID ||
		targetFolderId === 'content'
	) {
		return null;
	}
	return targetFolderId;
}

export function beginFolderWindowLibraryFileDrag(
	e: React.DragEvent,
	file: FolderFileItem,
	options: {
		filesList: FolderFileItem[];
		selectedIds: Set<string>;
	}
): void {
	const ids =
		options.selectedIds.has(file.id) && options.selectedIds.size > 1
			? options.filesList
					.filter((row) => options.selectedIds.has(row.id))
					.map((row) => row.id)
			: [file.id];
	const labelFile =
		ids.length > 1
			? (options.filesList.find((row) => row.id === ids[0]) ?? file)
			: file;
	const title = (labelFile.name || labelFile.id).trim() || labelFile.id;

	e.dataTransfer.effectAllowed = 'move';
	e.dataTransfer.setData(
		CM_CONTENT_DRAG_MIME,
		stringifyContentDragPayload({
			ids,
			items: ids.map((id) => {
				const row = options.filesList.find((f) => f.id === id);
				return {
					id,
					name: row?.name?.trim() || id,
					content_type: row?.content_type ?? null,
				};
			}),
		})
	);
	setContentManagerDragGhost(e, { title, count: ids.length });
}
