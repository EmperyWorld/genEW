/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Folder window shell layout (slice 6): header, explorer panel, context menus, modals.
 *
 * Invariants:
 * - Portaled menus/modals use floatingMenuZIndex from parent window layer.
 * - Header/context ``winTitle`` is display-localized; navigation path keeps API ``win.title``.
 *
 * Related:
 * - DesktopFolderWindow.tsx · useFolderWindowController.ts · desktopWindowDisplayTitle.ts
 */

import { m, type Variants } from 'framer-motion';
import { cn } from '@/utils/cn';
import type { DesktopWindowStyle } from '@/types/profile';
import { resolveDesktopWindowDisplayTitle } from '../../utils/desktopWindowDisplayTitle';
import { getDesktopShellContentPanelClassName } from '../../utils/desktopVisualSystem';
import { DesktopFolderPathBar } from '../DesktopFolderPathBar';
import { DesktopFolderFilePreviewHost } from './DesktopFolderFilePreviewHost';
import { FilePreviewModal } from '../FilePreviewModal';
import { DesktopFolderContextMenus } from './DesktopFolderContextMenus';
import { DesktopFolderDeleteModals } from './DesktopFolderDeleteModals';
import { DesktopFolderExplorerPanel } from './DesktopFolderExplorerPanel';
import { DesktopFolderRenameModal } from './DesktopFolderRenameModal';
import { DesktopFolderWindowHeader } from './DesktopFolderWindowHeader';
import type { FolderWindowController } from './useFolderWindowController';

export interface DesktopFolderWindowShellProps {
	controller: FolderWindowController;
	visualStyle: DesktopWindowStyle;
	contentVariants: Variants;
	reduceMotion: boolean | null;
	floatingMenuZIndex: number;
	floatingMenuBackdropZIndex: number;
	titleBarPreset: { root: string };
}

export function DesktopFolderWindowShell({
	controller: c,
	visualStyle,
	contentVariants,
	reduceMotion,
	floatingMenuZIndex,
	floatingMenuBackdropZIndex,
	titleBarPreset,
}: DesktopFolderWindowShellProps) {
	const displayWinTitle = resolveDesktopWindowDisplayTitle(c.win);

	return (
		<>
			<m.div
				variants={contentVariants}
				className="flex h-full min-h-0 flex-col text-(--desktop-text-primary)"
			>
				<div
					className={cn(
						'mx-3 mb-3 mt-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
						getDesktopShellContentPanelClassName(visualStyle)
					)}
				>
					<DesktopFolderWindowHeader
						winTitle={displayWinTitle}
						titleBarPresetRoot={titleBarPreset.root}
						reduceMotion={reduceMotion}
						effectiveFolderId={c.effectiveFolderId}
						folderFilesLoading={c.folderFilesLoading}
						folderFiles={c.folderFiles}
						folderTotal={c.folderTotal}
						hasNestedDesktopItems={c.hasNestedDesktopItems}
						nestedDesktopItemsCount={c.nestedDesktopItems.length}
						folderUploadBusy={c.folderUploadBusy}
						folderUploadProgress={c.folderUploadProgress}
						folderUploadInputRef={c.folderUploadInputRef}
						batchActionsRef={c.batchActionsRef}
						listFocusRef={c.listFocusRef}
						searchInput={c.searchInput}
						onSearchInputChange={c.setSearchInput}
						contentTypeFilter={c.contentTypeFilter}
						onContentTypeFilterChange={c.setContentTypeFilter}
						folderViewMode={c.folderViewMode}
						onFolderViewModeChange={c.setFolderViewMode}
						folderSortBy={c.folderSortBy}
						onFolderSortByChange={c.setFolderSortBy}
						nestedSelectedIds={c.nestedSelectedIds}
						selectedIds={c.selectedIds}
						canOpenNewFolderDialog={c.canOpenNewFolderDialog}
						canCreateMarkdownInFolder={c.canCreateMarkdownInFolder}
						onOpenNewFolderDialog={c.handleOpenNewFolderDialog}
						onCreateMarkdownHere={c.handleCreateMarkdownHere}
						onUploadFiles={c.runFolderUploadFiles}
						onRefreshFolderContents={c.fetchFolderContent}
						onOpenContentManager={c.openFolderContentManager}
						onNestedMoveMenuOpen={(position) => c.setNestedMoveMenu(position)}
						onNestedLiftUp={() => {
							c.appProps?.liftDesktopItemsOneLevel?.(
								Array.from(c.nestedSelectedIds),
								c.effectiveFolderId
							);
							c.clearNestedSelection();
						}}
						onNestedLiftToRoot={() => {
							c.appProps?.liftDesktopItemsToRoot?.(
								Array.from(c.nestedSelectedIds)
							);
							c.clearNestedSelection();
						}}
						onNestedBatchDelete={() =>
							c.requestNestedDelete(
								c.nestedDesktopItems.filter((row) =>
									c.nestedSelectedIds.has(row.id)
								)
							)
						}
						onClearNestedSelection={c.clearNestedSelection}
						onLibraryMoveMenuOpen={(position) => {
							c.setFolderFileContextMenu({
								x: position.x,
								y: position.y,
								targets: c.filesList.filter((f) => c.selectedIds.has(f.id)),
								submenu: 'move',
							});
						}}
						onLibraryBatchDelete={() =>
							c.setFolderDeletePending(
								c.filesList.filter((f) => c.selectedIds.has(f.id))
							)
						}
						onClearAllSelection={c.clearAllSelection}
						pathBar={
							<DesktopFolderPathBar
								segments={c.pathSegments}
								activeFolderId={c.effectiveFolderId}
								onNavigate={c.navigateToPathSegment}
								dropHighlightId={c.treeDropHighlight}
								onDropHighlight={c.setTreeDropHighlight}
								onTreeDrop={c.handleTreeDropToFolder}
							/>
						}
					/>

					<DesktopFolderExplorerPanel
						treeRoots={c.folderTreeRoots}
						activeFolderId={c.effectiveFolderId}
						onSelectFolder={c.navigateToFolder}
						dropHighlightId={c.treeDropHighlight}
						onDropHighlight={c.setTreeDropHighlight}
						onTreeDrop={c.handleTreeDropToFolder}
						listFocusRef={c.listFocusRef}
						contentVariants={contentVariants}
						virtualFolderListActive={c.virtualFolderListActive}
						folderDropActive={c.folderDropActive}
						folderDropKind={c.folderDropKind}
						onKeyDown={c.handleListKeyDown}
						onListBodyDragEnter={c.onListBodyDragEnter}
						onListBodyDragOver={c.onListBodyDragOver}
						onListBodyDragLeave={c.onListBodyDragLeave}
						onListBodyDrop={c.handleFolderBodyDrop}
						onListBodyPaste={c.onListBodyPaste}
						onListBodyContextMenu={c.onListBodyContextMenu}
						onListBodyBackgroundClick={c.onListBodyBackgroundClick}
						nestedDesktopItems={c.nestedDesktopItems}
						nestedFolderPathPrefix={c.nestedFolderPathPrefix}
						folderViewMode={c.folderViewMode}
						effectiveFolderId={c.effectiveFolderId}
						visualStyle={visualStyle}
						floatingMenuZIndex={floatingMenuZIndex}
						floatingMenuBackdropZIndex={floatingMenuBackdropZIndex}
						nestedSelectedIds={c.nestedSelectedIds}
						renamingNestedId={c.renamingNestedId}
						onStartNestedRename={c.setRenamingNestedId}
						onCommitNestedRename={c.handleNestedRenameCommit}
						onCancelNestedRename={() => c.setRenamingNestedId(null)}
						onRequestNestedDelete={c.requestNestedDelete}
						onNestedItemClick={c.onNestedItemClick}
						onToggleNestedSelect={c.toggleNestedRowSelected}
						onEnsureNestedSelected={c.ensureNestedSelected}
						folderFilesLoading={c.folderFilesLoading}
						hasLibraryFiles={c.hasLibraryFiles}
						filtersActive={c.filtersActive}
						hasNestedDesktopItems={c.hasNestedDesktopItems}
						filesList={c.filesList}
						selectedIds={c.selectedIds}
						focusedIndex={c.focusedIndex}
						folderHasMore={c.folderHasMore}
						folderLoadingMore={c.folderLoadingMore}
						onRowClick={c.onRowClick}
						onRowDoubleClick={c.onRowDoubleClick}
						openFileContextMenu={c.openFileContextMenu}
						toggleRowSelected={c.toggleRowSelected}
						libraryFileDragProps={c.libraryFileDragProps}
						loadMoreFolderContents={c.loadMoreFolderContents}
						folderListVirtHeight={c.folderListVirtHeight}
						folderListVirtMeasureRef={c.folderListVirtMeasureRef}
						folderTitle={c.win.title}
						folderUploadBusy={c.folderUploadBusy}
						canOpenNewFolderDialog={c.canOpenNewFolderDialog}
						canCreateMarkdownInFolder={c.canCreateMarkdownInFolder}
						onOpenNewFolderDialog={c.handleOpenNewFolderDialog}
						onCreateMarkdownHere={c.handleCreateMarkdownHere}
						onUploadClick={c.onUploadClick}
						onOpenContentManager={c.openFolderContentManager}
						onResetFilters={c.resetFilters}
						searchQuery={c.searchInput}
						contentTypeFilter={c.contentTypeFilter}
						onClearSearch={c.clearSearch}
						listBodyBusy={c.listBodyBusy}
						reduceMotion={reduceMotion}
					/>
				</div>

				<DesktopFolderContextMenus
					visualStyle={visualStyle}
					reduceMotion={reduceMotion}
					floatingMenuZIndex={floatingMenuZIndex}
					floatingMenuBackdropZIndex={floatingMenuBackdropZIndex}
					winTitle={displayWinTitle}
					folderFileContextMenu={c.folderFileContextMenu}
					setFolderFileContextMenu={c.setFolderFileContextMenu}
					folderBgContextMenu={c.folderBgContextMenu}
					setFolderBgContextMenu={c.setFolderBgContextMenu}
					nestedMoveMenu={c.nestedMoveMenu}
					setNestedMoveMenu={c.setNestedMoveMenu}
					desktopFoldersForMove={c.desktopFoldersForMove}
					desktopFoldersForMoveLoading={c.desktopFoldersForMoveLoading}
					nestedMoveTargetFolders={c.nestedMoveTargetFolders}
					nestedSelectionCanMoveToRoot={c.nestedSelectionCanMoveToRoot}
					filesList={c.filesList}
					selectedIds={c.selectedIds}
					nestedSelectedIds={c.nestedSelectedIds}
					canOpenNewFolderDialog={c.canOpenNewFolderDialog}
					canCreateMarkdownInFolder={c.canCreateMarkdownInFolder}
					onOpenNewFolderDialog={c.handleOpenNewFolderDialog}
					onCreateMarkdownHere={c.handleCreateMarkdownHere}
					onRefreshFolderContents={c.fetchFolderContent}
					onUploadClick={c.onUploadClick}
					onSelectAllFiles={() => {
						c.clearNestedSelection();
						c.selectAllIds(c.filesList.map((f) => f.id));
					}}
					onClearAllSelection={c.clearAllSelection}
					onFolderFileAction={c.handleFolderFileAction}
					onMoveLibraryTargetsToFolder={c.handleMoveTargetsToFolder}
					onMoveNestedTargetsToFolder={c.handleMoveNestedTargetsToFolder}
					onRequestLibraryDelete={c.setFolderDeletePending}
				/>
			</m.div>

			{c.previewFile && c.previewFileIndex != null ? (
				<DesktopFolderFilePreviewHost
					filesList={c.filesList}
					previewIndex={c.previewFileIndex}
					onPreviewIndexChange={c.setPreviewIndex}
					onClose={c.closePreview}
					floatingMenuZIndex={floatingMenuZIndex}
				/>
			) : c.previewFile ? (
				<FilePreviewModal
					contentId={c.previewFile.id}
					name={c.previewFile.name}
					content_type={c.previewFile.content_type}
					mime_type={c.previewFile.mime_type}
					onClose={c.closePreview}
				/>
			) : null}

			<DesktopFolderRenameModal
				folderRenameOpen={c.folderRenameOpen}
				floatingMenuZIndex={floatingMenuZIndex}
				floatingMenuBackdropZIndex={floatingMenuBackdropZIndex}
				onClose={c.closeFolderRename}
				onDraftChange={c.setFolderRenameDraft}
				onConfirm={c.confirmFolderRename}
			/>

			<DesktopFolderDeleteModals
				effectiveFolderId={c.effectiveFolderId}
				folderDeletePending={c.folderDeletePending}
				setFolderDeletePending={c.setFolderDeletePending}
				setFolderFiles={c.setFolderFiles}
				clearSelection={c.clearSelection}
				refreshFolderBadgeCounts={c.refreshFolderBadgeCounts}
				nestedDeletePending={c.nestedDeletePending}
				setNestedDeletePending={c.setNestedDeletePending}
				clearNestedSelection={c.clearNestedSelection}
				onDeleteNestedItems={c.appProps?.deleteDesktopItems}
			/>
		</>
	);
}
