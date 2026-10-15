/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Stable persistence error codes from `useDesktopStorage` — UI layers translate via `desktopUi`.
 *
 * Invariants:
 * - Codes are locale-neutral; never show raw codes in user-facing copy.
 * - Legacy Russian literals are not accepted at translation boundaries.
 *
 * Related:
 * - `hooks/useDesktopStorage.ts`
 * - `hooks/useDesktopWorkspaceChromeState.ts`
 */

import type { TFunction } from 'i18next';

export const DESKTOP_STORAGE_SYNC_ERROR = {
	SYNC_FAILED: 'sync_failed',
	SERVER_UNAVAILABLE_LOCAL: 'server_unavailable_local',
	SERVER_SYNC_FAILED: 'server_sync_failed',
} as const;

export type DesktopStorageSyncErrorCode =
	(typeof DESKTOP_STORAGE_SYNC_ERROR)[keyof typeof DESKTOP_STORAGE_SYNC_ERROR];

export function translateDesktopStorageSyncError(
	code: DesktopStorageSyncErrorCode | null | undefined,
	t: TFunction<'desktopUi'>
): string | null {
	if (!code) return null;
	switch (code) {
		case DESKTOP_STORAGE_SYNC_ERROR.SYNC_FAILED:
			return t('workspace.syncFailed');
		case DESKTOP_STORAGE_SYNC_ERROR.SERVER_UNAVAILABLE_LOCAL:
			return t('workspace.syncServerUnavailable');
		case DESKTOP_STORAGE_SYNC_ERROR.SERVER_SYNC_FAILED:
			return t('workspace.syncServerSyncFailed');
		default: {
			const _exhaustive: never = code;
			return _exhaustive;
		}
	}
}

export const DESKTOP_STORAGE_CONFIG_SAVE_ERROR = {
	QUEUED_SERVER_UNAVAILABLE: 'config_queued_server_unavailable',
	FAILED_LOCAL_KEPT: 'config_failed_local_kept',
} as const;

export type DesktopStorageConfigSaveErrorCode =
	(typeof DESKTOP_STORAGE_CONFIG_SAVE_ERROR)[keyof typeof DESKTOP_STORAGE_CONFIG_SAVE_ERROR];

export function translateDesktopStorageConfigSaveError(
	code: DesktopStorageConfigSaveErrorCode | null | undefined,
	t: TFunction<'desktopUi'>
): string | null {
	if (!code) return null;
	switch (code) {
		case DESKTOP_STORAGE_CONFIG_SAVE_ERROR.QUEUED_SERVER_UNAVAILABLE:
			return t('workspace.configSaveQueuedServerUnavailable');
		case DESKTOP_STORAGE_CONFIG_SAVE_ERROR.FAILED_LOCAL_KEPT:
			return t('workspace.configSaveFailedLocalKept');
		default: {
			const _exhaustive: never = code;
			return _exhaustive;
		}
	}
}
