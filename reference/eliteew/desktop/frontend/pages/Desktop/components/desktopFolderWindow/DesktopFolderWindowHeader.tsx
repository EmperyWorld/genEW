/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop folder window chrome above the file list: title toolbar, search/filter/sort controls, batch selection actions, and upload progress.
 *
 * Invariants:
 * - Hidden file input stays in toolbar; parent owns upload execution via `onUploadFiles`.
 *
 * Related:
 * - DesktopFolderWindow.tsx; folderWindowListUtils.ts
 */

import {
	ArrowPathIcon,
	ArrowUpTrayIcon,
	CircleStackIcon,
	DocumentTextIcon,
	FolderIcon,
	ListBulletIcon,
	QuestionMarkCircleIcon,
	Squares2X2Icon,
} from '@heroicons/react/24/outline';
import { m } from 'framer-motion';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import {
	DESKTOP_APP_ICON,
	DESKTOP_LUCIDE,
	DESKTOP_TYPOGRAPHY,
} from '../../constants';
import type {
	FolderFileItem,
	FolderWindowSortBy,
} from '../../hooks/useFolderContents';
import { FOLDER_WINDOW_ROOT_ID } from '../../utils/desktopItemTree';
import {
	DesktopAppButton,
	DesktopAppInput,
	DesktopAppSectionLabel,
	DesktopAppSurface,
	DESKTOP_NATIVE_SELECT_OPTION_CLASSNAME,
	DesktopNativeSelect,
} from '../DesktopAppChrome';
import { DesktopChromeTooltip } from '../DesktopChromeTooltip';
import { buildFolderWindowMetaSummary } from './folderWindowListUtils';
import { getFolderWindowShortcutHelpLines } from './folderWindowShortcutHelp';

export interface DesktopFolderWindowHeaderProps {
	winTitle: string;
	titleBarPresetRoot: string;
	reduceMotion: boolean | null;
	effectiveFolderId: string;
	folderFilesLoading: boolean;
	folderFiles: FolderFileItem[] | null | undefined;
	folderTotal: number;
	hasNestedDesktopItems: boolean;
	nestedDesktopItemsCount: number;
	folderUploadBusy: boolean;
	folderUploadProgress: {
		index: number;
		total: number;
		percent: number;
	} | null;
	folderUploadInputRef: React.RefObject<HTMLInputElement | null>;
	batchActionsRef: React.RefObject<HTMLDivElement | null>;
	listFocusRef: React.RefObject<HTMLDivElement | null>;
	searchInput: string;
	onSearchInputChange: (value: string) => void;
	contentTypeFilter: string;
	onContentTypeFilterChange: (value: string) => void;
	folderViewMode: 'grid' | 'list';
	onFolderViewModeChange: (mode: 'grid' | 'list') => void;
	folderSortBy: FolderWindowSortBy;
	onFolderSortByChange: (sortBy: FolderWindowSortBy) => void;
	nestedSelectedIds: Set<string>;
	selectedIds: Set<string>;
	canOpenNewFolderDialog: boolean;
	canCreateMarkdownInFolder: boolean;
	onOpenNewFolderDialog: () => void;
	onCreateMarkdownHere: () => void;
	onUploadFiles: (files: FileList | File[]) => void;
	onRefreshFolderContents: () => void;
	onOpenContentManager: () => void;
	onNestedMoveMenuOpen: (position: { x: number; y: number }) => void;
	onNestedLiftUp: () => void;
	onNestedLiftToRoot: () => void;
	onNestedBatchDelete: () => void;
	onClearNestedSelection: () => void;
	onLibraryMoveMenuOpen: (position: { x: number; y: number }) => void;
	onLibraryBatchDelete: () => void;
	onClearAllSelection: () => void;
	pathBar: React.ReactNode;
}

export function DesktopFolderWindowHeader({
	winTitle,
	titleBarPresetRoot,
	reduceMotion,
	effectiveFolderId,
	folderFilesLoading,
	folderFiles,
	folderTotal,
	hasNestedDesktopItems,
	nestedDesktopItemsCount,
	folderUploadBusy,
	folderUploadProgress,
	folderUploadInputRef,
	batchActionsRef,
	listFocusRef,
	searchInput,
	onSearchInputChange,
	contentTypeFilter,
	onContentTypeFilterChange,
	folderViewMode,
	onFolderViewModeChange,
	folderSortBy,
	onFolderSortByChange,
	nestedSelectedIds,
	selectedIds,
	canOpenNewFolderDialog,
	canCreateMarkdownInFolder,
	onOpenNewFolderDialog,
	onCreateMarkdownHere,
	onUploadFiles,
	onRefreshFolderContents,
	onOpenContentManager,
	onNestedMoveMenuOpen,
	onNestedLiftUp,
	onNestedLiftToRoot,
	onNestedBatchDelete,
	onClearNestedSelection,
	onLibraryMoveMenuOpen,
	onLibraryBatchDelete,
	onClearAllSelection,
	pathBar,
}: DesktopFolderWindowHeaderProps) {
	const { t } = useTranslation('desktopUi');

	const metaSummary = buildFolderWindowMetaSummary({
		folderFilesLoading,
		hasNestedDesktopItems,
		nestedCount: nestedDesktopItemsCount,
		folderFiles,
		folderTotal,
		labels: {
			loadingMeta: t('folderWindow.loadingMeta'),
			metaNested: (count) => t('folderWindow.metaNested', { count }),
			listMeta: (shown, total) => t('folderWindow.listMeta', { shown, total }),
			emptyMeta: t('folderWindow.emptyMeta'),
		},
	});

	const openBatchMenuAtRef = (
		ref: React.RefObject<HTMLDivElement | null>,
		fallbackRef: React.RefObject<HTMLDivElement | null>,
		open: (position: { x: number; y: number }) => void
	) => {
		const rect =
			ref.current?.getBoundingClientRect() ??
			fallbackRef.current?.getBoundingClientRect();
		const x = rect ? rect.left + 8 : 120;
		const y = rect ? rect.bottom + 6 : 160;
		open({ x, y });
	};

	return (
		<>
			<m.div
				initial={reduceMotion === true ? false : { opacity: 0, y: -10 }}
				animate={reduceMotion === true ? false : { opacity: 1, y: 0 }}
				className="shrink-0"
			>
				<div
					role="toolbar"
					className={cn(
						'flex min-w-0 shrink-0 items-center gap-3 px-4 py-3',
						titleBarPresetRoot
					)}
				>
					<div
						className={cn(
							DESKTOP_APP_ICON.container,
							'h-10 w-10 shrink-0 rounded-(--desktop-radius-lg) shadow-[0_12px_28px_rgba(0,0,0,0.35)]'
						)}
					>
						<div className={DESKTOP_APP_ICON.inner}>
							<FolderIcon
								className="h-5 w-5"
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						</div>
					</div>
					<div className="min-w-0 flex-1">
						<DesktopChromeTooltip
							content={winTitle}
							placement="bottom"
							offsetExtra={4}
						>
							<h2
								className={`${DESKTOP_TYPOGRAPHY.body} desktop-shell-display-text truncate font-semibold text-(--desktop-text-primary)`}
							>
								{winTitle}
							</h2>
						</DesktopChromeTooltip>
						<DesktopChromeTooltip
							content={t('folderWindow.listMetaHint')}
							placement="bottom"
							offsetExtra={4}
						>
							<p className={DESKTOP_TYPOGRAPHY.meta}>{metaSummary}</p>
						</DesktopChromeTooltip>
					</div>
					<div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
						<input
							ref={folderUploadInputRef}
							type="file"
							multiple
							className="hidden"
							aria-hidden
							onChange={(ev) => {
								const fl = ev.target.files;
								if (fl?.length) {
									void onUploadFiles(fl);
								}
								ev.target.value = '';
							}}
						/>
						{canOpenNewFolderDialog ? (
							<DesktopChromeTooltip
								content={t('enhancedContextMenu.desktop.newFolder')}
								placement="bottom"
								offsetExtra={6}
							>
								<span className="inline-flex">
									<DesktopAppButton
										type="button"
										variant="neutral"
										size="sm"
										onClick={onOpenNewFolderDialog}
										className={cn(
											'h-10 min-h-10 gap-1.5 px-3 motion-reduce:transition-none',
											DESKTOP_TYPOGRAPHY.caption,
											'text-(--desktop-text-primary)'
										)}
										aria-label={t('enhancedContextMenu.desktop.newFolder')}
									>
										<FolderIcon
											className="h-4 w-4 shrink-0"
											aria-hidden="true"
										/>
										<span className="hidden md:inline">
											{t('folderWindow.toolbarNewFolder')}
										</span>
									</DesktopAppButton>
								</span>
							</DesktopChromeTooltip>
						) : null}
						{canCreateMarkdownInFolder ? (
							<DesktopChromeTooltip
								content={t('enhancedContextMenu.desktop.newMarkdownFile')}
								placement="bottom"
								offsetExtra={6}
							>
								<span className="inline-flex">
									<DesktopAppButton
										type="button"
										variant="neutral"
										size="sm"
										onClick={() => void onCreateMarkdownHere()}
										className={cn(
											'h-10 min-h-10 gap-1.5 px-3 motion-reduce:transition-none',
											DESKTOP_TYPOGRAPHY.caption,
											'text-(--desktop-text-primary)'
										)}
										aria-label={t(
											'enhancedContextMenu.desktop.newMarkdownFile'
										)}
									>
										<DocumentTextIcon
											className="h-4 w-4 shrink-0"
											aria-hidden="true"
										/>
										<span className="hidden md:inline">
											{t('folderWindow.toolbarNewMarkdown')}
										</span>
									</DesktopAppButton>
								</span>
							</DesktopChromeTooltip>
						) : null}
						<DesktopChromeTooltip
							content={`${t('folderWindow.upload')}. ${t('folderWindow.pasteHint')}`}
							placement="bottom"
							offsetExtra={6}
						>
							<span className="inline-flex">
								<DesktopAppButton
									type="button"
									variant="accent"
									size="sm"
									disabled={
										folderUploadBusy ||
										folderFilesLoading ||
										effectiveFolderId === ''
									}
									aria-busy={folderUploadBusy}
									onClick={() => folderUploadInputRef.current?.click()}
									className={cn(
										'h-10 min-h-10 gap-1.5 px-3 motion-reduce:transition-none',
										DESKTOP_TYPOGRAPHY.caption,
										'text-(--desktop-text-primary)'
									)}
									aria-label={t('folderWindow.upload')}
								>
									<ArrowUpTrayIcon
										className="h-4 w-4 shrink-0"
										aria-hidden="true"
									/>
									<span className="hidden sm:inline">
										{t('folderWindow.upload')}
									</span>
								</DesktopAppButton>
							</span>
						</DesktopChromeTooltip>
						<DesktopChromeTooltip
							content={getFolderWindowShortcutHelpLines(t).join('\n')}
							placement="bottom-start"
							offsetExtra={6}
						>
							<span className="inline-flex">
								<DesktopAppButton
									type="button"
									variant="ghost"
									size="icon"
									className="h-10 w-10 motion-reduce:transition-none"
									aria-label={t('folderWindow.shortcutsHelpAria')}
								>
									<QuestionMarkCircleIcon
										className="h-4 w-4 shrink-0"
										aria-hidden="true"
									/>
								</DesktopAppButton>
							</span>
						</DesktopChromeTooltip>
						<DesktopChromeTooltip
							content={t('folderWindow.refresh')}
							placement="bottom"
							offsetExtra={6}
						>
							<span className="inline-flex">
								<DesktopAppButton
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => onRefreshFolderContents()}
									disabled={folderFilesLoading}
									aria-busy={folderFilesLoading}
									className="h-10 w-10 rounded-(--desktop-radius-section) motion-reduce:transition-none"
									aria-label={t('folderWindow.refresh')}
								>
									<ArrowPathIcon
										className={`h-4 w-4 shrink-0 motion-reduce:animate-none ${folderFilesLoading ? 'animate-spin' : ''}`}
										aria-hidden="true"
									/>
								</DesktopAppButton>
							</span>
						</DesktopChromeTooltip>
						<DesktopChromeTooltip
							content={t('folderWindow.openContentManager')}
							placement="bottom"
							offsetExtra={6}
						>
							<span className="inline-flex">
								<DesktopAppButton
									type="button"
									variant="neutral"
									size="sm"
									onClick={onOpenContentManager}
									className={cn(
										'h-10 min-h-10 gap-1.5 px-3 motion-reduce:transition-none',
										DESKTOP_TYPOGRAPHY.caption,
										'text-(--desktop-text-primary)'
									)}
									aria-label={t('folderWindow.openContentManager')}
								>
									<CircleStackIcon
										className="h-4 w-4 shrink-0"
										aria-hidden="true"
									/>
									<span className="hidden sm:inline">
										{t('folderWindow.contentManager')}
									</span>
								</DesktopAppButton>
							</span>
						</DesktopChromeTooltip>
					</div>
				</div>
			</m.div>

			{pathBar}

			<div
				className={cn(
					'flex min-w-0 shrink-0 flex-wrap items-center gap-3 border-b border-(--desktop-border-subtle) px-4 py-2.5',
					'bg-[color-mix(in_srgb,var(--desktop-surface-soft)_55%,transparent)]'
				)}
			>
				<DesktopAppSurface
					variant="soft"
					padding="sm"
					className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-[min(100%,20rem)]"
				>
					<DesktopAppInput
						type="search"
						value={searchInput}
						onChange={(ev) => onSearchInputChange(ev.target.value)}
						placeholder={t('folderWindow.searchPlaceholder')}
						className={cn(
							'h-9 min-w-0 flex-1',
							DESKTOP_TYPOGRAPHY.shellCopy13,
							'text-(--desktop-text-primary)'
						)}
						aria-label={t('folderWindow.searchAria')}
					/>
				</DesktopAppSurface>
				<label
					htmlFor="folder-type-filter"
					className="flex min-w-0 items-center gap-2"
				>
					<DesktopAppSectionLabel className="whitespace-nowrap">
						{t('folderWindow.typeFilter')}
					</DesktopAppSectionLabel>
					<DesktopNativeSelect
						id="folder-type-filter"
						value={contentTypeFilter}
						onChange={(e) => onContentTypeFilterChange(e.target.value)}
						className={cn(
							'h-9 min-w-34 max-w-[min(100%,12rem)] py-0',
							DESKTOP_TYPOGRAPHY.shellCopy13,
							'text-(--desktop-text-primary)'
						)}
						aria-label={t('folderWindow.typeFilterAria')}
					>
						<option
							className={DESKTOP_NATIVE_SELECT_OPTION_CLASSNAME}
							value="all"
						>
							{t('folderWindow.typeAll')}
						</option>
						<option
							className={DESKTOP_NATIVE_SELECT_OPTION_CLASSNAME}
							value="document"
						>
							{t('folderWindow.typeDocument')}
						</option>
						<option
							className={DESKTOP_NATIVE_SELECT_OPTION_CLASSNAME}
							value="image"
						>
							{t('folderWindow.typeImage')}
						</option>
						<option
							className={DESKTOP_NATIVE_SELECT_OPTION_CLASSNAME}
							value="video"
						>
							{t('folderWindow.typeVideo')}
						</option>
						<option
							className={DESKTOP_NATIVE_SELECT_OPTION_CLASSNAME}
							value="audio"
						>
							{t('folderWindow.typeAudio')}
						</option>
					</DesktopNativeSelect>
				</label>
				<DesktopAppSurface
					variant="soft"
					padding="sm"
					className="flex items-center gap-1"
				>
					<DesktopChromeTooltip
						content={t('folderWindow.viewGrid')}
						placement="bottom"
						offsetExtra={6}
					>
						<span className="inline-flex">
							<DesktopAppButton
								type="button"
								variant={folderViewMode === 'grid' ? 'accent' : 'ghost'}
								size="icon"
								onClick={() => onFolderViewModeChange('grid')}
								aria-pressed={folderViewMode === 'grid'}
								className="h-10 w-10 motion-reduce:transition-none"
								aria-label={t('folderWindow.viewGridAria')}
							>
								<Squares2X2Icon
									className="h-4 w-4 shrink-0"
									aria-hidden="true"
								/>
							</DesktopAppButton>
						</span>
					</DesktopChromeTooltip>
					<DesktopChromeTooltip
						content={t('folderWindow.viewList')}
						placement="bottom"
						offsetExtra={6}
					>
						<span className="inline-flex">
							<DesktopAppButton
								type="button"
								variant={folderViewMode === 'list' ? 'accent' : 'ghost'}
								size="icon"
								onClick={() => onFolderViewModeChange('list')}
								aria-pressed={folderViewMode === 'list'}
								className="h-10 w-10 motion-reduce:transition-none"
								aria-label={t('folderWindow.viewListAria')}
							>
								<ListBulletIcon
									className="h-4 w-4 shrink-0"
									aria-hidden="true"
								/>
							</DesktopAppButton>
						</span>
					</DesktopChromeTooltip>
				</DesktopAppSurface>
				<label
					htmlFor="folder-sort-by"
					className="flex min-w-0 items-center gap-2"
				>
					<DesktopAppSectionLabel>
						{t('folderWindow.sortSection')}
					</DesktopAppSectionLabel>
					<DesktopNativeSelect
						id="folder-sort-by"
						value={folderSortBy}
						onChange={(e) =>
							onFolderSortByChange(e.target.value as FolderWindowSortBy)
						}
						className={cn(
							'h-9 min-w-40 max-w-[min(100%,18rem)] py-0',
							DESKTOP_TYPOGRAPHY.shellCopy13,
							'text-(--desktop-text-primary)'
						)}
						aria-label={t('folderWindow.sortAria')}
					>
						<option
							className={DESKTOP_NATIVE_SELECT_OPTION_CLASSNAME}
							value="name"
						>
							{t('folderWindow.sortByName')}
						</option>
						<option
							className={DESKTOP_NATIVE_SELECT_OPTION_CLASSNAME}
							value="date"
						>
							{t('folderWindow.sortByDate')}
						</option>
						<option
							className={DESKTOP_NATIVE_SELECT_OPTION_CLASSNAME}
							value="size"
						>
							{t('folderWindow.sortBySize')}
						</option>
					</DesktopNativeSelect>
				</label>
			</div>

			{nestedSelectedIds.size > 0 && selectedIds.size > 0 ? (
				<div
					role="status"
					className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-(--desktop-border-subtle) px-4 py-2"
				>
					<DesktopChromeTooltip
						content={t('folderWindow.mixedSelectionHint')}
						placement="bottom"
						offsetExtra={6}
					>
						<span
							className={`${DESKTOP_TYPOGRAPHY.small} text-(--desktop-text-secondary)`}
						>
							{t('folderWindow.mixedSelectionBlocked')}
						</span>
					</DesktopChromeTooltip>
					<DesktopAppButton
						type="button"
						variant="ghost"
						size="sm"
						onClick={onClearAllSelection}
					>
						{t('folderWindow.clearSelection')}
					</DesktopAppButton>
				</div>
			) : nestedSelectedIds.size > 0 ? (
				<div
					ref={batchActionsRef}
					role="status"
					className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-(--desktop-border-subtle) px-4 py-2"
				>
					<span
						className={`${DESKTOP_TYPOGRAPHY.small} text-(--desktop-text-secondary)`}
					>
						{t('folderWindow.selectionCount', {
							count: nestedSelectedIds.size,
						})}
					</span>
					<div className="flex flex-wrap gap-2">
						<DesktopAppButton
							type="button"
							variant="neutral"
							size="sm"
							onClick={() =>
								openBatchMenuAtRef(
									batchActionsRef,
									listFocusRef,
									onNestedMoveMenuOpen
								)
							}
						>
							{t('folderWindow.batchMove')}
						</DesktopAppButton>
						{effectiveFolderId !== FOLDER_WINDOW_ROOT_ID ? (
							<DesktopAppButton
								type="button"
								variant="neutral"
								size="sm"
								onClick={onNestedLiftUp}
							>
								{t('folderWindow.nestedBatchLiftUp')}
							</DesktopAppButton>
						) : null}
						<DesktopAppButton
							type="button"
							variant="neutral"
							size="sm"
							onClick={onNestedLiftToRoot}
						>
							{t('folderWindow.nestedBatchLiftRoot')}
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant="danger"
							size="sm"
							onClick={onNestedBatchDelete}
						>
							{t('folderWindow.nestedBatchDelete')}
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							onClick={onClearNestedSelection}
						>
							{t('folderWindow.clearSelection')}
						</DesktopAppButton>
					</div>
				</div>
			) : selectedIds.size > 0 ? (
				<div
					ref={batchActionsRef}
					role="status"
					className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-(--desktop-border-subtle) px-4 py-2"
				>
					<span
						className={`${DESKTOP_TYPOGRAPHY.small} text-(--desktop-text-secondary)`}
					>
						{t('folderWindow.selectionCount', { count: selectedIds.size })}
					</span>
					<div className="flex flex-wrap gap-2">
						<DesktopAppButton
							type="button"
							variant="neutral"
							size="sm"
							onClick={() => {
								if (selectedIds.size === 0) return;
								openBatchMenuAtRef(
									batchActionsRef,
									listFocusRef,
									onLibraryMoveMenuOpen
								);
							}}
						>
							{t('folderWindow.batchMove')}
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant="danger"
							size="sm"
							onClick={onLibraryBatchDelete}
						>
							{t('folderWindow.batchDelete')}
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							onClick={onClearAllSelection}
						>
							{t('folderWindow.clearSelection')}
						</DesktopAppButton>
					</div>
				</div>
			) : null}

			{folderUploadProgress ? (
				<div
					className="shrink-0 border-b border-(--desktop-border-subtle) px-4 py-2"
					role="status"
					aria-live="polite"
					aria-busy={folderUploadBusy}
				>
					<p
						className={`${DESKTOP_TYPOGRAPHY.small} mb-2 text-(--desktop-text-secondary)`}
					>
						{t('folderWindow.uploadProgressLabel', {
							current: folderUploadProgress.index,
							total: folderUploadProgress.total,
							percent: Math.round(folderUploadProgress.percent),
						})}
					</p>
					<div className="h-1 overflow-hidden rounded-full bg-(--desktop-surface-soft)">
						<div
							className="h-full rounded-full bg-[rgb(var(--desktop-accent-rgb))] motion-reduce:transition-none"
							style={{
								width: `${Math.min(100, Math.max(0, folderUploadProgress.percent))}%`,
							}}
						/>
					</div>
				</div>
			) : null}
		</>
	);
}
