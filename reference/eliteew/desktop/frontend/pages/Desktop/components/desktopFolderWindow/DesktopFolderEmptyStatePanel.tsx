/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Full empty-folder hero panel with create/upload/content-manager CTAs in Desktop folder window.
 *
 * Invariants:
 * - Optional desktop create actions render only when parent supplies matching callbacks.
 *
 * Related:
 * - DesktopFolderLibraryBodyContent.tsx; DesktopFolderWindow.tsx
 */

import {
	ArrowUpTrayIcon,
	CircleStackIcon,
	DocumentTextIcon,
	FolderIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { DESKTOP_LUCIDE, DESKTOP_TYPOGRAPHY } from '../../constants';
import {
	DesktopAppButton,
	DesktopAppSurface,
	DESKTOP_APP_STYLE_CONTRACT,
} from '../DesktopAppChrome';

export interface DesktopFolderEmptyStatePanelProps {
	folderTitle: string;
	folderUploadBusy: boolean;
	effectiveFolderId: string;
	canOpenNewFolderDialog: boolean;
	canCreateMarkdownInFolder: boolean;
	onOpenNewFolderDialog: () => void;
	onCreateMarkdownHere: () => void | Promise<void>;
	onUploadClick: () => void;
	onOpenContentManager: () => void;
}

export function DesktopFolderEmptyStatePanel({
	folderTitle,
	folderUploadBusy,
	effectiveFolderId,
	canOpenNewFolderDialog,
	canCreateMarkdownInFolder,
	onOpenNewFolderDialog,
	onCreateMarkdownHere,
	onUploadClick,
	onOpenContentManager,
}: DesktopFolderEmptyStatePanelProps) {
	const { t } = useTranslation('desktopUi');

	return (
		<div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-6">
			<DesktopAppSurface
				variant="panelStrong"
				padding="lg"
				className={cn(
					'flex w-full max-w-lg flex-col items-center gap-6 text-center',
					'border-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb)/0.22)_100%,var(--desktop-border-strong))]',
					'bg-[linear-gradient(180deg,rgba(255,255,255,0.07)_0%,rgb(var(--desktop-bg-primary-rgb)/0.14)_100%)]',
					'shadow-[0_24px_64px_-12px_rgba(0,0,0,0.45)]'
				)}
			>
				<div
					className={cn(
						DESKTOP_APP_STYLE_CONTRACT.emptyIcon,
						'h-18 w-18 rounded-(--desktop-radius-xl)',
						'border-[rgb(var(--desktop-accent-rgb)/0.35)]',
						'bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb)/0.14)_100%,var(--desktop-surface-soft))]',
						'shadow-[0_16px_40px_rgba(0,0,0,0.35)]',
						'ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.25)]'
					)}
				>
					<FolderIcon
						className="h-9 w-9 text-[rgb(var(--desktop-accent-rgb)/0.95)]"
						strokeWidth={DESKTOP_LUCIDE.stroke}
						aria-hidden="true"
					/>
				</div>
				<div className="space-y-2">
					<h3
						className={`${DESKTOP_TYPOGRAPHY.subtitle} text-(--desktop-text-primary)`}
					>
						{t('folderWindow.emptyTitle')}
					</h3>
					<p
						className={`${DESKTOP_TYPOGRAPHY.body} mx-auto max-w-md text-balance text-(--desktop-text-secondary)`}
					>
						{t('folderWindow.emptyHint', {
							name: folderTitle,
						})}
					</p>
					<p
						className={`${DESKTOP_TYPOGRAPHY.small} mx-auto max-w-md text-pretty text-(--desktop-text-muted)`}
					>
						{t('folderWindow.emptyClarify')}
					</p>
					<p
						className={`${DESKTOP_TYPOGRAPHY.small} mx-auto max-w-md text-pretty text-(--desktop-text-muted)`}
					>
						{t('folderWindow.pasteHint')}
					</p>
				</div>
				<div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
					{canOpenNewFolderDialog ? (
						<DesktopAppButton
							type="button"
							variant="neutral"
							size="md"
							onClick={onOpenNewFolderDialog}
							className="w-full gap-1.5 sm:w-auto"
						>
							<FolderIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
							{t('enhancedContextMenu.desktop.newFolder')}
						</DesktopAppButton>
					) : null}
					{canCreateMarkdownInFolder ? (
						<DesktopAppButton
							type="button"
							variant="neutral"
							size="md"
							onClick={() => void onCreateMarkdownHere()}
							className="w-full gap-1.5 sm:w-auto"
						>
							<DocumentTextIcon
								className="h-4 w-4 shrink-0"
								aria-hidden="true"
							/>
							{t('enhancedContextMenu.desktop.newMarkdownFile')}
						</DesktopAppButton>
					) : null}
					<DesktopAppButton
						type="button"
						variant="ghost"
						size="md"
						disabled={folderUploadBusy || effectiveFolderId === ''}
						onClick={onUploadClick}
						className="w-full gap-1.5 sm:w-auto"
					>
						<ArrowUpTrayIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
						{t('folderWindow.upload')}
					</DesktopAppButton>
					<DesktopAppButton
						type="button"
						variant="accent"
						size="md"
						onClick={onOpenContentManager}
						className="w-full gap-1.5 sm:w-auto"
					>
						<CircleStackIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
						{t('folderWindow.emptyCta')}
					</DesktopAppButton>
				</div>
			</DesktopAppSurface>
		</div>
	);
}
