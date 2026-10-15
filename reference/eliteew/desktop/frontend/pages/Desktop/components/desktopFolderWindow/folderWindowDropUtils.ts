/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Classify folder window list-body drag payloads and map them to overlay copy keys.
 *
 * Invariants:
 * - Classification order matches useFolderWindowListBodyDrop drop handler: nested → library → upload.
 *
 * Related:
 * - useFolderWindowListBodyDrop.ts · DesktopFolderDropOverlay.tsx
 */

import { parseContentDragPayloadFromDataTransfer } from '@/pages/ContentManager/utils/contentManagerDrag';
import { parseDesktopNestedItemDragIds } from '../../utils/desktopNestedItemDrag';
import { dataTransferHasFolderTreeDrop } from '../../utils/folderWindowTreeDrop';

export type FolderDropPayloadKind =
	| 'upload'
	| 'library-move'
	| 'nested-move'
	| null;

export type FolderDropOverlayCopyKey =
	| 'folderWindow.dropUpload'
	| 'folderWindow.dropMoveLibrary'
	| 'folderWindow.dropMoveShortcut';

/** Mirror list-body drop precedence for live overlay copy. */
export function classifyFolderDropPayload(
	dt: DataTransfer | null
): FolderDropPayloadKind {
	if (!dt) return null;
	if (parseDesktopNestedItemDragIds(dt).length > 0) {
		return 'nested-move';
	}
	const payload = parseContentDragPayloadFromDataTransfer(dt);
	if (payload?.ids?.length) {
		return 'library-move';
	}
	if (dt.files?.length) {
		return 'upload';
	}
	if (dataTransferHasFolderTreeDrop(dt)) {
		return 'library-move';
	}
	return null;
}

export function resolveFolderDropOverlayCopyKey(
	kind: FolderDropPayloadKind
): FolderDropOverlayCopyKey | null {
	switch (kind) {
		case 'upload':
			return 'folderWindow.dropUpload';
		case 'library-move':
			return 'folderWindow.dropMoveLibrary';
		case 'nested-move':
			return 'folderWindow.dropMoveShortcut';
		default:
			return null;
	}
}

export function dataTransferActivatesFolderDropOverlay(
	dt: DataTransfer | null
): boolean {
	return classifyFolderDropPayload(dt) !== null;
}
