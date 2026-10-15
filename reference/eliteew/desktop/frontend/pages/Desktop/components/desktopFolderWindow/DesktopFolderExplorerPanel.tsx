/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Explorer row in folder window: collapsible folder tree rail + focusable list body panel.
 *
 * Invariants:
 * - Tree drop MIME boundaries unchanged; delegates to parent tree drop handlers.
 *
 * Related:
 * - DesktopFolderExplorerSidebar.tsx · DesktopFolderListBodyPanel.tsx
 */

import type { DesktopFolderTreeNode } from '../../utils/desktopItemTree';
import { DesktopFolderExplorerSidebar } from './DesktopFolderExplorerSidebar';
import {
	DesktopFolderListBodyPanel,
	type DesktopFolderListBodyPanelProps,
} from './DesktopFolderListBodyPanel';

export interface DesktopFolderExplorerPanelProps
	extends DesktopFolderListBodyPanelProps {
	treeRoots: DesktopFolderTreeNode[];
	activeFolderId: string | undefined;
	onSelectFolder: (folderId: string) => void;
	dropHighlightId: string | null;
	onDropHighlight: (folderId: string | null) => void;
	onTreeDrop: (e: React.DragEvent, targetFolderId: string) => void;
}

export function DesktopFolderExplorerPanel({
	treeRoots,
	activeFolderId,
	onSelectFolder,
	dropHighlightId,
	onDropHighlight,
	onTreeDrop,
	...listBodyProps
}: DesktopFolderExplorerPanelProps) {
	return (
		<div className="flex min-h-0 min-w-0 flex-1">
			<DesktopFolderExplorerSidebar
				treeRoots={treeRoots}
				activeFolderId={activeFolderId}
				onSelectFolder={onSelectFolder}
				dropHighlightId={dropHighlightId}
				onDropHighlight={onDropHighlight}
				onTreeDrop={onTreeDrop}
			/>
			<DesktopFolderListBodyPanel {...listBodyProps} />
		</div>
	);
}
