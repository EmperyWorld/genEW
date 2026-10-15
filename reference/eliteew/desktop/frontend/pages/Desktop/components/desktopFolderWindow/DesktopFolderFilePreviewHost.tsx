/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Folder-window preview host with prev/next navigation across the visible library list.
 *
 * Invariants:
 * - Navigation only moves within `filesList` supplied by the parent controller.
 *
 * Related:
 * - FilePreviewModal.tsx · useFolderWindowController.ts · ContentManagerPreviewModal.tsx
 */

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import type { FolderFileItem } from '../../hooks/useFolderContents';
import { FilePreviewModal } from '../FilePreviewModal';
import { DesktopAppButton } from '../DesktopAppChrome';
import { DesktopShellFloatingPortal } from '../DesktopShellFloatingPortal';
import { DESKTOP_TYPOGRAPHY } from '../../constants';

export interface DesktopFolderFilePreviewHostProps {
	filesList: FolderFileItem[];
	previewIndex: number;
	onPreviewIndexChange: (index: number) => void;
	onClose: () => void;
	floatingMenuZIndex: number;
}

export function DesktopFolderFilePreviewHost({
	filesList,
	previewIndex,
	onPreviewIndexChange,
	onClose,
	floatingMenuZIndex,
}: DesktopFolderFilePreviewHostProps) {
	const { t } = useTranslation('desktopUi');
	const file = filesList[previewIndex];
	const previousDisabled = previewIndex <= 0;
	const nextDisabled = previewIndex >= filesList.length - 1;

	const goPrevious = useCallback(() => {
		if (previewIndex > 0) onPreviewIndexChange(previewIndex - 1);
	}, [onPreviewIndexChange, previewIndex]);

	const goNext = useCallback(() => {
		if (previewIndex < filesList.length - 1) {
			onPreviewIndexChange(previewIndex + 1);
		}
	}, [filesList.length, onPreviewIndexChange, previewIndex]);

	useEffect(() => {
		if (!file) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented) return;
			const target = event.target;
			const inEditableField =
				target instanceof HTMLElement &&
				(target.tagName === 'INPUT' ||
					target.tagName === 'TEXTAREA' ||
					target.tagName === 'SELECT' ||
					target.isContentEditable);
			if (inEditableField) return;
			if (event.key === 'ArrowLeft' && !previousDisabled) {
				event.preventDefault();
				goPrevious();
			}
			if (event.key === 'ArrowRight' && !nextDisabled) {
				event.preventDefault();
				goNext();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [file, goNext, goPrevious, nextDisabled, previousDisabled]);

	if (!file) return null;

	return (
		<>
			{filesList.length > 1 ? (
				<DesktopShellFloatingPortal>
					<div
						className="pointer-events-none fixed inset-x-0 top-[max(4.5rem,10vh)] z-[calc(var(--folder-preview-nav-z,9000))] flex justify-center px-4"
						style={
							{
								'--folder-preview-nav-z': floatingMenuZIndex + 2,
							} as CSSProperties
						}
					>
						<div
							className={cn(
								'pointer-events-auto flex items-center gap-2 rounded-(--desktop-radius-lg)',
								'border border-(--desktop-border-subtle) bg-(--desktop-surface-panel-strong)/95 px-2 py-1.5 shadow-lg backdrop-blur-sm'
							)}
						>
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="sm"
								onClick={goPrevious}
								disabled={previousDisabled}
								aria-label={t('folderWindow.previewPrevious')}
								className="gap-1"
							>
								<ChevronLeftIcon
									className="h-4 w-4 shrink-0"
									aria-hidden="true"
								/>
								<span className="hidden sm:inline">
									{t('folderWindow.previewPrevious')}
								</span>
							</DesktopAppButton>
							<span
								className={`${DESKTOP_TYPOGRAPHY.small} min-w-18 text-center tabular-nums text-(--desktop-text-muted)`}
							>
								{t('folderWindow.previewPosition', {
									current: previewIndex + 1,
									total: filesList.length,
								})}
							</span>
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="sm"
								onClick={goNext}
								disabled={nextDisabled}
								aria-label={t('folderWindow.previewNext')}
								className="gap-1"
							>
								<span className="hidden sm:inline">
									{t('folderWindow.previewNext')}
								</span>
								<ChevronRightIcon
									className="h-4 w-4 shrink-0"
									aria-hidden="true"
								/>
							</DesktopAppButton>
						</div>
					</div>
				</DesktopShellFloatingPortal>
			) : null}
			<FilePreviewModal
				key={file.id}
				contentId={file.id}
				name={file.name}
				content_type={file.content_type}
				mime_type={file.mime_type}
				onClose={onClose}
			/>
		</>
	);
}
