/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Renders nested desktop shortcuts inside an open folder window — grid/list + context menu.
 *
 * Invariants:
 * - Direct children only; move/rename/icon/properties delegate to `DesktopAppPropsContext`.
 * - Selection is owned by `DesktopFolderWindow` (mutually exclusive with library file selection).
 *
 * Related:
 * - DesktopFolderWindow.tsx · utils/desktopItemTree.ts
 */

import {
	ArrowUpTrayIcon,
	ChevronRightIcon,
	ClipboardDocumentCheckIcon,
	DocumentTextIcon,
	EyeIcon,
	FolderIcon,
	FolderMinusIcon,
	InformationCircleIcon,
	PencilSquareIcon,
	Square2StackIcon,
	Squares2X2Icon,
	SwatchIcon,
	TrashIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import type { DesktopWindowStyle } from '@/types/profile';
import { DESKTOP_LUCIDE, DESKTOP_TYPOGRAPHY } from '../constants';
import { useDesktopAppProps } from '../context/DesktopAppPropsContext';
import type { DesktopItem } from '../types/desktop.types';
import {
	FOLDER_WINDOW_ROOT_ID,
	isDesktopSystemFolder,
	listValidNestedMoveTargetFolders,
} from '../utils/desktopItemTree';
import {
	DESKTOP_NESTED_ITEM_DRAG_MIME,
	setDesktopNestedItemDragGhost,
	stringifyDesktopNestedItemDragIds,
} from '../utils/desktopNestedItemDrag';
import { getDesktopPortalShellProps } from '../utils/desktopUi';
import {
	DesktopAppInput,
	DesktopAppMenuDivider,
	DesktopAppMenuItem,
	DesktopAppMenuSurface,
	DesktopAppSectionLabel,
	DesktopAppSurface,
	DESKTOP_APP_STYLE_CONTRACT,
} from './DesktopAppChrome';
import {
	DesktopFolderMoveTargetMenuItem,
	DesktopFolderTruncatedLabel,
} from './desktopFolderTooltipLabels';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

function nestedItemKindLabel(
	item: DesktopItem,
	labels: { folder: string; app: string; file: string }
): string {
	if (item.type === 'folder') return labels.folder;
	if (item.type === 'app') return labels.app;
	return labels.file;
}

function NestedItemIcon({ item }: { item: DesktopItem }) {
	const className = 'h-7 w-7 text-[rgb(var(--desktop-accent-rgb)/0.9)]';
	if (item.type === 'folder') {
		if (item.icon) {
			return (
				<span
					className="inline-flex h-7 w-7 shrink-0 items-center justify-center [&_svg]:h-7 [&_svg]:w-7"
					aria-hidden
				>
					{item.icon}
				</span>
			);
		}
		return (
			<FolderIcon
				className={className}
				strokeWidth={DESKTOP_LUCIDE.stroke}
				aria-hidden
			/>
		);
	}
	if (item.type === 'app') {
		return (
			<Squares2X2Icon
				className={className}
				strokeWidth={DESKTOP_LUCIDE.stroke}
				aria-hidden
			/>
		);
	}
	return (
		<DocumentTextIcon
			className={className}
			strokeWidth={DESKTOP_LUCIDE.stroke}
			aria-hidden
		/>
	);
}

export function DesktopFolderNestedItems({
	items,
	folderPath,
	viewMode,
	currentFolderId,
	visualStyle,
	floatingMenuZIndex,
	floatingMenuBackdropZIndex,
	selectedIds,
	renamingId = null,
	onStartRename,
	onCommitRename,
	onCancelRename,
	onRequestDelete,
	onItemClick,
	onToggleSelect,
	onEnsureSelected,
}: {
	items: DesktopItem[];
	folderPath: string[];
	viewMode: 'grid' | 'list';
	currentFolderId: string;
	visualStyle: DesktopWindowStyle;
	floatingMenuZIndex: number;
	floatingMenuBackdropZIndex: number;
	selectedIds: Set<string>;
	renamingId?: string | null;
	onStartRename?: (itemId: string) => void;
	onCommitRename?: (itemId: string, name: string) => void;
	onCancelRename?: () => void;
	onRequestDelete?: (items: DesktopItem[]) => void;
	onItemClick: (e: React.MouseEvent, item: DesktopItem, index: number) => void;
	onToggleSelect: (
		e: React.MouseEvent,
		item: DesktopItem,
		index: number
	) => void;
	onEnsureSelected: (item: DesktopItem) => void;
}) {
	const { t } = useTranslation('desktopUi');
	const appProps = useDesktopAppProps();
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		item: DesktopItem;
		submenu?: 'move';
	} | null>(null);
	const [renameDraft, setRenameDraft] = useState('');
	const renameInputRef = useRef<HTMLInputElement>(null);

	const desktopItems = appProps?.desktopItems ?? [];

	const contextMoveTargets = useMemo(() => {
		if (!contextMenu) return [];
		const target = contextMenu.item;
		if (selectedIds.has(target.id) && selectedIds.size > 1) {
			return items
				.filter((row) => selectedIds.has(row.id))
				.map((row) => row.id);
		}
		return [target.id];
	}, [contextMenu, items, selectedIds]);

	const contextMoveTargetFolders = useMemo(
		() =>
			contextMenu
				? listValidNestedMoveTargetFolders(desktopItems, contextMoveTargets)
				: [],
		[contextMenu, contextMoveTargets, desktopItems]
	);

	const contextSelectionCanMoveToRoot = useMemo(() => {
		return contextMoveTargets.some((id) => {
			const row = desktopItems.find((item) => item.id === id);
			return Boolean(row?.parentId);
		});
	}, [contextMoveTargets, desktopItems]);

	useEffect(() => {
		if (!renamingId) return;
		const item = items.find((row) => row.id === renamingId);
		setRenameDraft(item?.name ?? '');
		const tid = window.setTimeout(() => renameInputRef.current?.select(), 0);
		return () => window.clearTimeout(tid);
	}, [items, renamingId]);

	const kindLabels = useMemo(
		() => ({
			folder: t('folderWindow.nestedKindFolder'),
			app: t('folderWindow.nestedKindApp'),
			file: t('folderWindow.nestedKindFile'),
		}),
		[t]
	);

	if (items.length === 0) {
		return null;
	}

	const openItem = (item: DesktopItem) => {
		appProps?.openDesktopItem?.(item, { folderPathPrefix: folderPath });
	};

	const openContextMenu = (e: React.MouseEvent, item: DesktopItem) => {
		e.preventDefault();
		e.stopPropagation();
		onEnsureSelected(item);
		setContextMenu({ x: e.clientX, y: e.clientY, item });
	};

	const resolveContextTargetIds = (item: DesktopItem): string[] => {
		if (selectedIds.has(item.id) && selectedIds.size > 1) {
			return items
				.filter((row) => selectedIds.has(row.id))
				.map((row) => row.id);
		}
		return [item.id];
	};

	const beginItemDrag = (e: React.DragEvent, item: DesktopItem) => {
		const dragIds =
			selectedIds.has(item.id) && selectedIds.size > 1
				? items.filter((row) => selectedIds.has(row.id)).map((row) => row.id)
				: [item.id];
		const labelItem =
			dragIds.length > 1
				? (items.find((row) => row.id === dragIds[0]) ?? item)
				: item;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData(
			DESKTOP_NESTED_ITEM_DRAG_MIME,
			stringifyDesktopNestedItemDragIds(dragIds)
		);
		setDesktopNestedItemDragGhost(e, {
			title: labelItem.name,
			count: dragIds.length,
		});
	};

	const canLiftUp =
		currentFolderId !== FOLDER_WINDOW_ROOT_ID && Boolean(currentFolderId);

	const canRenameItem = (item: DesktopItem) =>
		item.type === 'folder' && !isDesktopSystemFolder(item);

	const canChangeFolderIcon = (item: DesktopItem) => canRenameItem(item);

	const canDeleteItem = (item: DesktopItem) => !isDesktopSystemFolder(item);

	const commitRenameDraft = (itemId: string) => {
		onCommitRename?.(itemId, renameDraft);
	};

	const renderItemName = (item: DesktopItem) => {
		if (renamingId === item.id && canRenameItem(item)) {
			return (
				<DesktopAppInput
					ref={renameInputRef}
					value={renameDraft}
					onChange={(e) => setRenameDraft(e.target.value)}
					onClick={(e) => e.stopPropagation()}
					onDoubleClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => {
						e.stopPropagation();
						if (e.key === 'Enter') {
							e.preventDefault();
							commitRenameDraft(item.id);
						}
						if (e.key === 'Escape') {
							e.preventDefault();
							onCancelRename?.();
						}
					}}
					onBlur={() => commitRenameDraft(item.id)}
					className="w-full"
					aria-label={t('folderWindow.nestedRenameAria')}
				/>
			);
		}
		return (
			<DesktopFolderTruncatedLabel
				name={item.name}
				className={cn(
					viewMode === 'grid' ? 'block truncate' : 'block truncate font-medium',
					viewMode === 'grid'
						? DESKTOP_TYPOGRAPHY.widgetTrackTitle
						: DESKTOP_TYPOGRAPHY.widgetTrackTitle,
					viewMode !== 'grid' && 'font-medium'
				)}
			/>
		);
	};

	const renderCardProps = (item: DesktopItem, index: number) => ({
		draggable: true,
		onDragStart: (e: React.DragEvent) => beginItemDrag(e, item),
		onDoubleClick: (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			openItem(item);
		},
		onClick: (e: React.MouseEvent) => onItemClick(e, item, index),
		onContextMenu: (e: React.MouseEvent) => openContextMenu(e, item),
	});

	const selectionToggle = (item: DesktopItem, index: number) => (
		<DesktopChromeTooltip
			content={t('folderWindow.selectToggleAria')}
			placement="top"
			offsetExtra={4}
		>
			<button
				type="button"
				aria-pressed={selectedIds.has(item.id)}
				aria-label={t('folderWindow.selectToggleAria')}
				onClick={(e) => onToggleSelect(e, item, index)}
				className={cn(
					viewMode === 'grid'
						? 'absolute right-2 top-2 z-1 rounded-(--desktop-radius) bg-(--desktop-surface-panel-strong)/80 p-1 text-(--desktop-text-muted) backdrop-blur-sm hover:text-(--desktop-text-primary)'
						: 'shrink-0 rounded-(--desktop-radius) p-1 text-(--desktop-text-muted) hover:text-(--desktop-text-primary)'
				)}
			>
				{selectedIds.has(item.id) ? (
					<ClipboardDocumentCheckIcon className="h-4 w-4" aria-hidden />
				) : (
					<Square2StackIcon className="h-4 w-4 opacity-60" aria-hidden />
				)}
			</button>
		</DesktopChromeTooltip>
	);

	return (
		<div className="shrink-0 px-4 pt-3">
			<DesktopAppSectionLabel>
				{t('folderWindow.nestedSectionTitle')}
			</DesktopAppSectionLabel>
			{viewMode === 'grid' ? (
				<div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
					{items.map((item, index) => (
						<DesktopAppSurface
							key={item.id}
							variant="soft"
							data-desktop-folder-nested="true"
							className={cn(
								'group relative flex cursor-pointer flex-col overflow-hidden transition-colors',
								'hover:bg-(--desktop-surface-soft-hover)',
								selectedIds.has(item.id) &&
									'ring-2 ring-[rgb(var(--desktop-accent-rgb)/0.55)] ring-inset'
							)}
							{...renderCardProps(item, index)}
						>
							{selectionToggle(item, index)}
							<div className="relative flex h-14 shrink-0 items-center justify-center overflow-hidden border-b border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3">
								<NestedItemIcon item={item} />
							</div>
							<div className="min-w-0 p-3 text-left">
								{renderItemName(item)}
								<span className={DESKTOP_TYPOGRAPHY.small}>
									{nestedItemKindLabel(item, kindLabels)}
								</span>
							</div>
						</DesktopAppSurface>
					))}
				</div>
			) : (
				<ul className="mt-2 flex flex-col gap-1">
					{items.map((item, index) => (
						<li key={item.id}>
							<DesktopAppSurface
								variant="soft"
								data-desktop-folder-nested="true"
								className={cn(
									'flex w-full cursor-pointer items-center gap-3 px-3 py-2 transition-colors',
									'hover:bg-(--desktop-surface-soft-hover)',
									selectedIds.has(item.id) &&
										'ring-2 ring-[rgb(var(--desktop-accent-rgb)/0.55)] ring-inset'
								)}
								{...renderCardProps(item, index)}
							>
								{selectionToggle(item, index)}
								<div
									className={cn(
										DESKTOP_APP_STYLE_CONTRACT.emptyIcon,
										'h-9 w-9 shrink-0 rounded-(--desktop-radius)'
									)}
								>
									<NestedItemIcon item={item} />
								</div>
								<div className="min-w-0 flex-1 text-left">
									{renderItemName(item)}
									<span className={DESKTOP_TYPOGRAPHY.small}>
										{nestedItemKindLabel(item, kindLabels)}
									</span>
								</div>
							</DesktopAppSurface>
						</li>
					))}
				</ul>
			)}
			<p className="mt-2 pb-1 text-xs text-(--desktop-text-muted)">
				{t('folderWindow.nestedOpenHint')}
			</p>

			{contextMenu &&
				typeof document !== 'undefined' &&
				createPortal(
					(() => {
						const { style: portalShellStyle, theme: portalTheme } =
							getDesktopPortalShellProps();
						const target = contextMenu.item;
						const targetIds = resolveContextTargetIds(target);
						return (
							<div
								style={portalShellStyle}
								className={portalTheme === 'dark' ? 'dark' : ''}
							>
								<div
									className="fixed inset-0"
									style={{ zIndex: floatingMenuBackdropZIndex }}
									aria-hidden
									onClick={() => setContextMenu(null)}
								/>
								<div
									className="fixed"
									style={{
										left: contextMenu.x,
										top: contextMenu.y,
										zIndex: floatingMenuZIndex,
									}}
								>
									<DesktopAppMenuSurface
										windowStyle={visualStyle}
										className="min-w-[196px]"
									>
										{contextMenu.submenu === 'move' ? (
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
														setContextMenu((prev) =>
															prev ? { ...prev, submenu: undefined } : null
														)
													}
												>
													{t('folderWindow.contextBack')}
												</DesktopAppMenuItem>
												<DesktopAppMenuDivider />
												<div className="overflow-y-auto py-0.5">
													{contextMoveTargetFolders.map((f) => (
														<DesktopFolderMoveTargetMenuItem
															key={f.id}
															folderName={f.name}
															icon={
																<FolderIcon
																	className="h-4 w-4"
																	strokeWidth={DESKTOP_LUCIDE.stroke}
																/>
															}
															onClick={() => {
																appProps?.moveDesktopNestedItemsToFolder?.(
																	contextMoveTargets,
																	f.id
																);
																setContextMenu(null);
															}}
														/>
													))}
													{contextSelectionCanMoveToRoot ? (
														<>
															{contextMoveTargetFolders.length > 0 ? (
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
																onClick={() => {
																	appProps?.moveDesktopNestedItemsToFolder?.(
																		contextMoveTargets,
																		FOLDER_WINDOW_ROOT_ID
																	);
																	setContextMenu(null);
																}}
															>
																{t('folderWindow.contextUnfiled')}
															</DesktopAppMenuItem>
														</>
													) : null}
												</div>
											</>
										) : (
											<>
												<DesktopAppMenuItem
													onClick={() => {
														openItem(target);
														setContextMenu(null);
													}}
												>
													<EyeIcon className="h-4 w-4 shrink-0" aria-hidden />
													{t('folderWindow.nestedCtxOpen')}
												</DesktopAppMenuItem>
												{canRenameItem(target) ? (
													<DesktopAppMenuItem
														onClick={() => {
															onStartRename?.(target.id);
															setContextMenu(null);
														}}
													>
														<PencilSquareIcon
															className="h-4 w-4 shrink-0"
															aria-hidden
														/>
														{t('folderWindow.nestedCtxRename')}
													</DesktopAppMenuItem>
												) : null}
												{canChangeFolderIcon(target) ? (
													<DesktopAppMenuItem
														onClick={() => {
															appProps?.openEditFolderIconDialog?.(target);
															setContextMenu(null);
														}}
													>
														<SwatchIcon
															className="h-4 w-4 shrink-0"
															aria-hidden
														/>
														{t('folderWindow.nestedCtxChangeIcon')}
													</DesktopAppMenuItem>
												) : null}
												<DesktopAppMenuItem
													onClick={() => {
														appProps?.openDesktopItemProperties?.(target);
														setContextMenu(null);
													}}
												>
													<InformationCircleIcon
														className="h-4 w-4 shrink-0"
														aria-hidden
													/>
													{t('folderWindow.nestedCtxProperties')}
												</DesktopAppMenuItem>
												<DesktopAppMenuItem
													onClick={() =>
														setContextMenu((prev) =>
															prev ? { ...prev, submenu: 'move' } : null
														)
													}
												>
													<FolderIcon
														className="h-4 w-4 shrink-0"
														aria-hidden
													/>
													{t('folderWindow.contextMove')}
													<ChevronRightIcon
														className="ms-auto h-4 w-4 shrink-0 opacity-70"
														aria-hidden
													/>
												</DesktopAppMenuItem>
												{canLiftUp ? (
													<DesktopAppMenuItem
														onClick={() => {
															appProps?.liftDesktopItemsOneLevel?.(
																targetIds,
																currentFolderId
															);
															setContextMenu(null);
														}}
													>
														<ArrowUpTrayIcon
															className="h-4 w-4 shrink-0"
															aria-hidden
														/>
														{t('folderWindow.nestedCtxLiftUp')}
													</DesktopAppMenuItem>
												) : null}
												{target.parentId ||
												targetIds.some((id) => {
													const row = items.find((item) => item.id === id);
													return Boolean(row?.parentId);
												}) ? (
													<DesktopAppMenuItem
														onClick={() => {
															appProps?.liftDesktopItemsToRoot?.(targetIds);
															setContextMenu(null);
														}}
													>
														<ArrowUpTrayIcon
															className="h-4 w-4 shrink-0"
															aria-hidden
														/>
														{t('folderWindow.nestedCtxLiftRoot')}
													</DesktopAppMenuItem>
												) : null}
												{targetIds.some((id) => {
													const row = items.find((item) => item.id === id);
													return row != null && canDeleteItem(row);
												}) ? (
													<DesktopAppMenuItem
														tone="danger"
														onClick={() => {
															const rows = items.filter(
																(row) =>
																	targetIds.includes(row.id) &&
																	canDeleteItem(row)
															);
															onRequestDelete?.(rows);
															setContextMenu(null);
														}}
													>
														<TrashIcon
															className="h-4 w-4 shrink-0"
															aria-hidden
														/>
														{targetIds.length > 1
															? t('folderWindow.nestedCtxDeleteMany', {
																	count: targetIds.length,
																})
															: t('folderWindow.nestedCtxDelete')}
													</DesktopAppMenuItem>
												) : null}
											</>
										)}
									</DesktopAppMenuSurface>
								</div>
							</div>
						);
					})(),
					document.body
				)}
		</div>
	);
}
