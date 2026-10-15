/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Installed apps list for Start Menu, Taskbar and app launch surfaces, derived from `/desktop/store` + `/desktop/installed`.
 *
 * Invariants:
 * - Installation source of truth is `/desktop/installed` (`user_installed_apps`), not stale store flags.
 * - Built DesktopItem rows keep stable app ids/appComponent while normalizing legacy user-facing copy.
 *
 * Related:
 * - src/pages/Desktop/services/desktopApi.ts
 * - src/pages/Desktop/utils/desktopDefaultAppUserFacingCopy.ts
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../contexts/AuthContext';
import authSession from '../../../services/authSession';
import { DEFAULT_APPS } from '../constants';
import {
	installApp as apiInstallApp,
	uninstallApp as apiUninstallApp,
	getInstalled,
	getStore,
} from '../services/desktopApi';
import type { DesktopItem } from '../types/desktop.types';
import {
	isLegacyHiddenDesktopAppComponent,
	isLegacyHiddenDesktopAppId,
} from '../utils/desktopAppRegistry';
import {
	normalizeDefaultDesktopAppUserFacingCopy,
	normalizeDefaultDesktopStoreAppUserFacingCopy,
} from '../utils/desktopDefaultAppUserFacingCopy';
import {
	localizeDefaultDesktopAppCatalogItem,
	localizeDefaultDesktopStoreAppCatalogRow,
} from '../utils/localizeDefaultDesktopAppCatalogCopy';

const STORE_QUERY_KEY = ['desktop', 'store'] as const;
const INSTALLED_QUERY_KEY = ['desktop', 'installed'] as const;
const EW_WALLET_QUERY_KEY = ['desktop', 'ew-wallet'] as const;
const INSTALLED_APPS_SYNC_KEY = 'desktop:installed-apps:sync';
const INSTALLED_APPS_MUTATED_EVENT = 'desktop-installed-apps-mutated';

export interface UseDesktopInstalledAppsReturn {
	/** Only apps that are installed for current user (for Start menu and Taskbar) */
	installedApps: DesktopItem[];
	/** All store apps with installed flag (for App Store UI) */
	storeApps: Awaited<ReturnType<typeof getStore>>['apps'] | undefined;
	/** Install an app; refetches after */
	installApp: (appId: string) => Promise<void>;
	/** Uninstall an app; refetches after */
	uninstallApp: (appId: string) => Promise<void>;
	/** Refetch store and installed */
	refetch: () => Promise<void>;
	isLoading: boolean;
	error: Error | null;
}

/**
 * Build DesktopItem[] for installed apps: catalog + desktop_items (position, is_pinned) + DEFAULT_APPS (icons).
 */
export function buildInstalledApps(
	storeApps: Awaited<ReturnType<typeof getStore>>['apps'],
	desktopItems: DesktopItem[]
): DesktopItem[] {
	const installedFromStore = storeApps.filter(
		(app) =>
			app.installed &&
			!isLegacyHiddenDesktopAppId(app.app_id) &&
			!isLegacyHiddenDesktopAppComponent(app.app_component)
	);
	const defaultAppsMap = new Map(DEFAULT_APPS.map((a) => [a.id, a]));
	const desktopAppMap = new Map(
		desktopItems.filter((i) => i.type === 'app').map((i) => [i.id, i])
	);

	return installedFromStore.map((app) => {
		const defaultApp = defaultAppsMap.get(app.app_id);
		const desktopItem = desktopAppMap.get(app.app_id);
		return normalizeDefaultDesktopAppUserFacingCopy({
			id: app.app_id,
			name: app.name,
			type: 'app' as const,
			description: app.description ?? undefined,
			appComponent: app.app_component,
			category: app.category,
			allowMultipleWindows: app.allow_multiple_windows ?? false,
			maxWindowInstances: app.max_window_instances ?? 1,
			color: app.color ?? undefined,
			gradient: app.gradient ?? undefined,
			position: desktopItem?.position ??
				defaultApp?.position ?? { x: 20, y: 20 },
			isPinned: desktopItem?.isPinned ?? defaultApp?.isPinned ?? false,
			icon: defaultApp?.icon,
		});
	});
}

export function useDesktopInstalledApps(
	desktopItems: DesktopItem[]
): UseDesktopInstalledAppsReturn {
	const queryClient = useQueryClient();
	const { t } = useTranslation('appStore');
	const { isAuthenticated } = useAuth();
	const hasAuthenticatedSession = isAuthenticated || Boolean(authSession.token);

	const refetchInstalledState = useCallback(async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: STORE_QUERY_KEY }),
			queryClient.invalidateQueries({ queryKey: INSTALLED_QUERY_KEY }),
			queryClient.invalidateQueries({ queryKey: EW_WALLET_QUERY_KEY }),
		]);
	}, [queryClient]);

	useEffect(() => {
		const handleStorage = (event: StorageEvent) => {
			if (event.key !== INSTALLED_APPS_SYNC_KEY || !event.newValue) {
				return;
			}
			void refetchInstalledState();
		};
		const handleMutation = () => {
			void refetchInstalledState();
		};

		window.addEventListener('storage', handleStorage);
		window.addEventListener(INSTALLED_APPS_MUTATED_EVENT, handleMutation);
		return () => {
			window.removeEventListener('storage', handleStorage);
			window.removeEventListener(INSTALLED_APPS_MUTATED_EVENT, handleMutation);
		};
	}, [refetchInstalledState]);

	/** Каталог и installed: shell-bootstrap seeds installed; store catalog stays a separate GET. */
	const storeQuery = useQuery({
		queryKey: STORE_QUERY_KEY,
		queryFn: () => getStore(),
		enabled: hasAuthenticatedSession,
		staleTime: 45_000,
		gcTime: 5 * 60 * 1000,
		refetchOnMount: true,
		refetchOnWindowFocus: true,
	});

	const installedQuery = useQuery({
		queryKey: INSTALLED_QUERY_KEY,
		queryFn: () => getInstalled(),
		enabled: hasAuthenticatedSession,
		staleTime: 45_000,
		gcTime: 5 * 60 * 1000,
		// Bootstrap hydrate sets fresh cache; avoid remount refetch when still fresh.
		refetchOnMount: false,
		refetchOnWindowFocus: true,
	});

	const rawStoreApps = hasAuthenticatedSession
		? storeQuery.data?.apps
		: undefined;
	const installedIdsFromQuery = hasAuthenticatedSession
		? (installedQuery.data?.app_ids ?? [])
		: [];

	const storeApps = useMemo(() => {
		if (!rawStoreApps) return undefined;
		const installedSet = new Set(installedIdsFromQuery);
		// Нормализуем флаг installed: источник правды — /desktop/installed (user_installed_apps).
		return rawStoreApps
			.filter(
				(app) =>
					!isLegacyHiddenDesktopAppId(app.app_id) &&
					!isLegacyHiddenDesktopAppComponent(app.app_component)
			)
			.map((app) =>
				localizeDefaultDesktopStoreAppCatalogRow(
					normalizeDefaultDesktopStoreAppUserFacingCopy({
						...app,
						installed:
							app.app_id === 'app-store' || installedSet.has(app.app_id),
					}),
					t
				)
			);
	}, [rawStoreApps, installedIdsFromQuery, t]);

	const installedApps = useMemo(() => {
		if (!storeApps) return [];
		return buildInstalledApps(storeApps, desktopItems).map((item) =>
			localizeDefaultDesktopAppCatalogItem(item, t)
		);
	}, [storeApps, desktopItems, t]);

	const installApp = useCallback(
		async (appId: string) => {
			await apiInstallApp(appId);
			await refetchInstalledState();
			try {
				localStorage.setItem(
					INSTALLED_APPS_SYNC_KEY,
					JSON.stringify({ appId, action: 'install', updatedAt: Date.now() })
				);
			} catch {
				// ignore storage sync errors
			}
			window.dispatchEvent(
				new CustomEvent(INSTALLED_APPS_MUTATED_EVENT, {
					detail: { appId, action: 'install' },
				})
			);
		},
		[refetchInstalledState]
	);

	const uninstallApp = useCallback(
		async (appId: string) => {
			await apiUninstallApp(appId);
			await refetchInstalledState();
			try {
				localStorage.setItem(
					INSTALLED_APPS_SYNC_KEY,
					JSON.stringify({ appId, action: 'uninstall', updatedAt: Date.now() })
				);
			} catch {
				// ignore storage sync errors
			}
			window.dispatchEvent(
				new CustomEvent(INSTALLED_APPS_MUTATED_EVENT, {
					detail: { appId, action: 'uninstall' },
				})
			);
		},
		[refetchInstalledState]
	);

	const refetch = useCallback(async () => {
		await refetchInstalledState();
	}, [refetchInstalledState]);

	const isLoading = hasAuthenticatedSession
		? storeQuery.isLoading || installedQuery.isLoading
		: false;
	const error = hasAuthenticatedSession
		? ((storeQuery.error ?? installedQuery.error) as Error | null)
		: null;

	return {
		installedApps,
		storeApps,
		installApp,
		uninstallApp,
		refetch,
		isLoading,
		error,
	};
}
