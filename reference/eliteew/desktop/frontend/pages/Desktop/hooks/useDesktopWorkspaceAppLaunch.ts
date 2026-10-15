/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Centralized Desktop app launch helper for installed-app checks, payload wiring, and app-specific launch actions.
 *
 * Invariants:
 * - Social Hub launch hints travel through typed window payloads, not one-shot sessionStorage.
 * - Content Manager folder launches preserve existing project-folder payload merge semantics.
 *
 * Related:
 * - useDesktopWorkspaceOpenAppEvent.ts
 * - ../utils/desktopOpenPayloads.ts
 */

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageType } from '../../../hooks/useAppState';
import { parseProjectIdFromDesktopFolderItemId } from '@/pages/ContentManager/projectDesktopFolder';
import { DEFAULT_APPS } from '../constants';
import type { DesktopItem } from '../types/desktop.types';
import { announceToScreenReader } from '../../../utils/accessibility';
import { localizeDefaultDesktopAppCatalogItem } from '../utils/localizeDefaultDesktopAppCatalogCopy';
import {
	canDisplayDesktopItem,
	resolveDesktopAppItem,
} from '../utils/desktopAppRegistry';
import { CONTENT_MANAGER_WINDOW_PAYLOAD_RESET } from '../utils/desktopOpenPayloads';
import {
	desktopFileItemToRecentLike,
	resolveRecentFileOpenAction,
} from '../utils/openRecentFileOnDesktop';
import { notify as toast } from '@/notifications';
import type { StoreAppResponse } from '../services/desktopApi';
import type { OpenWindowOptions } from './useWindowManager';

export type DesktopGafOpenActionsValue = {
	openAppByComponent: (appComponent: string) => void;
};

export type SocialHubLaunchTab =
	| 'overview'
	| 'friends'
	| 'profile'
	| 'mobile-app';

export type UseDesktopWorkspaceAppLaunchParams = {
	items: DesktopItem[];
	installedApps: DesktopItem[];
	installedAppIds: ReadonlySet<string>;
	openWindow: (item: DesktopItem, options?: OpenWindowOptions) => void;
	/** Каталог магазина: режим обслуживания перехватывает запуск */
	storeApps?: StoreAppResponse[];
	/** Shell-страницы без окна (редкие сценарии). */
	launchShellPage?: (page: PageType) => void;
};

export type UseDesktopWorkspaceAppLaunchReturn = {
	handleOpenWindow: (item: DesktopItem, options?: OpenWindowOptions) => void;
	openDesktopAppByComponent: (
		appComponent: string,
		options?: OpenWindowOptions
	) => DesktopItem | undefined;
	openSocialHubTab: (
		tab?: SocialHubLaunchTab,
		options?: { friendUserId?: string | null }
	) => DesktopItem | undefined;
	desktopGafOpenActions: DesktopGafOpenActionsValue;
};

export function useDesktopWorkspaceAppLaunch(
	params: UseDesktopWorkspaceAppLaunchParams
): UseDesktopWorkspaceAppLaunchReturn {
	const { items, installedApps, installedAppIds, openWindow, storeApps } =
		params;
	const { t: tAppStore } = useTranslation('appStore');
	const { t } = useTranslation('desktopUi');

	const appProcessRegistry = useMemo(
		() => ({
			ensureProcess: (appComponent?: string | null) => {
				if (!appComponent) return;
			},
		}),
		[]
	);

	const handleOpenWindow = useCallback(
		(item: DesktopItem, options?: OpenWindowOptions) => {
			let launchItem = item;
			let launchOptions = options;
			if (item.type === 'file' && options?.initialPayload == null) {
				const recentLike = desktopFileItemToRecentLike(item);
				if (recentLike) {
					const fileAction = resolveRecentFileOpenAction(recentLike, items);
					if (fileAction) {
						launchItem = fileAction.item;
						launchOptions = {
							...(options ?? {}),
							...(fileAction.options ?? {}),
							initialPayload: { ...fileAction.options?.initialPayload },
						};
					}
				}
			}

			if (item.type === 'folder') {
				const projectId = parseProjectIdFromDesktopFolderItemId(item.id);
				if (projectId) {
					const cmApp =
						items.find((i) => i.appComponent === 'ContentManagerPro') ??
						DEFAULT_APPS.find((i) => i.appComponent === 'ContentManagerPro');
					if (cmApp) {
						launchItem = cmApp;
						launchOptions = {
							...(options ?? {}),
							initialPayload: {
								...CONTENT_MANAGER_WINDOW_PAYLOAD_RESET,
								...(options?.initialPayload ?? {}),
								contentManagerProjectId: projectId,
								contentManagerProjectName: item.name?.trim() || undefined,
							},
						};
					}
				}
			}

			const resolved = localizeDefaultDesktopAppCatalogItem(
				resolveDesktopAppItem(launchItem, installedApps),
				tAppStore
			);
			if (
				resolved.type === 'app' &&
				!canDisplayDesktopItem(resolved, installedAppIds)
			) {
				const appName =
					resolved.name ||
					launchItem.name ||
					item.name ||
					tAppStore('launch.unknownApp');
				toast.error(
					tAppStore('launch.appNotInstalled', { name: appName }),
					tAppStore('launch.installViaStore', { name: appName })
				);
				return;
			}
			if (resolved.type === 'app') {
				appProcessRegistry.ensureProcess(resolved.appComponent);
			}
			const appStoreRow =
				resolved.type === 'app'
					? storeApps?.find((a) => a.app_id === resolved.id)
					: undefined;
			const allowMultipleWindows =
				resolved.type === 'app' &&
				Boolean(
					resolved.allowMultipleWindows ??
						appStoreRow?.allow_multiple_windows ??
						false
				);
			const rawMaxWindows =
				resolved.type === 'app'
					? Number(
							resolved.maxWindowInstances ??
								appStoreRow?.max_window_instances ??
								1
						)
					: 1;
			const maxWindowInstances = allowMultipleWindows
				? Math.max(
						1,
						Number.isFinite(rawMaxWindows) ? Math.trunc(rawMaxWindows) : 1
					)
				: 1;
			const openOpts: OpenWindowOptions | undefined =
				resolved.type === 'app' && resolved.appComponent === 'ContentManagerPro'
					? {
							...(launchOptions ?? {}),
							initialPayload: {
								...CONTENT_MANAGER_WINDOW_PAYLOAD_RESET,
								...(launchOptions?.initialPayload ?? {}),
							},
						}
					: launchOptions;
			const openOptsWithPolicy: OpenWindowOptions | undefined =
				resolved.type === 'app'
					? {
							instancePolicy: {
								allowMultiple: allowMultipleWindows,
								maxInstances: maxWindowInstances,
							},
							...(openOpts ?? {}),
						}
					: openOpts;
			if (
				resolved.type === 'app' &&
				resolved.id !== 'app-store' &&
				storeApps?.length
			) {
				const row = appStoreRow;
				if (row?.maintenance_mode) {
					openWindow(
						{
							...resolved,
							appComponent: 'DesktopAppMaintenance',
						},
						{
							...(openOptsWithPolicy ?? {}),
							initialPayload: {
								...(openOptsWithPolicy?.initialPayload ?? {}),
								maintenanceAppName: resolved.name,
								maintenanceAppId: resolved.id,
								maintenance_title: row.maintenance_title,
								maintenance_reason: row.maintenance_reason,
								maintenance_expected_outcome: row.maintenance_expected_outcome,
								maintenance_eta_note: row.maintenance_eta_note,
							},
						}
					);
					announceToScreenReader(
						t('windowChrome.screenReader.appMaintenanceOpened', {
							name: resolved.name,
						}),
						'polite'
					);
					return;
				}
			}
			openWindow(resolved, openOptsWithPolicy);
			announceToScreenReader(
				t('windowChrome.screenReader.windowOpened', { name: resolved.name }),
				'polite'
			);
		},
		[
			appProcessRegistry,
			installedAppIds,
			installedApps,
			items,
			openWindow,
			storeApps,
			t,
			tAppStore,
		]
	);

	const openDesktopAppByComponent = useCallback(
		(
			appComponent: string,
			options?: OpenWindowOptions
		): DesktopItem | undefined => {
			const raw =
				items.find((item) => item.appComponent === appComponent) ??
				DEFAULT_APPS.find((item) => item.appComponent === appComponent);
			if (!raw) {
				return undefined;
			}
			const app = localizeDefaultDesktopAppCatalogItem(raw, tAppStore);
			handleOpenWindow(app, options);
			return app;
		},
		[handleOpenWindow, items, tAppStore]
	);

	const openSocialHubTab = useCallback(
		(
			tab: SocialHubLaunchTab = 'friends',
			options?: { friendUserId?: string | null }
		) => {
			const friendUserId = options?.friendUserId?.trim() || undefined;
			return openDesktopAppByComponent('SocialHubApp', {
				initialPayload: {
					socialHubTab: friendUserId ? 'friends' : tab,
					...(friendUserId ? { socialHubFriendUserId: friendUserId } : {}),
				},
			});
		},
		[openDesktopAppByComponent]
	);

	const desktopGafOpenActions = useMemo(
		(): DesktopGafOpenActionsValue => ({
			openAppByComponent: (appComponent: string) => {
				openDesktopAppByComponent(appComponent, { forceNew: true });
			},
			openSocialHubTab: (tab) => {
				openSocialHubTab(tab);
			},
		}),
		[openDesktopAppByComponent, openSocialHubTab]
	);

	return {
		handleOpenWindow,
		openDesktopAppByComponent,
		openSocialHubTab,
		desktopGafOpenActions,
	};
}
