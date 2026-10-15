/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Grid, virtualized list, and plain list renderers for Unified Content files inside DesktopFolderWindow.
 *
 * Invariants:
 * - Image/video tiles use authenticated ContentThumbnail; drag MIME boundaries come from parent `libraryFileDragProps`.
 *
 * Related:
 * - DesktopFolderWindow.tsx; folderWindowListUtils.ts; folderWindowFileTypeIcon.tsx
 */

import { VirtualList } from '@/components/shared/VirtualList';
import { ContentThumbnail } from '@/components/UnifiedContent/components/ContentThumbnail/ContentThumbnail';
import {
	ArrowPathIcon,
	ClipboardDocumentCheckIcon,
	Square2StackIcon,
} from '@heroicons/react/24/outline';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { DESKTOP_TYPOGRAPHY } from '../../constants';
import type { FolderFileItem } from '../../hooks/useFolderContents';
import {
	DesktopAppButton,
	DesktopAppSectionLabel,
	DesktopAppSurface,
} from '../DesktopAppChrome';
import { DesktopChromeTooltip } from '../DesktopChromeTooltip';
import { DesktopFolderTruncatedLabel } from '../desktopFolderTooltipLabels';
import { getFolderWindowFileTypeIcon } from './folderWindowFileTypeIcon';
import {
	FOLDER_WINDOW_LIST_ROW_HEIGHT_PX,
	formatFolderItemDate,
	folderRowUsesUnifiedContentThumbnail,
} from './folderWindowListUtils';

function FolderFileNameLabel({
	name,
	className,
}: {
	name: string;
	className: string;
}) {
	return <DesktopFolderTruncatedLabel name={name} className={className} />;
}

export interface DesktopFolderLibraryFileListProps {
	filesList: FolderFileItem[];
	folderViewMode: 'grid' | 'list';
	virtualFolderListActive: boolean;
	folderListVirtHeight: number;
	folderListVirtMeasureRef: React.RefObject<HTMLDivElement | null>;
	selectedIds: Set<string>;
	focusedIndex: number;
	folderHasMore: boolean;
	folderLoadingMore: boolean;
	hasNestedDesktopItems: boolean;
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
	loadMoreFolderContents: () => void | Promise<void>;
}

function FolderLibrarySelectToggle({
	selected,
	onToggle,
	className,
}: {
	selected: boolean;
	onToggle: (e: React.MouseEvent) => void;
	className?: string;
}) {
	const { t } = useTranslation('desktopUi');
	return (
		<DesktopChromeTooltip
			content={t('folderWindow.selectToggleAria')}
			placement="top"
			offsetExtra={4}
		>
			<button
				type="button"
				aria-pressed={selected}
				aria-label={t('folderWindow.selectToggleAria')}
				onClick={onToggle}
				className={className}
			>
				{selected ? (
					<ClipboardDocumentCheckIcon className="h-4 w-4" aria-hidden />
				) : (
					<Square2StackIcon className="h-4 w-4" aria-hidden />
				)}
			</button>
		</DesktopChromeTooltip>
	);
}

function FolderLibraryRowThumbnail({ file }: { file: FolderFileItem }) {
	if (folderRowUsesUnifiedContentThumbnail(file)) {
		return <ContentThumbnail contentId={file.id} alt="" fillParent />;
	}
	return getFolderWindowFileTypeIcon(file.content_type ?? '');
}

export function DesktopFolderLibraryFileList({
	filesList,
	folderViewMode,
	virtualFolderListActive,
	folderListVirtHeight,
	folderListVirtMeasureRef,
	selectedIds,
	focusedIndex,
	folderHasMore,
	folderLoadingMore,
	hasNestedDesktopItems,
	onRowClick,
	onRowDoubleClick,
	openFileContextMenu,
	toggleRowSelected,
	libraryFileDragProps,
	loadMoreFolderContents,
}: DesktopFolderLibraryFileListProps) {
	const { t, i18n } = useTranslation('desktopUi');
	const formatDate = (file: FolderFileItem) =>
		formatFolderItemDate(file, i18n.language);

	return (
		<>
			<DesktopAppSectionLabel className="border-t border-(--desktop-border-subtle) px-4 pt-3">
				{t('folderWindow.librarySectionTitle')}
			</DesktopAppSectionLabel>
			{folderViewMode === 'grid' ? (
				<div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
					{filesList.map((file, index) => (
						<DesktopAppSurface
							key={file.id}
							variant="soft"
							data-desktop-folder-file="true"
							className={cn(
								'group relative flex cursor-pointer flex-col overflow-hidden transition-colors',
								'hover:bg-(--desktop-surface-soft-hover)',
								selectedIds.has(file.id) &&
									'ring-2 ring-[rgb(var(--desktop-accent-rgb)/0.55)] ring-inset',
								focusedIndex === index &&
									'ring-2 ring-[rgb(var(--desktop-accent-rgb)/0.35)] ring-inset'
							)}
							onClick={(e) => onRowClick(e, file, index)}
							onDoubleClick={(e) => onRowDoubleClick(e, file)}
							onContextMenu={(e) => openFileContextMenu(e, file, index)}
							{...libraryFileDragProps(file)}
						>
							<FolderLibrarySelectToggle
								selected={selectedIds.has(file.id)}
								onToggle={(e) => toggleRowSelected(e, file, index)}
								className="absolute right-2 top-2 z-1 rounded-(--desktop-radius) bg-(--desktop-surface-panel-strong)/80 p-1 text-(--desktop-text-muted) backdrop-blur-sm hover:text-(--desktop-text-primary)"
							/>
							<div className="relative flex h-14 shrink-0 items-center justify-center overflow-hidden border-b border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3">
								<FolderLibraryRowThumbnail file={file} />
							</div>
							<div className="min-w-0 p-3">
								<FolderFileNameLabel
									name={file.name}
									className={cn(
										'block',
										DESKTOP_TYPOGRAPHY.widgetTrackTitle,
										'font-medium'
									)}
								/>
								<span className={DESKTOP_TYPOGRAPHY.small}>
									{formatDate(file)}
									{typeof file.file_size === 'number' &&
										` · ${(file.file_size / 1024 / 1024).toFixed(1)} ${t('folderWindow.sizeUnit')}`}
								</span>
							</div>
						</DesktopAppSurface>
					))}
				</div>
			) : virtualFolderListActive ? (
				<div className="flex min-h-0 flex-1 flex-col px-4 pt-2">
					<div
						ref={folderListVirtMeasureRef}
						className="flex min-h-0 flex-1 flex-col pb-2"
					>
						<VirtualList
							items={filesList}
							itemHeight={FOLDER_WINDOW_LIST_ROW_HEIGHT_PX}
							height={folderListVirtHeight}
							className="min-h-0 flex-1 rounded-(--desktop-radius)"
							renderItem={(file, index) => (
								<DesktopAppSurface
									variant="soft"
									data-desktop-folder-file="true"
									className={cn(
										'flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors',
										'hover:bg-(--desktop-surface-soft-hover)',
										selectedIds.has(file.id) &&
											'bg-(--desktop-surface-accent)/25 ring-1 ring-inset ring-[rgb(var(--desktop-accent-rgb)/0.35)]',
										focusedIndex === index &&
											'ring-1 ring-inset ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
									)}
									onClick={(e) => onRowClick(e, file, index)}
									onDoubleClick={(e) => onRowDoubleClick(e, file)}
									onContextMenu={(e) => openFileContextMenu(e, file, index)}
									{...libraryFileDragProps(file)}
								>
									<FolderLibrarySelectToggle
										selected={selectedIds.has(file.id)}
										onToggle={(e) => toggleRowSelected(e, file, index)}
										className="shrink-0 text-(--desktop-text-muted) hover:text-(--desktop-text-primary)"
									/>
									<div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-(--desktop-radius) bg-(--desktop-surface-soft)">
										<FolderLibraryRowThumbnail file={file} />
									</div>
									<div className="min-w-0 flex-1">
										<FolderFileNameLabel
											name={file.name}
											className={cn(
												'block truncate font-medium',
												DESKTOP_TYPOGRAPHY.shellCopy13,
												'text-(--desktop-text-primary)'
											)}
										/>
										<span className={DESKTOP_TYPOGRAPHY.small}>
											{formatDate(file)}
										</span>
									</div>
									{typeof file.file_size === 'number' && (
										<span
											className={cn(
												'shrink-0 whitespace-nowrap tabular-nums',
												DESKTOP_TYPOGRAPHY.small
											)}
										>
											{(file.file_size / 1024 / 1024).toFixed(1)}{' '}
											{t('folderWindow.sizeUnit')}
										</span>
									)}
								</DesktopAppSurface>
							)}
							onEndReached={
								folderHasMore
									? () => {
											void loadMoreFolderContents();
										}
									: undefined
							}
							endReachedThreshold={15}
						/>
					</div>
				</div>
			) : (
				<div className="space-y-0.5 p-4">
					{filesList.map((file, index) => (
						<DesktopAppSurface
							key={file.id}
							variant="soft"
							data-desktop-folder-file="true"
							className={cn(
								'flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors',
								'hover:bg-(--desktop-surface-soft-hover)',
								selectedIds.has(file.id) &&
									'bg-(--desktop-surface-accent)/25 ring-1 ring-inset ring-[rgb(var(--desktop-accent-rgb)/0.35)]',
								focusedIndex === index &&
									'ring-1 ring-inset ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
							)}
							onClick={(e) => onRowClick(e, file, index)}
							onDoubleClick={(e) => onRowDoubleClick(e, file)}
							onContextMenu={(e) => openFileContextMenu(e, file, index)}
							{...libraryFileDragProps(file)}
						>
							<FolderLibrarySelectToggle
								selected={selectedIds.has(file.id)}
								onToggle={(e) => toggleRowSelected(e, file, index)}
								className="shrink-0 text-(--desktop-text-muted) hover:text-(--desktop-text-primary)"
							/>
							<div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-(--desktop-radius) bg-(--desktop-surface-soft)">
								<FolderLibraryRowThumbnail file={file} />
							</div>
							<div className="min-w-0 flex-1">
								<FolderFileNameLabel
									name={file.name}
									className={cn(
										'block truncate font-medium',
										DESKTOP_TYPOGRAPHY.shellCopy13,
										'text-(--desktop-text-primary)'
									)}
								/>
								<span className={DESKTOP_TYPOGRAPHY.small}>
									{formatDate(file)}
								</span>
							</div>
							{typeof file.file_size === 'number' && (
								<span
									className={cn(
										'shrink-0 whitespace-nowrap tabular-nums',
										DESKTOP_TYPOGRAPHY.small
									)}
								>
									{(file.file_size / 1024 / 1024).toFixed(1)}{' '}
									{t('folderWindow.sizeUnit')}
								</span>
							)}
						</DesktopAppSurface>
					))}
				</div>
			)}
			<p
				className={`${DESKTOP_TYPOGRAPHY.small} px-4 pb-2 text-(--desktop-text-muted)`}
			>
				{t('folderWindow.libraryDragHint')}
			</p>
			{folderHasMore && !virtualFolderListActive ? (
				<div className="flex shrink-0 justify-center border-t border-(--desktop-border-subtle) px-4 py-3">
					<DesktopAppButton
						type="button"
						variant="neutral"
						size="sm"
						onClick={() => loadMoreFolderContents()}
						disabled={folderLoadingMore}
						aria-busy={folderLoadingMore}
						className="gap-2 motion-reduce:transition-none"
					>
						{folderLoadingMore ? (
							<ArrowPathIcon
								className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
						) : null}
						{t('folderWindow.loadMore')}
					</DesktopAppButton>
				</div>
			) : null}
		</>
	);
}
