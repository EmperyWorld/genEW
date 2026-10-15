/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Portaled context menus for Desktop folder window: library file actions, nested shortcut move targets, and folder background actions.
 *
 * Invariants:
 * - Download/move/delete actions delegate to parent callbacks; no drag MIME changes here.
 *
 * Related:
 * - DesktopFolderWindow.tsx; folderWindowPortalShell.tsx
 */

import { contentApi } from '@/services/contentApi';
import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	ArrowUpTrayIcon,
	ChevronRightIcon,
	DocumentTextIcon,
	EyeIcon,
	FolderArrowDownIcon,
	FolderIcon,
	FolderMinusIcon,
	PencilSquareIcon,
	PlayIcon,
	TrashIcon,
} from '@heroicons/react/24/outline';
import { m } from 'framer-motion';
import type * as React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { DESKTOP_LUCIDE, DESKTOP_TYPOGRAPHY } from '../../constants';
import type { FolderFileItem } from '../../hooks/useFolderContents';
import type { DesktopWindowStyle } from '@/types/profile';
import { isUnifiedContentAudioLike } from '../../utils/desktopAudioContent';
import {
	DesktopAppMenuDivider,
	DesktopAppMenuItem,
	DesktopAppMenuSurface,
} from '../DesktopAppChrome';
import { DesktopFolderMoveTargetMenuItem } from '../desktopFolderTooltipLabels';
import { wrapFolderWindowPortalShell } from './folderWindowPortalShell';

export type FolderFileContextMenuState = {
	x: number;
	y: number;
	targets: FolderFileItem[];
	submenu?: 'move';
} | null;

export type FolderBgContextMenuState = {
	x: number;
	y: number;
} | null;

export type NestedMoveMenuState = {
	x: number;
	y: number;
} | null;

export interface DesktopFolderContextMenusProps {
	visualStyle: DesktopWindowStyle;
	reduceMotion: boolean | null;
	floatingMenuZIndex: number;
	floatingMenuBackdropZIndex: number;
	winTitle: string;
	folderFileContextMenu: FolderFileContextMenuState;
	setFolderFileContextMenu: React.Dispatch<
		React.SetStateAction<FolderFileContextMenuState>
	>;
	folderBgContextMenu: FolderBgContextMenuState;
	setFolderBgContextMenu: React.Dispatch<
		React.SetStateAction<FolderBgContextMenuState>
	>;
	nestedMoveMenu: NestedMoveMenuState;
	setNestedMoveMenu: React.Dispatch<React.SetStateAction<NestedMoveMenuState>>;
	desktopFoldersForMove: { id: string; name: string }[];
	desktopFoldersForMoveLoading: boolean;
	nestedMoveTargetFolders: { id: string; name: string }[];
	nestedSelectionCanMoveToRoot: boolean;
	filesList: FolderFileItem[];
	selectedIds: Set<string>;
	nestedSelectedIds: Set<string>;
	canOpenNewFolderDialog: boolean;
	canCreateMarkdownInFolder: boolean;
	onOpenNewFolderDialog: () => void;
	onCreateMarkdownHere: () => void | Promise<void>;
	onRefreshFolderContents: () => void | Promise<void>;
	onUploadClick: () => void;
	onSelectAllFiles: () => void;
	onClearAllSelection: () => void;
	onFolderFileAction: (
		action: 'view' | 'download' | 'rename' | 'delete' | 'play-in-player',
		file: FolderFileItem
	) => void;
	onMoveLibraryTargetsToFolder: (
		targets: FolderFileItem[],
		folderItemId: string | null
	) => void;
	onMoveNestedTargetsToFolder: (targetFolderId: string | null) => void;
	onRequestLibraryDelete: (targets: FolderFileItem[]) => void;
}

export function DesktopFolderContextMenus({
	visualStyle,
	reduceMotion,
	floatingMenuZIndex,
	floatingMenuBackdropZIndex,
	winTitle,
	folderFileContextMenu,
	setFolderFileContextMenu,
	folderBgContextMenu,
	setFolderBgContextMenu,
	nestedMoveMenu,
	setNestedMoveMenu,
	desktopFoldersForMove,
	desktopFoldersForMoveLoading,
	nestedMoveTargetFolders,
	nestedSelectionCanMoveToRoot,
	filesList,
	selectedIds,
	nestedSelectedIds,
	canOpenNewFolderDialog,
	canCreateMarkdownInFolder,
	onOpenNewFolderDialog,
	onCreateMarkdownHere,
	onRefreshFolderContents,
	onUploadClick,
	onSelectAllFiles,
	onClearAllSelection,
	onFolderFileAction,
	onMoveLibraryTargetsToFolder,
	onMoveNestedTargetsToFolder,
	onRequestLibraryDelete,
}: DesktopFolderContextMenusProps) {
	const { t } = useTranslation('desktopUi');

	const ctxTargets = folderFileContextMenu?.targets ?? [];
	const isMultiContext = ctxTargets.length > 1;

	if (typeof document === 'undefined') {
		return null;
	}

	return (
		<>
			{folderFileContextMenu
				? createPortal(
						wrapFolderWindowPortalShell(
							<>
								<div
									className="fixed inset-0"
									style={{ zIndex: floatingMenuBackdropZIndex }}
									aria-hidden
									onClick={() => setFolderFileContextMenu(null)}
								/>
								<m.div
									initial={
										reduceMotion === true ? false : { opacity: 0, scale: 0.95 }
									}
									animate={{ opacity: 1, scale: 1 }}
									className="fixed"
									style={{
										left: folderFileContextMenu.x,
										top: folderFileContextMenu.y,
										zIndex: floatingMenuZIndex,
									}}
								>
									<DesktopAppMenuSurface
										windowStyle={visualStyle}
										className="flex max-h-[70vh] min-w-[196px] flex-col overflow-hidden"
									>
										{folderFileContextMenu.submenu === 'move' ? (
											<>
												<DesktopAppMenuItem
													type="button"
													icon={
														<ChevronRightIcon
															className="h-4 w-4 rotate-180"
															strokeWidth={DESKTOP_LUCIDE.stroke}
														/>
													}
													onClick={() =>
														setFolderFileContextMenu((prev) =>
															prev ? { ...prev, submenu: undefined } : null
														)
													}
												>
													{t('folderWindow.contextBack')}
												</DesktopAppMenuItem>
												<DesktopAppMenuDivider />
												{desktopFoldersForMoveLoading ? (
													<div
														role="status"
														aria-live="polite"
														className="flex items-center justify-center gap-2 px-3 py-4 text-(--desktop-text-muted)"
													>
														<ArrowPathIcon
															className="h-4 w-4 animate-spin motion-reduce:animate-none"
															aria-hidden="true"
														/>
														<span className={DESKTOP_TYPOGRAPHY.meta}>
															{t('folderWindow.contextLoadingFolders')}
														</span>
													</div>
												) : (
													<div className="overflow-y-auto py-0.5">
														{desktopFoldersForMove.map((f) => (
															<DesktopFolderMoveTargetMenuItem
																key={f.id}
																folderName={f.name}
																icon={
																	<FolderIcon
																		className="h-4 w-4"
																		strokeWidth={DESKTOP_LUCIDE.stroke}
																	/>
																}
																onClick={() =>
																	onMoveLibraryTargetsToFolder(ctxTargets, f.id)
																}
															/>
														))}
														<DesktopAppMenuDivider />
														<DesktopAppMenuItem
															type="button"
															icon={
																<FolderMinusIcon
																	className="h-4 w-4"
																	strokeWidth={DESKTOP_LUCIDE.stroke}
																/>
															}
															onClick={() =>
																onMoveLibraryTargetsToFolder(ctxTargets, null)
															}
														>
															{t('folderWindow.contextUnfiled')}
														</DesktopAppMenuItem>
													</div>
												)}
											</>
										) : (
											<>
												{!isMultiContext ? (
													<>
														<DesktopAppMenuItem
															type="button"
															icon={
																<EyeIcon
																	className="h-4 w-4"
																	strokeWidth={DESKTOP_LUCIDE.stroke}
																/>
															}
															onClick={() => {
																const f = ctxTargets[0];
																if (f) onFolderFileAction('view', f);
															}}
														>
															{t('folderWindow.contextView')}
														</DesktopAppMenuItem>
														{isUnifiedContentAudioLike({
															content_type: ctxTargets[0]?.content_type,
															mime_type:
																typeof ctxTargets[0]?.mime_type === 'string'
																	? ctxTargets[0].mime_type
																	: null,
															name: ctxTargets[0]?.name,
														}) ? (
															<DesktopAppMenuItem
																type="button"
																icon={
																	<PlayIcon
																		className="h-4 w-4"
																		strokeWidth={DESKTOP_LUCIDE.stroke}
																		aria-hidden="true"
																	/>
																}
																onClick={() => {
																	const f = ctxTargets[0];
																	if (f) {
																		onFolderFileAction('play-in-player', f);
																	}
																}}
															>
																{t('folderWindow.contextPlayInPlayer')}
															</DesktopAppMenuItem>
														) : null}
														<DesktopAppMenuItem
															type="button"
															icon={
																<ArrowDownTrayIcon
																	className="h-4 w-4"
																	strokeWidth={DESKTOP_LUCIDE.stroke}
																/>
															}
															onClick={() => {
																const f = ctxTargets[0];
																if (f) {
																	onFolderFileAction('download', f);
																}
															}}
														>
															{t('folderWindow.contextDownload')}
														</DesktopAppMenuItem>
														<DesktopAppMenuItem
															type="button"
															icon={
																<PencilSquareIcon
																	className="h-4 w-4"
																	strokeWidth={DESKTOP_LUCIDE.stroke}
																/>
															}
															onClick={() => {
																const f = ctxTargets[0];
																if (f) onFolderFileAction('rename', f);
															}}
														>
															{t('folderWindow.contextRename')}
														</DesktopAppMenuItem>
													</>
												) : (
													<DesktopAppMenuItem
														type="button"
														icon={
															<ArrowDownTrayIcon
																className="h-4 w-4"
																strokeWidth={DESKTOP_LUCIDE.stroke}
															/>
														}
														onClick={() => {
															setFolderFileContextMenu(null);
															void (async () => {
																try {
																	await contentApi.batchDownloadToBrowser({
																		contentIds: ctxTargets.map((f) => f.id),
																		archiveName: `${winTitle || 'folder'}_${new Date().toISOString().slice(0, 10)}.zip`,
																	});
																} catch (err) {
																	console.error(
																		'[DesktopFolderWindow] batch download',
																		err
																	);
																}
															})();
														}}
													>
														{t('folderWindow.contextDownloadAll', {
															count: ctxTargets.length,
														})}
													</DesktopAppMenuItem>
												)}
												<DesktopAppMenuItem
													type="button"
													icon={
														<FolderArrowDownIcon
															className="h-4 w-4"
															strokeWidth={DESKTOP_LUCIDE.stroke}
														/>
													}
													hasSubmenu
													onClick={() =>
														setFolderFileContextMenu((prev) =>
															prev ? { ...prev, submenu: 'move' } : null
														)
													}
												>
													{t('folderWindow.contextMove')}
												</DesktopAppMenuItem>
												<DesktopAppMenuDivider />
												<DesktopAppMenuItem
													type="button"
													tone="danger"
													icon={
														<TrashIcon
															className="h-4 w-4"
															strokeWidth={DESKTOP_LUCIDE.stroke}
														/>
													}
													onClick={() => onRequestLibraryDelete(ctxTargets)}
												>
													{isMultiContext
														? t('folderWindow.contextDeleteMany', {
																count: ctxTargets.length,
															})
														: t('folderWindow.contextDelete')}
												</DesktopAppMenuItem>
											</>
										)}
									</DesktopAppMenuSurface>
								</m.div>
							</>
						),
						document.body
					)
				: null}

			{nestedMoveMenu
				? createPortal(
						wrapFolderWindowPortalShell(
							<>
								<div
									className="fixed inset-0"
									style={{ zIndex: floatingMenuBackdropZIndex }}
									aria-hidden
									onClick={() => setNestedMoveMenu(null)}
								/>
								<m.div
									initial={
										reduceMotion === true ? false : { opacity: 0, scale: 0.95 }
									}
									animate={{ opacity: 1, scale: 1 }}
									className="fixed"
									style={{
										left: nestedMoveMenu.x,
										top: nestedMoveMenu.y,
										zIndex: floatingMenuZIndex,
									}}
								>
									<DesktopAppMenuSurface
										windowStyle={visualStyle}
										className="flex max-h-[70vh] min-w-[196px] flex-col overflow-hidden"
									>
										<div className="overflow-y-auto py-0.5">
											{nestedMoveTargetFolders.map((f) => (
												<DesktopFolderMoveTargetMenuItem
													key={f.id}
													folderName={f.name}
													icon={
														<FolderIcon
															className="h-4 w-4"
															strokeWidth={DESKTOP_LUCIDE.stroke}
														/>
													}
													onClick={() => onMoveNestedTargetsToFolder(f.id)}
												/>
											))}
											{nestedSelectionCanMoveToRoot ? (
												<>
													{nestedMoveTargetFolders.length > 0 ? (
														<DesktopAppMenuDivider />
													) : null}
													<DesktopAppMenuItem
														type="button"
														icon={
															<FolderMinusIcon
																className="h-4 w-4"
																strokeWidth={DESKTOP_LUCIDE.stroke}
															/>
														}
														onClick={() => onMoveNestedTargetsToFolder(null)}
													>
														{t('folderWindow.contextUnfiled')}
													</DesktopAppMenuItem>
												</>
											) : null}
											{nestedMoveTargetFolders.length === 0 &&
											!nestedSelectionCanMoveToRoot ? (
												<div
													className={`${DESKTOP_TYPOGRAPHY.meta} px-3 py-4 text-(--desktop-text-muted)`}
												>
													{t('folderWindow.nestedMoveNoTargets')}
												</div>
											) : null}
										</div>
									</DesktopAppMenuSurface>
								</m.div>
							</>
						),
						document.body
					)
				: null}

			{folderBgContextMenu
				? createPortal(
						wrapFolderWindowPortalShell(
							<>
								<div
									className="fixed inset-0"
									style={{
										zIndex: floatingMenuBackdropZIndex + 1,
									}}
									aria-hidden
									onClick={() => setFolderBgContextMenu(null)}
								/>
								<m.div
									initial={
										reduceMotion === true ? false : { opacity: 0, scale: 0.96 }
									}
									animate={{ opacity: 1, scale: 1 }}
									className="fixed"
									style={{
										left: folderBgContextMenu.x,
										top: folderBgContextMenu.y,
										zIndex: floatingMenuZIndex + 1,
									}}
								>
									<DesktopAppMenuSurface
										windowStyle={visualStyle}
										className="min-w-[180px]"
									>
										{canOpenNewFolderDialog ? (
											<DesktopAppMenuItem
												type="button"
												icon={
													<FolderIcon
														className="h-4 w-4"
														strokeWidth={DESKTOP_LUCIDE.stroke}
													/>
												}
												onClick={() => {
													setFolderBgContextMenu(null);
													onOpenNewFolderDialog();
												}}
											>
												{t('enhancedContextMenu.desktop.newFolder')}
											</DesktopAppMenuItem>
										) : null}
										{canCreateMarkdownInFolder ? (
											<DesktopAppMenuItem
												type="button"
												icon={
													<DocumentTextIcon
														className="h-4 w-4"
														strokeWidth={DESKTOP_LUCIDE.stroke}
													/>
												}
												onClick={() => {
													setFolderBgContextMenu(null);
													void onCreateMarkdownHere();
												}}
											>
												{t('enhancedContextMenu.desktop.newMarkdownFile')}
											</DesktopAppMenuItem>
										) : null}
										<DesktopAppMenuItem
											type="button"
											icon={
												<ArrowPathIcon
													className="h-4 w-4"
													strokeWidth={DESKTOP_LUCIDE.stroke}
												/>
											}
											onClick={() => {
												setFolderBgContextMenu(null);
												void onRefreshFolderContents();
											}}
										>
											{t('folderWindow.bgRefresh')}
										</DesktopAppMenuItem>
										<DesktopAppMenuItem
											type="button"
											icon={
												<ArrowUpTrayIcon
													className="h-4 w-4"
													strokeWidth={DESKTOP_LUCIDE.stroke}
												/>
											}
											onClick={() => {
												setFolderBgContextMenu(null);
												onUploadClick();
											}}
										>
											{t('folderWindow.bgUpload')}
										</DesktopAppMenuItem>
										<DesktopAppMenuItem
											type="button"
											onClick={() => {
												setFolderBgContextMenu(null);
												onSelectAllFiles();
											}}
											disabled={filesList.length === 0}
										>
											{t('folderWindow.bgSelectAll')}
										</DesktopAppMenuItem>
										<DesktopAppMenuItem
											type="button"
											onClick={() => {
												setFolderBgContextMenu(null);
												onClearAllSelection();
											}}
											disabled={
												selectedIds.size === 0 && nestedSelectedIds.size === 0
											}
										>
											{t('folderWindow.clearSelection')}
										</DesktopAppMenuItem>
									</DesktopAppMenuSurface>
								</m.div>
							</>
						),
						document.body
					)
				: null}
		</>
	);
}
