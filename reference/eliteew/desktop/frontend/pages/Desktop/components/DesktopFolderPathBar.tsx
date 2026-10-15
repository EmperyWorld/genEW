/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Breadcrumb path for desktop folder window (Корневой раздел / … / current).
 *
 * Invariants:
 * - Segments use {@link FOLDER_WINDOW_ROOT_ID} for library root.
 * - Accepts nested shortcut and Content Manager drags on every segment.
 *
 * Related:
 * - DesktopFolderWindow.tsx · utils/desktopItemTree.ts · folderWindowTreeDrop.ts · DesktopChromeTooltip.tsx
 */

import { ChevronRightIcon, HomeIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { DESKTOP_TYPOGRAPHY } from '../constants';
import type { DesktopFolderPathSegment } from '../utils/desktopItemTree';
import { FOLDER_WINDOW_ROOT_ID } from '../utils/desktopItemTree';
import { bindFolderTreeDropTarget } from '../utils/folderWindowTreeDrop';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

export function DesktopFolderPathBar({
	segments,
	activeFolderId,
	onNavigate,
	dropHighlightId = null,
	onDropHighlight,
	onTreeDrop,
}: {
	segments: DesktopFolderPathSegment[];
	activeFolderId: string | undefined;
	onNavigate: (segment: DesktopFolderPathSegment) => void;
	dropHighlightId?: string | null;
	onDropHighlight?: (folderId: string | null) => void;
	onTreeDrop?: (e: React.DragEvent, targetFolderId: string) => void;
}) {
	const { t } = useTranslation('desktopUi');

	if (segments.length === 0) {
		return null;
	}

	const bindSegmentDrop = (folderId: string) => {
		if (!onTreeDrop || !onDropHighlight) {
			return {};
		}
		return bindFolderTreeDropTarget({
			folderId,
			dropHighlightId,
			onDropHighlight,
			onTreeDrop,
		});
	};

	return (
		<nav
			className="flex min-w-0 shrink-0 items-center gap-1 border-b border-(--desktop-border-subtle) px-4 py-2"
			aria-label={t('folderWindow.pathAria')}
		>
			<ol className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
				{segments.map((segment, index) => {
					const isLast = index === segments.length - 1;
					const isActive =
						(segment.id === FOLDER_WINDOW_ROOT_ID &&
							(activeFolderId === FOLDER_WINDOW_ROOT_ID ||
								activeFolderId == null ||
								activeFolderId === '')) ||
						segment.id === activeFolderId;
					const isDropHl = dropHighlightId === segment.id;
					return (
						<li
							key={segment.id}
							className="flex min-w-0 max-w-full items-center gap-1"
						>
							{index > 0 ? (
								<ChevronRightIcon
									className="h-3.5 w-3.5 shrink-0 text-(--desktop-text-dim)"
									aria-hidden
								/>
							) : null}
							<DesktopChromeTooltip
								content={segment.name}
								placement="bottom"
								offsetExtra={4}
							>
								<button
									type="button"
									onClick={() => {
										if (!isLast) onNavigate(segment);
									}}
									{...bindSegmentDrop(segment.id)}
									className={cn(
										'inline-flex min-w-0 max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors',
										DESKTOP_TYPOGRAPHY.captionInherit,
										isLast
											? 'cursor-default font-semibold text-(--desktop-text-primary)'
											: 'text-(--desktop-text-secondary) hover:bg-(--desktop-surface-soft) hover:text-(--desktop-text-primary)',
										isActive && !isLast && 'text-(--desktop-text-primary)',
										isDropHl &&
											'ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
									)}
									aria-current={isLast ? 'page' : undefined}
								>
									{segment.id === FOLDER_WINDOW_ROOT_ID ? (
										<HomeIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
									) : null}
									<span className="truncate">{segment.name}</span>
								</button>
							</DesktopChromeTooltip>
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
