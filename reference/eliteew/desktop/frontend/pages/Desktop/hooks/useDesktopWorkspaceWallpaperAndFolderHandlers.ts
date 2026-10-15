import { useCallback, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_DESKTOP_WALLPAPER_STYLE } from '../constants';
import type { UserFolderIconId } from '../constants/folderIcons';
import { notify as toast } from '@/notifications';

import type { UseDesktopStorageReturn } from './useDesktopStorage';

/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Wallpaper picker and new-folder create handlers for desktop workspace shell modals.
 *
 * Invariants:
 * - Remote config PATCH respects personalization try-on defer ref when provided.
 *
 * Related:
 * - DesktopWorkspaceContent.tsx
 * - useDesktopStorage.ts
 */
export function useDesktopWorkspaceWallpaperAndFolderHandlers(params: {
	createFolderAPI: (
		name: string,
		options?: { parentId?: string; folderIconId?: UserFolderIconId }
	) => Promise<unknown>;
	setWallpaper: (style: string) => void;
	updateConfig: UseDesktopStorageReturn['updateConfig'];
	/** Matches theme/accent defer: skip remote PATCH when try-on active. */
	deferConfigPersistRef?: RefObject<boolean>;
	wallpaper: string;
	wallpaperHistory: string[] | undefined;
	/** Сбросить локальный фон активного виртуального стола, чтобы показался новый глобальный фон. */
	clearActiveDesktopWallpaperOverride?: () => void;
}) {
	const { t } = useTranslation('desktopUi');
	const {
		createFolderAPI,
		setWallpaper,
		updateConfig,
		deferConfigPersistRef,
		wallpaper,
		wallpaperHistory,
		clearActiveDesktopWallpaperOverride,
	} = params;

	const persistRemoteCfg = useCallback(
		() => deferConfigPersistRef?.current !== true,
		[deferConfigPersistRef]
	);
	const handleCreateFolder = useCallback(
		async (name: string, iconId: UserFolderIconId, parentId?: string) => {
			await createFolderAPI(name, { parentId, folderIconId: iconId });
		},
		[createFolderAPI]
	);

	const handleWallpaperChange = useCallback(
		(newWallpaper: string) => {
			clearActiveDesktopWallpaperOverride?.();
			setWallpaper(newWallpaper);
			updateConfig(
				{ wallpaper: newWallpaper },
				{ persistRemote: persistRemoteCfg() }
			).catch(() => {
				toast.error(
					t('wallpaper.modalTitle'),
					t('wallpaper.toastSaveFailedBody')
				);
			});
		},
		[
			clearActiveDesktopWallpaperOverride,
			persistRemoteCfg,
			setWallpaper,
			updateConfig,
			t,
		]
	);

	const handleRemoveUserWallpaper = useCallback(
		(style: string) => {
			const hist = wallpaperHistory ?? [];
			const nextHist = hist.filter((s) => s !== style);
			if (wallpaper === style) {
				clearActiveDesktopWallpaperOverride?.();
				setWallpaper(DEFAULT_DESKTOP_WALLPAPER_STYLE);
				updateConfig(
					{
						wallpaper: DEFAULT_DESKTOP_WALLPAPER_STYLE,
						wallpaper_history: nextHist,
					},
					{ persistRemote: persistRemoteCfg() }
				).catch(() => {
					toast.error(
						t('wallpaper.modalTitle'),
						t('wallpaper.toastHistoryUpdateFailedBody')
					);
				});
				return;
			}
			updateConfig(
				{ wallpaper_history: nextHist },
				{ persistRemote: persistRemoteCfg() }
			).catch(() => {
				toast.error(
					t('wallpaper.modalTitle'),
					t('wallpaper.toastHistoryUpdateFailedBody')
				);
			});
		},
		[
			clearActiveDesktopWallpaperOverride,
			persistRemoteCfg,
			wallpaperHistory,
			wallpaper,
			setWallpaper,
			updateConfig,
			t,
		]
	);

	return {
		handleCreateFolder,
		handleWallpaperChange,
		handleRemoveUserWallpaper,
	};
}
