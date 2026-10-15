/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Focusable list body shell: DnD/upload drop zone, keyboard target, nested shortcuts + library file list.
 *
 * Invariants:
 * - Background context menu suppressed when target is a library file row.
 *
 * Related:
 * - useFolderWindowListBodyDrop.ts; DesktopFolderNestedItems.tsx; DesktopFolderLibraryBodyContent.tsx
 */

import { m, type Variants } from 'framer-motion';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import type { DesktopWindowStyle } from '@/types/profile';
import type { FolderFileItem } from '../../hooks/useFolderContents';
import type { DesktopItem } from '../../types/desktop.types';
import { DesktopFolderNestedItems } from '../DesktopFolderNestedItems';
import { DesktopFolderDropOverlay } from './DesktopFolderDropOverlay';
import {
	DesktopFolderLibraryBodyContent,
	type DesktopFolderLibraryBodyContentProps,
} from './DesktopFolderLibraryBodyContent';
import type { FolderDropPayloadKind } from './folderWindowDropUtils';

type LibraryBodyProps = Omit<
	DesktopFolderLibraryBodyContentProps,
	| 'folderFilesLoading'
	| 'hasLibraryFiles'
	| 'filtersActive'
	| 'hasNestedDesktopItems'
	| 'filesList'
>;

export interface DesktopFolderListBodyPanelProps extends LibraryBodyProps {
	listFocusRef: React.RefObject<HTMLDivElement | null>;
	contentVariants: Variants;
	virtualFolderListActive: boolean;
	folderDropActive: boolean;
	folderDropKind: FolderDropPayloadKind;
	onKeyDown: (e: React.KeyboardEvent) => void;
	onListBodyDragEnter: (e: React.DragEvent) => void;
	onListBodyDragOver: (e: React.DragEvent) => void;
	onListBodyDragLeave: (e: React.DragEvent) => void;
	onListBodyDrop: (e: React.DragEvent) => void;
	onListBodyPaste: (e: React.ClipboardEvent) => void;
	onListBodyContextMenu: (e: React.MouseEvent) => void;
	onListBodyBackgroundClick: (e: React.MouseEvent) => void;
	nestedDesktopItems: DesktopItem[];
	nestedFolderPathPrefix: string[];
	folderViewMode: 'grid' | 'list';
	effectiveFolderId: string;
	visualStyle: DesktopWindowStyle;
	floatingMenuZIndex: number;
	floatingMenuBackdropZIndex: number;
	nestedSelectedIds: Set<string>;
	renamingNestedId: string | null;
	onStartNestedRename: (id: string | null) => void;
	onCommitNestedRename: (itemId: string, name: string) => void;
	onCancelNestedRename: () => void;
	onRequestNestedDelete: (targets: DesktopItem[]) => void;
	onNestedItemClick: (
		e: React.MouseEvent,
		item: DesktopItem,
		index: number
	) => void;
	onToggleNestedSelect: (
		e: React.MouseEvent,
		item: DesktopItem,
		index: number
	) => void;
	onEnsureNestedSelected: (item: DesktopItem) => void;
	folderFilesLoading: boolean;
	hasLibraryFiles: boolean;
	filtersActive: boolean;
	hasNestedDesktopItems: boolean;
	filesList: FolderFileItem[];
	selectedIds: Set<string>;
	focusedIndex: number;
	onRowClick: (
		e: React.MouseEvent,
		file: FolderFileItem,
		index: number
	) => void;
	onRowDoubleClick: (e: React.MouseEvent, file: FolderFileItem) => void;
	openFileContextMenu: (
		e: React.MouseEvent,
		file: FolderFileItem,
		index: number
	) => void;
	toggleRowSelected: (
		e: React.MouseEvent,
		file: FolderFileItem,
		index: number
	) => void;
	libraryFileDragProps: (file: FolderFileItem) => {
		draggable: true;
		onDragStart: (e: React.DragEvent) => void;
	};
	listBodyBusy?: boolean;
	reduceMotion?: boolean | null;
}

export function DesktopFolderListBodyPanel({
	listFocusRef,
	contentVariants,
	virtualFolderListActive,
	folderDropActive,
	folderDropKind,
	onKeyDown,
	onListBodyDragEnter,
	onListBodyDragOver,
	onListBodyDragLeave,
	onListBodyDrop,
	onListBodyPaste,
	onListBodyContextMenu,
	onListBodyBackgroundClick,
	nestedDesktopItems,
	nestedFolderPathPrefix,
	folderViewMode,
	effectiveFolderId,
	visualStyle,
	floatingMenuZIndex,
	floatingMenuBackdropZIndex,
	nestedSelectedIds,
	renamingNestedId,
	onStartNestedRename,
	onCommitNestedRename,
	onCancelNestedRename,
	onRequestNestedDelete,
	onNestedItemClick,
	onToggleNestedSelect,
	onEnsureNestedSelected,
	folderFilesLoading,
	hasLibraryFiles,
	filtersActive,
	hasNestedDesktopItems,
	filesList,
	selectedIds,
	focusedIndex,
	onRowClick,
	onRowDoubleClick,
	openFileContextMenu,
	toggleRowSelected,
	libraryFileDragProps,
	listBodyBusy = false,
	reduceMotion,
	...libraryBodyProps
}: DesktopFolderListBodyPanelProps) {
	const { t } = useTranslation('desktopUi');

	return (
		<m.div
			ref={listFocusRef}
			tabIndex={0}
			role="region"
			aria-label={t('folderWindow.listAria')}
			aria-multiselectable="true"
			aria-busy={listBodyBusy || undefined}
			onKeyDown={onKeyDown}
			variants={contentVariants}
			className={cn(
				'relative flex min-h-0 min-w-0 flex-1 flex-col outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.35)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
				virtualFolderListActive ? 'min-h-0 overflow-hidden' : 'overflow-auto',
				folderDropActive &&
					'bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb)/0.12)_100%,transparent)]'
			)}
			onDragEnter={onListBodyDragEnter}
			onDragOver={onListBodyDragOver}
			onDragLeave={onListBodyDragLeave}
			onDrop={onListBodyDrop}
			onPaste={onListBodyPaste}
			onContextMenu={onListBodyContextMenu}
			onClick={onListBodyBackgroundClick}
		>
			<DesktopFolderNestedItems
				items={nestedDesktopItems}
				folderPath={nestedFolderPathPrefix}
				viewMode={folderViewMode}
				currentFolderId={effectiveFolderId}
				visualStyle={visualStyle}
				floatingMenuZIndex={floatingMenuZIndex}
				floatingMenuBackdropZIndex={floatingMenuBackdropZIndex}
				selectedIds={nestedSelectedIds}
				renamingId={renamingNestedId}
				onStartRename={onStartNestedRename}
				onCommitRename={onCommitNestedRename}
				onCancelRename={onCancelNestedRename}
				onRequestDelete={onRequestNestedDelete}
				onItemClick={onNestedItemClick}
				onToggleSelect={onToggleNestedSelect}
				onEnsureSelected={onEnsureNestedSelected}
			/>
			<DesktopFolderLibraryBodyContent
				folderFilesLoading={folderFilesLoading}
				hasLibraryFiles={hasLibraryFiles}
				filtersActive={filtersActive}
				hasNestedDesktopItems={hasNestedDesktopItems}
				filesList={filesList}
				folderViewMode={folderViewMode}
				selectedIds={selectedIds}
				focusedIndex={focusedIndex}
				onRowClick={onRowClick}
				onRowDoubleClick={onRowDoubleClick}
				openFileContextMenu={openFileContextMenu}
				toggleRowSelected={toggleRowSelected}
				libraryFileDragProps={libraryFileDragProps}
				{...libraryBodyProps}
			/>
			<DesktopFolderDropOverlay
				active={folderDropActive}
				kind={folderDropKind}
				reduceMotion={reduceMotion}
			/>
		</m.div>
	);
}
