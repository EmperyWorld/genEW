/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Batch delete confirm modals for library Unified Content files and nested desktop shortcuts in folder window.
 *
 * Invariants:
 * - Library delete uses API per file; nested delete delegates to desktop item removal callback.
 *
 * Related:
 * - DesktopFolderWindow.tsx · ConfirmDeleteModal
 */

import { ConfirmDeleteModal } from '@/components/ui/modals/ConfirmDeleteModal';
import { useTranslation } from 'react-i18next';
import { notify } from '@/notifications';
import { api } from '@/services/api/client';
import type { Dispatch, SetStateAction } from 'react';
import type { FolderFileItem } from '../../hooks/useFolderContents';
import type { DesktopItem } from '../../types/desktop.types';
import { DESKTOP_API_V1_BASE } from '../../services/desktopApi';

export interface DesktopFolderDeleteModalsProps {
	effectiveFolderId: string;
	folderDeletePending: FolderFileItem[] | null;
	setFolderDeletePending: Dispatch<SetStateAction<FolderFileItem[] | null>>;
	setFolderFiles: Dispatch<SetStateAction<FolderFileItem[] | undefined>>;
	clearSelection: () => void;
	refreshFolderBadgeCounts: (
		...folderIds: Array<string | null | undefined>
	) => void;
	nestedDeletePending: DesktopItem[] | null;
	setNestedDeletePending: Dispatch<SetStateAction<DesktopItem[] | null>>;
	clearNestedSelection: () => void;
	onDeleteNestedItems?: (ids: string[]) => void;
}

export function DesktopFolderDeleteModals({
	effectiveFolderId,
	folderDeletePending,
	setFolderDeletePending,
	setFolderFiles,
	clearSelection,
	refreshFolderBadgeCounts,
	nestedDeletePending,
	setNestedDeletePending,
	clearNestedSelection,
	onDeleteNestedItems,
}: DesktopFolderDeleteModalsProps) {
	const { t } = useTranslation('desktopUi');

	return (
		<>
			<ConfirmDeleteModal
				isOpen={folderDeletePending !== null && folderDeletePending.length > 0}
				onClose={() => setFolderDeletePending(null)}
				onConfirm={async () => {
					const pending = folderDeletePending;
					if (!pending?.length) return;
					let ok = 0;
					let fail = 0;
					for (const file of pending) {
						try {
							await api.delete(`${DESKTOP_API_V1_BASE}/content/${file.id}`, {
								baseURL: '',
							});
							ok += 1;
							setFolderFiles((prev) =>
								prev ? prev.filter((f) => f.id !== file.id) : prev
							);
						} catch {
							fail += 1;
						}
					}
					clearSelection();
					setFolderDeletePending(null);
					if (ok > 0) {
						refreshFolderBadgeCounts(effectiveFolderId);
					}
					if (fail > 0 && ok === 0) {
						notify.error(
							t('folderWindow.batchDeleteFailedTitle'),
							t('folderWindow.batchDeleteFailedBody')
						);
					} else if (fail > 0) {
						notify.error(
							t('folderWindow.batchPartialTitle'),
							t('folderWindow.batchPartialBody', { ok, fail })
						);
					}
				}}
				title={
					folderDeletePending && folderDeletePending.length > 1
						? t('folderWindow.deleteManyTitle')
						: t('folderWindow.deleteFileTitle')
				}
				warningMessage={
					folderDeletePending && folderDeletePending.length > 1
						? t('folderWindow.deleteManyWarning', {
								count: folderDeletePending.length,
							})
						: folderDeletePending
							? t('folderWindow.deleteFileWarning', {
									name: folderDeletePending[0]?.name ?? '',
								})
							: ''
				}
				confirmButtonLabel={t('folderWindow.deleteConfirm')}
				confirmButtonLoadingLabel={t('folderWindow.deleteLoading')}
				cancelButtonLabel={t('folderWindow.modalCancel')}
			/>

			<ConfirmDeleteModal
				isOpen={nestedDeletePending !== null && nestedDeletePending.length > 0}
				onClose={() => setNestedDeletePending(null)}
				onConfirm={() => {
					const pending = nestedDeletePending;
					if (!pending?.length) return;
					onDeleteNestedItems?.(pending.map((row) => row.id));
					clearNestedSelection();
					setNestedDeletePending(null);
				}}
				title={
					nestedDeletePending && nestedDeletePending.length > 1
						? t('folderWindow.nestedDeleteManyTitle')
						: t('folderWindow.nestedDeleteTitle')
				}
				warningMessage={
					nestedDeletePending && nestedDeletePending.length > 1
						? t('folderWindow.nestedDeleteManyWarning', {
								count: nestedDeletePending.length,
							})
						: nestedDeletePending
							? t('folderWindow.nestedDeleteWarning', {
									name: nestedDeletePending[0]?.name ?? '',
								})
							: ''
				}
				confirmButtonLabel={t('folderWindow.deleteConfirm')}
				confirmButtonLoadingLabel={t('folderWindow.deleteLoading')}
				cancelButtonLabel={t('folderWindow.modalCancel')}
			/>
		</>
	);
}
