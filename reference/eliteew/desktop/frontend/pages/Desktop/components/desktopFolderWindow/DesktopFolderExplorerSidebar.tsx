/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Left folder tree in desktop folder window (Content Manager–like; root = «Корневой раздел»).
 *
 * Invariants:
 * - Tree built from desktop folder items only; root id {@link FOLDER_WINDOW_ROOT_ID}.
 * - Rail collapse follows profile `ui.sidebar_collapsed` (server-backed).
 *
 * Related:
 * - ContentManagerFilesTab explorer tree · desktopItemTree.ts · DesktopChromeTooltip.tsx
 */

import {
	ChevronDownIcon,
	FolderIcon,
	FolderOpenIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { DESKTOP_TYPOGRAPHY } from '../../constants';
import { DesktopAppButton, DesktopAppSectionLabel } from '../DesktopAppChrome';
import { DesktopChromeTooltip } from '../DesktopChromeTooltip';
import { DesktopExplorerCollapsibleRail } from '../DesktopExplorerCollapsibleRail';
import { DesktopExplorerFolderMonogramButton } from '../desktopExplorerRailUi';
import { useDesktopFolderExplorerRailCollapsed } from '../../hooks/useDesktopFolderExplorerRailCollapsed';
import {
	FOLDER_WINDOW_ROOT_ID,
	type DesktopFolderTreeNode,
} from '../../utils/desktopItemTree';
import { resolveDesktopFolderDisplayName } from '../../utils/desktopSystemFolderLabels';
import { bindFolderTreeDropTarget } from '../../utils/folderWindowTreeDrop';

export function DesktopFolderExplorerSidebar({
	treeRoots,
	activeFolderId,
	onSelectFolder,
	dropHighlightId = null,
	onDropHighlight,
	onTreeDrop,
}: {
	treeRoots: DesktopFolderTreeNode[];
	activeFolderId: string | undefined;
	onSelectFolder: (folderId: string) => void;
	dropHighlightId?: string | null;
	onDropHighlight?: (folderId: string | null) => void;
	onTreeDrop?: (e: React.DragEvent, targetFolderId: string) => void;
}) {
	const { t } = useTranslation('desktopUi');
	const { collapsed, toggle } = useDesktopFolderExplorerRailCollapsed();
	const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

	useEffect(() => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			for (const root of treeRoots) {
				next.add(root.id);
			}
			if (activeFolderId && activeFolderId !== FOLDER_WINDOW_ROOT_ID) {
				next.add(activeFolderId);
			}
			return next;
		});
	}, [treeRoots, activeFolderId]);

	const isRootActive =
		activeFolderId === FOLDER_WINDOW_ROOT_ID ||
		activeFolderId == null ||
		activeFolderId === '';

	const bindTreeDropTarget = (folderId: string) =>
		bindFolderTreeDropTarget({
			folderId,
			dropHighlightId,
			onDropHighlight: onDropHighlight ?? (() => {}),
			onTreeDrop: onTreeDrop ?? (() => {}),
		});

	function renderBranch(nodes: DesktopFolderTreeNode[], depth: number) {
		return nodes.map((node) => {
			const displayName = resolveDesktopFolderDisplayName(node, t);
			const hasKids = node.children.length > 0;
			const expanded = expandedIds.has(node.id);
			const isSel = activeFolderId === node.id;
			const isDropHl = dropHighlightId === node.id;
			return (
				<div key={node.id} className="min-w-0">
					<div
						className="flex min-w-0 items-stretch gap-0.5"
						style={{ paddingInlineStart: depth * 12 }}
					>
						{hasKids ? (
							<DesktopChromeTooltip
								content={
									expanded
										? t('folderWindow.treeCollapse')
										: t('folderWindow.treeExpand')
								}
								placement="right"
								offsetExtra={4}
							>
								<span className="inline-flex shrink-0">
									<DesktopAppButton
										type="button"
										variant="ghost"
										size="icon"
										className="h-8 w-7 shrink-0"
										aria-expanded={expanded}
										aria-label={
											expanded
												? t('folderWindow.treeCollapse')
												: t('folderWindow.treeExpand')
										}
										onClick={() => {
											setExpandedIds((prev) => {
												const next = new Set(prev);
												if (next.has(node.id)) next.delete(node.id);
												else next.add(node.id);
												return next;
											});
										}}
									>
										<ChevronDownIcon
											className={cn(
												'h-4 w-4 text-(--desktop-text-muted) transition-transform',
												!expanded && '-rotate-90'
											)}
										/>
									</DesktopAppButton>
								</span>
							</DesktopChromeTooltip>
						) : (
							<span className="inline-flex w-7 shrink-0" aria-hidden />
						)}
						<DesktopChromeTooltip
							content={displayName}
							placement="right"
							offsetExtra={4}
						>
							<button
								type="button"
								aria-label={displayName}
								onClick={() => onSelectFolder(node.id)}
								{...bindTreeDropTarget(node.id)}
								className={cn(
									DESKTOP_TYPOGRAPHY.caption,
									'flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors',
									isSel
										? 'border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.1)] text-(--desktop-text-primary)'
										: 'border-transparent text-(--desktop-text-secondary) hover:bg-(--desktop-surface-soft)',
									isDropHl &&
										'ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
								)}
							>
								<FolderIcon
									className="h-3.5 w-3.5 shrink-0 text-(--desktop-text-muted)"
									aria-hidden
								/>
								<span className="truncate font-medium">{displayName}</span>
							</button>
						</DesktopChromeTooltip>
					</div>
					{hasKids && expanded ? (
						<div className="mt-0.5 space-y-0.5">
							{renderBranch(node.children, depth + 1)}
						</div>
					) : null}
				</div>
			);
		});
	}

	const rootSectionLabel = t('folderWindow.rootSection');
	const collapsedFolderRail = (
		<>
			<DesktopExplorerFolderMonogramButton
				name={rootSectionLabel}
				title={t('folderWindow.rootSectionHint')}
				ariaLabel={rootSectionLabel}
				active={isRootActive}
				onClick={() => onSelectFolder(FOLDER_WINDOW_ROOT_ID)}
				{...bindTreeDropTarget(FOLDER_WINDOW_ROOT_ID)}
			/>
			{treeRoots.map((node) => {
				const displayName = resolveDesktopFolderDisplayName(node, t);
				return (
					<DesktopExplorerFolderMonogramButton
						key={node.id}
						name={displayName}
						title={displayName}
						ariaLabel={displayName}
						active={activeFolderId === node.id}
						onClick={() => onSelectFolder(node.id)}
						{...bindTreeDropTarget(node.id)}
					/>
				);
			})}
		</>
	);

	const treeBody = (
		<>
			<DesktopChromeTooltip
				content={t('folderWindow.rootSectionHint')}
				placement="right"
				offsetExtra={4}
			>
				<button
					type="button"
					onClick={() => onSelectFolder(FOLDER_WINDOW_ROOT_ID)}
					{...bindTreeDropTarget(FOLDER_WINDOW_ROOT_ID)}
					className={cn(
						DESKTOP_TYPOGRAPHY.caption,
						'mb-2 flex w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left font-medium transition-colors',
						isRootActive
							? 'border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-[rgb(var(--desktop-accent-rgb)/0.1)] text-(--desktop-text-primary)'
							: 'border-transparent text-(--desktop-text-secondary) hover:bg-(--desktop-surface-panel)',
						dropHighlightId === FOLDER_WINDOW_ROOT_ID &&
							'ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
					)}
				>
					<FolderOpenIcon
						className="h-3.5 w-3.5 shrink-0 text-(--desktop-text-muted)"
						aria-hidden
					/>
					<span className="truncate">{t('folderWindow.rootSection')}</span>
				</button>
			</DesktopChromeTooltip>
			<div className="space-y-0.5">{renderBranch(treeRoots, 0)}</div>
		</>
	);

	return (
		<DesktopExplorerCollapsibleRail
			collapsed={collapsed}
			onToggle={toggle}
			expandAriaLabel={t('folderWindow.expandRail')}
			collapseAriaLabel={t('folderWindow.collapseRail')}
			expandedClassName="w-[min(17rem,38%)] min-w-[12rem] shrink-0 border-e border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-soft)_40%,transparent)] pe-2 ps-2 py-2"
			landmarkLabel={t('folderWindow.treeTitle')}
			headerLabel={
				<DesktopAppSectionLabel className="desktop-shell-display-text px-0">
					{t('folderWindow.treeTitle')}
				</DesktopAppSectionLabel>
			}
			collapsedContent={collapsedFolderRail}
		>
			{treeBody}
		</DesktopExplorerCollapsibleRail>
	);
}
