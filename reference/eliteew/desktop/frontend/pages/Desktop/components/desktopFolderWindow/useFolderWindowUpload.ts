/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Multi-file upload orchestration for Desktop folder window body drop zone and upload button.
 *
 * Invariants:
 * - Upload query scoped to current window folder id; partial failures surface notify toasts.
 *
 * Related:
 * - useFolderWindowListBodyDrop.ts · folderWindowListUtils.ts
 */

import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { notify } from '@/notifications';
import { contentApi } from '@/services/contentApi';
import { log } from '@/utils/logger';
import { folderWindowUploadQuery } from './folderWindowListUtils';

export interface UseFolderWindowUploadOptions {
	folderId: string | undefined;
	fetchFolderContent: () => void | Promise<void>;
	refreshFolderBadgeCounts: (
		...folderIds: Array<string | null | undefined>
	) => void;
	setFolderUploadBusy: Dispatch<SetStateAction<boolean>>;
	setFolderUploadProgress: Dispatch<
		SetStateAction<{
			index: number;
			total: number;
			percent: number;
		} | null>
	>;
}

export function useFolderWindowUpload({
	folderId,
	fetchFolderContent,
	refreshFolderBadgeCounts,
	setFolderUploadBusy,
	setFolderUploadProgress,
}: UseFolderWindowUploadOptions) {
	const { t } = useTranslation('desktopUi');

	const runFolderUploadFiles = useCallback(
		async (fileList: FileList | File[]) => {
			const files = Array.from(fileList);
			if (files.length === 0 || !folderId) {
				return;
			}
			const q = folderWindowUploadQuery(folderId);
			setFolderUploadBusy(true);
			setFolderUploadProgress({
				index: 1,
				total: files.length,
				percent: 0,
			});
			let ok = 0;
			let fail = 0;
			let i = 0;
			for (const file of files) {
				try {
					await contentApi.uploadContent(file, q, {
						onProgress: (pct) => {
							setFolderUploadProgress({
								index: i + 1,
								total: files.length,
								percent: pct,
							});
						},
					});
					ok += 1;
				} catch (err) {
					fail += 1;
					log.warn('Desktop', 'FolderIcon window upload failed', err);
				}
				i += 1;
			}
			setFolderUploadBusy(false);
			setFolderUploadProgress(null);
			if (ok > 0) {
				void fetchFolderContent();
				refreshFolderBadgeCounts(folderId);
			}
			if (ok === 0 && fail > 0) {
				notify.error(
					t('folderWindow.uploadAllFailedTitle'),
					t('folderWindow.uploadAllFailedBody')
				);
			} else if (fail > 0) {
				notify.error(
					t('folderWindow.uploadPartialTitle'),
					t('folderWindow.uploadPartialBody', { ok, fail })
				);
			} else if (ok > 0) {
				notify.success(t('folderWindow.uploadDone'));
			}
		},
		[
			fetchFolderContent,
			folderId,
			refreshFolderBadgeCounts,
			setFolderUploadBusy,
			setFolderUploadProgress,
			t,
		]
	);

	return { runFolderUploadFiles };
}
