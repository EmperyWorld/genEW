/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Loading shell props + translated persistence errors (initial load vs sync) for desktop workspace chrome.
 *
 * Invariants:
 * - Server restart / maintenance uses recovery preloader variant and restart-aware copy.
 * - Connection check reuses global `performRecoveryConnectionCheck` contract.
 *
 * Related:
 * - `hooks/useDesktopMaintenanceAwareLoading.ts`
 * - `components/DesktopWorkspaceLoadingShell.tsx`
 */

import type { TFunction } from 'i18next';
import { useCallback, useMemo } from 'react';
import { performRecoveryConnectionCheck } from '@/services/maintenance/reloadCircuitBreaker';
import type { DesktopWorkspaceLoadingShellProps } from '../components/DesktopWorkspaceLoadingShell';
import type { DesktopLoadFailureInfo } from '../utils/desktopUi';
import {
	translateDesktopStorageSyncError,
	type DesktopStorageSyncErrorCode,
} from '../utils/desktopStorageSyncError';
import { useDesktopMaintenanceAwareLoading } from './useDesktopMaintenanceAwareLoading';

export function useDesktopWorkspacePersistenceMessages(params: {
	loadFailure: DesktopLoadFailureInfo | null;
	storageError: DesktopStorageSyncErrorCode | null;
	/** Last error from flushing local PATCH queue to the API. */
	persistPatchFlushFailed?: string | null;
	t: TFunction<'desktopUi'>;
}): {
	loadFailureMessage: string | null;
	translatedSyncError: string | null;
	combinedDesktopPersistenceError: string | null;
} {
	const { loadFailure, storageError, persistPatchFlushFailed, t } = params;

	const loadFailureMessage = useMemo(() => {
		if (!loadFailure) return null;
		const { kind, httpStatus } = loadFailure;
		return t(`workspace.loadError.${kind}`, {
			status: httpStatus != null ? String(httpStatus) : '—',
		});
	}, [loadFailure, t]);

	const translatedSyncError = useMemo(
		() => translateDesktopStorageSyncError(storageError, t),
		[storageError, t]
	);

	const persistFlushMessage = useMemo(() => {
		if (!persistPatchFlushFailed?.trim()) return null;
		return t('workspace.persistPatchFlushFailed', {
			detail: persistPatchFlushFailed,
		});
	}, [persistPatchFlushFailed, t]);

	const combinedDesktopPersistenceError = useMemo(
		() => loadFailureMessage ?? persistFlushMessage ?? translatedSyncError,
		[loadFailureMessage, persistFlushMessage, translatedSyncError]
	);

	return {
		loadFailureMessage,
		translatedSyncError,
		combinedDesktopPersistenceError,
	};
}

export type UseDesktopWorkspaceChromeStateParams = {
	loadFailure: DesktopLoadFailureInfo | null;
	storageError: DesktopStorageSyncErrorCode | null;
	persistPatchFlushFailed?: string | null;
	t: TFunction<'desktopUi'>;
	effectiveTheme: string;
	desktopThemeVars: Record<string, string>;
	workspaceShellCss: string;
	isLoadingStalled: boolean;
	refreshStorage: () => void | Promise<void>;
};

export function useDesktopWorkspaceChromeState(
	params: UseDesktopWorkspaceChromeStateParams
): {
	combinedDesktopPersistenceError: string | null;
	loadFailureMessage: string | null;
	deferLoadingShellToMaintenance: boolean;
	desktopMaintenanceOverlay: {
		windowId: string;
		title: string;
		message: string;
		statusLabel: string;
	} | null;
	loadingShellProps: DesktopWorkspaceLoadingShellProps;
} {
	const persistence = useDesktopWorkspacePersistenceMessages({
		loadFailure: params.loadFailure,
		storageError: params.storageError,
		persistPatchFlushFailed: params.persistPatchFlushFailed,
		t: params.t,
	});

	const maintenanceLoading = useDesktopMaintenanceAwareLoading({
		isLoadingStalled: params.isLoadingStalled,
	});

	const onConnectionCheck = useCallback(async () => {
		const ready = await performRecoveryConnectionCheck();
		if (ready) {
			await params.refreshStorage();
		}
	}, [params.refreshStorage]);

	const loadingShellProps = useMemo<DesktopWorkspaceLoadingShellProps>(
		() => ({
			loadingLabel: params.t('workspace.loading'),
			effectiveTheme: params.effectiveTheme,
			desktopThemeVars: params.desktopThemeVars,
			workspaceShellCss: params.workspaceShellCss,
			isLoadingStalled: params.isLoadingStalled,
			preloaderVariant: maintenanceLoading.preloaderVariant,
			maintenanceTitle: maintenanceLoading.maintenanceTitle,
			loadingStalledMessage: maintenanceLoading.isServerRecoveryContext
				? params.t('workspace.loadingStalledServer')
				: params.t('workspace.loadingStalled'),
			retryLabel: params.t('workspace.retry'),
			onRetry: params.refreshStorage,
			connectionCheckLabel: maintenanceLoading.isServerRecoveryContext
				? params.t('workspace.checkConnection')
				: undefined,
			onConnectionCheck: maintenanceLoading.isServerRecoveryContext
				? onConnectionCheck
				: undefined,
		}),
		[
			params.t,
			params.effectiveTheme,
			params.desktopThemeVars,
			params.workspaceShellCss,
			params.isLoadingStalled,
			params.refreshStorage,
			maintenanceLoading.preloaderVariant,
			maintenanceLoading.maintenanceTitle,
			maintenanceLoading.isServerRecoveryContext,
			onConnectionCheck,
		]
	);

	return {
		combinedDesktopPersistenceError:
			persistence.combinedDesktopPersistenceError,
		loadFailureMessage: persistence.loadFailureMessage,
		deferLoadingShellToMaintenance:
			maintenanceLoading.deferLoadingShellToMaintenance,
		desktopMaintenanceOverlay: maintenanceLoading.desktopMaintenanceOverlay,
		loadingShellProps,
	};
}
