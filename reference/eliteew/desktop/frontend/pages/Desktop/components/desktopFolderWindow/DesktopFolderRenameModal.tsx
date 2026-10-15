/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Portaled rename dialog for Unified Content files inside Desktop folder window.
 *
 * Invariants:
 * - Focus trap and initial input focus while open; Escape closes without save.
 *
 * Related:
 * - useFolderLibraryRename.ts; folderWindowPortalShell.tsx
 */

import { cn } from '@/utils/cn';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDesktopModalFocusTrap } from '../../hooks/useDesktopModalFocusTrap';
import { DESKTOP_TYPOGRAPHY } from '../../constants';
import { DesktopAppButton, DesktopAppModalFrame } from '../DesktopAppChrome';
import { wrapFolderWindowPortalShell } from './folderWindowPortalShell';
import type { FolderRenameOpenState } from './useFolderLibraryRename';

export interface DesktopFolderRenameModalProps {
	folderRenameOpen: FolderRenameOpenState;
	floatingMenuZIndex: number;
	floatingMenuBackdropZIndex: number;
	onClose: () => void;
	onDraftChange: (draft: string) => void;
	onConfirm: () => void;
}

export function DesktopFolderRenameModal({
	folderRenameOpen,
	floatingMenuZIndex,
	floatingMenuBackdropZIndex,
	onClose,
	onDraftChange,
	onConfirm,
}: DesktopFolderRenameModalProps) {
	const { t } = useTranslation('desktopUi');
	const folderRenameTrapRef = useRef<HTMLDivElement>(null);
	const folderRenameInputRef = useRef<HTMLInputElement>(null);

	useDesktopModalFocusTrap(folderRenameOpen !== null, folderRenameTrapRef);

	useEffect(() => {
		if (!folderRenameOpen) return;
		const id = requestAnimationFrame(() => {
			folderRenameInputRef.current?.focus();
		});
		return () => cancelAnimationFrame(id);
	}, [folderRenameOpen]);

	if (!folderRenameOpen || typeof document === 'undefined') {
		return null;
	}

	return createPortal(
		wrapFolderWindowPortalShell(
			<>
				<div
					className="fixed inset-0 bg-black/40"
					style={{ zIndex: floatingMenuBackdropZIndex }}
					aria-hidden
					onClick={onClose}
				/>
				<div
					className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"
					style={{ zIndex: floatingMenuZIndex }}
				>
					<div
						ref={folderRenameTrapRef}
						className="pointer-events-auto w-full max-w-md"
					>
						<DesktopAppModalFrame
							title={t('folderWindow.renameTitle')}
							onClose={onClose}
							closeLabel={t('folderWindow.renameCancel')}
						>
							<div className="flex flex-col gap-4 px-4 pb-4 pt-2">
								<label
									className={`${DESKTOP_TYPOGRAPHY.small} text-(--desktop-text-secondary)`}
									htmlFor="folder-rename-input"
								>
									{t('folderWindow.renameLabel')}
								</label>
								<input
									ref={folderRenameInputRef}
									id="folder-rename-input"
									type="text"
									value={folderRenameOpen.draft}
									onChange={(e) => onDraftChange(e.target.value)}
									className={cn(
										'w-full rounded-(--desktop-radius) border border-(--desktop-border-subtle)',
										'bg-(--desktop-surface-soft) px-3 py-2 outline-none',
										DESKTOP_TYPOGRAPHY.shellCopy13,
										'text-(--desktop-text-primary)',
										'focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
									)}
									onKeyDown={(e) => {
										if (e.key === 'Escape') {
											onClose();
										}
										if (e.key === 'Enter') {
											e.preventDefault();
											onConfirm();
										}
									}}
								/>
								<div className="flex flex-wrap justify-end gap-2">
									<DesktopAppButton
										type="button"
										variant="ghost"
										size="sm"
										onClick={onClose}
									>
										{t('folderWindow.renameCancel')}
									</DesktopAppButton>
									<DesktopAppButton
										type="button"
										variant="accent"
										size="sm"
										onClick={onConfirm}
									>
										{t('folderWindow.renameSave')}
									</DesktopAppButton>
								</div>
							</div>
						</DesktopAppModalFrame>
					</div>
				</div>
			</>
		),
		document.body
	);
}
