/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Main-pane library body below nested shortcuts: loading, file list, filter empty, nested hint, or full empty panel.
 *
 * Invariants:
 * - Variant resolution uses `resolveFolderLibraryBodyVariant`; parent owns selection and list callbacks.
 *
 * Related:
 * - DesktopFolderEmptyStatePanel.tsx; DesktopFolderLibraryFileList.tsx; folderWindowListUtils.ts
 */

import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { DESKTOP_TYPOGRAPHY } from '../../constants';
import type { FolderFileItem } from '../../hooks/useFolderContents';
import {
	DesktopAppButton,
	DESKTOP_APP_STYLE_CONTRACT,
} from '../DesktopAppChrome';
import { DesktopFolderEmptyStatePanel } from './DesktopFolderEmptyStatePanel';
import {
	DesktopFolderLibraryFileList,
	type DesktopFolderLibraryFileListProps,
} from './DesktopFolderLibraryFileList';
import { DesktopFolderNestedOnlyHintPanel } from './DesktopFolderNestedOnlyHintPanel';
import {
	buildFolderWindowActiveFilterSummary,
	folderWindowTypeFilterLabelKey,
	resolveFolderLibraryBodyVariant,
} from './folderWindowListUtils';

type FileListProps = Omit<
	DesktopFolderLibraryFileListProps,
	'filesList' | 'hasNestedDesktopItems'
>;

export interface DesktopFolderLibraryBodyContentProps extends FileListProps {
	folderFilesLoading: boolean;
	hasLibraryFiles: boolean;
	filtersActive: boolean;
	hasNestedDesktopItems: boolean;
	filesList: FolderFileItem[];
	folderTitle: string;
	folderUploadBusy: boolean;
	effectiveFolderId: string;
	canOpenNewFolderDialog: boolean;
	canCreateMarkdownInFolder: boolean;
	onOpenNewFolderDialog: () => void;
	onCreateMarkdownHere: () => void | Promise<void>;
	onUploadClick: () => void;
	onOpenContentManager: () => void;
	onResetFilters: () => void;
	searchQuery: string;
	contentTypeFilter: string;
	onClearSearch: () => void;
}

export function DesktopFolderLibraryBodyContent({
	folderFilesLoading,
	hasLibraryFiles,
	filtersActive,
	hasNestedDesktopItems,
	filesList,
	folderTitle,
	folderUploadBusy,
	effectiveFolderId,
	canOpenNewFolderDialog,
	canCreateMarkdownInFolder,
	onOpenNewFolderDialog,
	onCreateMarkdownHere,
	onUploadClick,
	onOpenContentManager,
	onResetFilters,
	searchQuery,
	contentTypeFilter,
	onClearSearch,
	...fileListProps
}: DesktopFolderLibraryBodyContentProps) {
	const { t } = useTranslation('desktopUi');

	const variant = resolveFolderLibraryBodyVariant({
		folderFilesLoading,
		hasLibraryFiles,
		filtersActive,
		hasNestedDesktopItems,
	});

	const filterSummary = buildFolderWindowActiveFilterSummary({
		searchQuery,
		contentTypeFilter,
	});

	switch (variant) {
		case 'loading':
			return (
				<div
					role="status"
					aria-live="polite"
					aria-busy="true"
					className="flex min-h-[min(100%,24rem)] flex-1 flex-col items-center justify-center gap-3 p-4"
				>
					<div
						className={cn(
							DESKTOP_APP_STYLE_CONTRACT.emptyIcon,
							'ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.28)]'
						)}
					>
						<ArrowPathIcon className="h-7 w-7 animate-spin text-[rgb(var(--desktop-accent-rgb))] motion-reduce:animate-none" />
					</div>
					<p
						className={`${DESKTOP_TYPOGRAPHY.body} text-(--desktop-text-secondary)`}
					>
						{t('folderWindow.loadingBody')}
					</p>
				</div>
			);
		case 'file-list':
			return (
				<DesktopFolderLibraryFileList
					filesList={filesList}
					hasNestedDesktopItems={hasNestedDesktopItems}
					{...fileListProps}
				/>
			);
		case 'filter-empty':
			return (
				<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
					<p
						className={`${DESKTOP_TYPOGRAPHY.body} max-w-md text-balance text-(--desktop-text-secondary)`}
					>
						{t('folderWindow.noResults')}
					</p>
					{filterSummary.hasSearch || filterSummary.hasTypeFilter ? (
						<p
							className={`${DESKTOP_TYPOGRAPHY.small} text-(--desktop-text-muted)`}
						>
							{filterSummary.hasSearch && filterSummary.hasTypeFilter
								? t('folderWindow.filterSummaryBoth', {
										search: filterSummary.searchQuery,
										type: t(folderWindowTypeFilterLabelKey(contentTypeFilter)),
									})
								: filterSummary.hasSearch
									? t('folderWindow.filterSummarySearch', {
											search: filterSummary.searchQuery,
										})
									: t('folderWindow.filterSummaryType', {
											type: t(
												folderWindowTypeFilterLabelKey(contentTypeFilter)
											),
										})}
						</p>
					) : null}
					<div className="flex flex-wrap justify-center gap-2">
						{filterSummary.hasSearch ? (
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="sm"
								onClick={onClearSearch}
							>
								{t('folderWindow.clearSearch')}
							</DesktopAppButton>
						) : null}
						<DesktopAppButton
							type="button"
							variant="neutral"
							size="sm"
							onClick={onResetFilters}
						>
							{t('folderWindow.resetFilters')}
						</DesktopAppButton>
					</div>
				</div>
			);
		case 'nested-only-hint':
			return (
				<DesktopFolderNestedOnlyHintPanel
					folderUploadBusy={folderUploadBusy}
					effectiveFolderId={effectiveFolderId}
					onUploadClick={onUploadClick}
					onOpenContentManager={onOpenContentManager}
				/>
			);
		case 'folder-empty':
			return (
				<DesktopFolderEmptyStatePanel
					folderTitle={folderTitle}
					folderUploadBusy={folderUploadBusy}
					effectiveFolderId={effectiveFolderId}
					canOpenNewFolderDialog={canOpenNewFolderDialog}
					canCreateMarkdownInFolder={canCreateMarkdownInFolder}
					onOpenNewFolderDialog={onOpenNewFolderDialog}
					onCreateMarkdownHere={onCreateMarkdownHere}
					onUploadClick={onUploadClick}
					onOpenContentManager={onOpenContentManager}
				/>
			);
		default: {
			const _exhaustive: never = variant;
			return _exhaustive;
		}
	}
}
