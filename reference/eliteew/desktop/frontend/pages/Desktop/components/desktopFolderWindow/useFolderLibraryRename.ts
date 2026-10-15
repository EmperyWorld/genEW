/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Library file rename state and PATCH confirm flow for Desktop folder window.
 *
 * Invariants:
 * - No-op when draft is blank or unchanged; closes modal without API call.
 *
 * Related:
 * - DesktopFolderRenameModal.tsx; DesktopFolderWindow.tsx
 */

import { notify } from '@/notifications';
import { api } from '@/services/api/client';
import type * as React from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DESKTOP_API_V1_BASE } from '../../services/desktopApi';
import type { FolderFileItem } from '../../hooks/useFolderContents';

export type FolderRenameOpenState = {
	file: FolderFileItem;
	draft: string;
} | null;

type SetFolderFiles = React.Dispatch<
	React.SetStateAction<FolderFileItem[] | null | undefined>
>;

export function useFolderLibraryRename(setFolderFiles: SetFolderFiles) {
	const { t } = useTranslation('desktopUi');
	const [folderRenameOpen, setFolderRenameOpen] =
		useState<FolderRenameOpenState>(null);

	const openFolderRename = useCallback((file: FolderFileItem) => {
		setFolderRenameOpen({ file, draft: file.name || '' });
	}, []);

	const closeFolderRename = useCallback(() => {
		setFolderRenameOpen(null);
	}, []);

	const setFolderRenameDraft = useCallback((draft: string) => {
		setFolderRenameOpen((prev) => (prev ? { ...prev, draft } : prev));
	}, []);

	const confirmFolderRename = useCallback(() => {
		if (!folderRenameOpen) return;
		const newName = folderRenameOpen.draft.trim();
		const { file } = folderRenameOpen;
		if (!newName || newName === (file.name || '')) {
			setFolderRenameOpen(null);
			return;
		}
		api
			.patch(
				`${DESKTOP_API_V1_BASE}/content/${file.id}`,
				{ name: newName },
				{ baseURL: '' }
			)
			.then(() => {
				setFolderFiles((prev) =>
					prev
						? prev.map((f) => (f.id === file.id ? { ...f, name: newName } : f))
						: prev
				);
				setFolderRenameOpen(null);
			})
			.catch((err: unknown) => {
				notify.error(
					t('folderWindow.renameFailedTitle'),
					t('folderWindow.renameFailedBody')
				);
				console.error('[DesktopFolderWindow] Rename failed', err);
			});
	}, [folderRenameOpen, setFolderFiles, t]);

	return {
		folderRenameOpen,
		openFolderRename,
		closeFolderRename,
		setFolderRenameDraft,
		confirmFolderRename,
	};
}
