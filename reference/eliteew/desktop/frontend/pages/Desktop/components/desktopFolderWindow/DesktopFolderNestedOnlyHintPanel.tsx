/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Compact guidance when library files are empty but nested desktop shortcuts exist in the folder window.
 *
 * Invariants:
 * - Not a full empty hero; primary actions mirror empty panel upload / Content Manager entry points.
 *
 * Related:
 * - DesktopFolderLibraryBodyContent.tsx · DesktopFolderEmptyStatePanel.tsx
 */

import {
	ArrowUpTrayIcon,
	CircleStackIcon,
	FolderOpenIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { DESKTOP_TYPOGRAPHY } from '../../constants';
import { DesktopAppButton, DesktopAppSurface } from '../DesktopAppChrome';

export interface DesktopFolderNestedOnlyHintPanelProps {
	folderUploadBusy: boolean;
	effectiveFolderId: string;
	onUploadClick: () => void;
	onOpenContentManager: () => void;
}

export function DesktopFolderNestedOnlyHintPanel({
	folderUploadBusy,
	effectiveFolderId,
	onUploadClick,
	onOpenContentManager,
}: DesktopFolderNestedOnlyHintPanelProps) {
	const { t } = useTranslation('desktopUi');

	return (
		<div className="px-4 pb-4 pt-2">
			<DesktopAppSurface
				variant="soft"
				padding="md"
				className={cn(
					'flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left',
					'border border-dashed border-(--desktop-border-subtle)'
				)}
			>
				<div
					className={cn(
						'flex h-11 w-11 shrink-0 items-center justify-center rounded-(--desktop-radius-lg)',
						'bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb)/0.12)_100%,transparent)]'
					)}
				>
					<FolderOpenIcon
						className="h-6 w-6 text-[rgb(var(--desktop-accent-rgb)/0.9)]"
						aria-hidden="true"
					/>
				</div>
				<div className="min-w-0 flex-1 space-y-1">
					<p
						className={`${DESKTOP_TYPOGRAPHY.body} text-(--desktop-text-secondary)`}
					>
						{t('folderWindow.libraryEmptyWithNestedTitle')}
					</p>
					<p
						className={`${DESKTOP_TYPOGRAPHY.small} text-(--desktop-text-muted)`}
					>
						{t('folderWindow.libraryEmptyWithNestedHint')}
					</p>
				</div>
				<div className="flex shrink-0 flex-wrap justify-center gap-2">
					<DesktopAppButton
						type="button"
						variant="ghost"
						size="sm"
						disabled={folderUploadBusy || effectiveFolderId === ''}
						onClick={onUploadClick}
						className="gap-1.5"
					>
						<ArrowUpTrayIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
						{t('folderWindow.upload')}
					</DesktopAppButton>
					<DesktopAppButton
						type="button"
						variant="neutral"
						size="sm"
						onClick={onOpenContentManager}
						className="gap-1.5"
					>
						<CircleStackIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
						{t('folderWindow.contentManager')}
					</DesktopAppButton>
				</div>
			</DesktopAppSurface>
		</div>
	);
}
