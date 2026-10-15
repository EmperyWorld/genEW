/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared HTML5 drop detection for desktop folder window tree, breadcrumb, and list body.
 *
 * Invariants:
 * - Accepts nested desktop shortcut drags and Content Manager unified-content drags only.
 *
 * Related:
 * - DesktopFolderExplorerSidebar.tsx · DesktopFolderPathBar.tsx · DesktopFolderWindow.tsx
 */

import type * as React from 'react';
import { dataTransferHasContentDrag } from '@/pages/ContentManager/utils/contentManagerDrag';
import { dataTransferHasDesktopNestedItemDrag } from './desktopNestedItemDrag';

export function dataTransferHasFolderTreeDrop(
	dt: DataTransfer | null
): boolean {
	return (
		dataTransferHasDesktopNestedItemDrag(dt) || dataTransferHasContentDrag(dt)
	);
}

export function bindFolderTreeDropTarget(options: {
	folderId: string;
	dropHighlightId: string | null;
	onDropHighlight: (folderId: string | null) => void;
	onTreeDrop: (e: React.DragEvent, targetFolderId: string) => void;
}): {
	onDragOver: (e: React.DragEvent) => void;
	onDragLeave: (e: React.DragEvent) => void;
	onDrop: (e: React.DragEvent) => void;
} {
	const { folderId, dropHighlightId, onDropHighlight, onTreeDrop } = options;
	return {
		onDragOver: (e: React.DragEvent) => {
			if (!dataTransferHasFolderTreeDrop(e.dataTransfer)) return;
			e.preventDefault();
			e.stopPropagation();
			e.dataTransfer.dropEffect = 'move';
			onDropHighlight(folderId);
		},
		onDragLeave: (e: React.DragEvent) => {
			if (!dataTransferHasFolderTreeDrop(e.dataTransfer)) return;
			e.stopPropagation();
			if (dropHighlightId === folderId) {
				onDropHighlight(null);
			}
		},
		onDrop: (e: React.DragEvent) => {
			if (!dataTransferHasFolderTreeDrop(e.dataTransfer)) return;
			e.preventDefault();
			e.stopPropagation();
			onDropHighlight(null);
			onTreeDrop(e, folderId);
		},
	};
}
