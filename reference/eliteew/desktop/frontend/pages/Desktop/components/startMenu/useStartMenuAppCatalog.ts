/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Derives Start Menu app lists (filter, pin, category, recent, recommended)
 * from shell items and expansion profiles.
 *
 * Invariants:
 * - System desktop apps never toggle pin via the catalog helper.
 *
 * Related:
 * - ../StartMenu.tsx
 * - ../../types/desktopStartMenu.ts
 */

import { useCallback, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { DESKTOP_APP_CATEGORY_ORDER } from '../../constants';
import type { DesktopItem } from '../../types/desktop.types';
import type { DesktopExpansionDiscoveryState } from '../../types/desktopExpansion.types';
import type { StartMenuTab } from '../../types/desktopStartMenu';
import { isSystemDesktopApp } from '../../utils/desktopAppRegistry';

type Args = {
	apps: DesktopItem[];
	desktopItems: DesktopItem[];
	search: string;
	t: TFunction<'desktopUi'>;
	activeTab: StartMenuTab;
	recentIds: string[];
	expansionState?: DesktopExpansionDiscoveryState;
	startMenuActiveDesktopId?: string;
	desktopAppIds: string[];
	onPinAppToDesktop?: (app: DesktopItem) => void;
	onUnpinAppFromDesktop?: (app: DesktopItem) => void;
};

export function useStartMenuAppCatalog({
	apps,
	desktopItems,
	search,
	t,
	activeTab,
	recentIds,
	expansionState,
	startMenuActiveDesktopId,
	desktopAppIds,
	onPinAppToDesktop,
	onUnpinAppFromDesktop,
}: Args) {
	const appsList = useMemo(() => apps.filter((a) => a.type === 'app'), [apps]);
	const appsById = useMemo(
		() => new Map(appsList.map((app) => [app.id, app] as const)),
		[appsList]
	);
	const contentManagerApp = useMemo(
		() => appsList.find((a) => a.appComponent === 'ContentManagerPro'),
		[appsList]
	);
	const workspaceItemCatalog = useMemo(() => {
		const catalog = new Map<string, DesktopItem>();
		for (const a of apps) {
			catalog.set(a.id, a);
		}
		for (const d of desktopItems) {
			if (!catalog.has(d.id)) catalog.set(d.id, d);
		}
		return catalog;
	}, [apps, desktopItems]);
	const filteredApps = useMemo(() => {
		if (!search.trim()) return appsList;
		const q = search.toLowerCase().trim();
		return appsList.filter((a) => {
			if (a.name.toLowerCase().includes(q)) return true;
			if (a.description?.toLowerCase().includes(q)) return true;
			const catKey = a.category ?? 'productivity';
			const catLabel = t(`appCategories.${catKey}`, {
				defaultValue: catKey,
			});
			if (catLabel.toLowerCase().includes(q)) return true;
			return false;
		});
	}, [appsList, search, t]);

	const pinnedApps = useMemo(
		() => filteredApps.filter((a) => a.isPinned),
		[filteredApps]
	);
	const appsByCategory = useMemo(() => {
		const map = new Map<string, DesktopItem[]>();
		for (const app of filteredApps) {
			const cat = app.category ?? 'productivity';
			const list = map.get(cat) ?? [];
			list.push(app);
			map.set(cat, list);
		}
		return map;
	}, [filteredApps]);
	const sortedCategories = useMemo(() => {
		const seen = new Set(appsByCategory.keys());
		return DESKTOP_APP_CATEGORY_ORDER.filter((c) => seen.has(c)).concat(
			[...seen].filter((c) => !DESKTOP_APP_CATEGORY_ORDER.includes(c))
		);
	}, [appsByCategory]);

	const recentApps = useMemo(() => {
		const byId = new Map(appsList.map((a) => [a.id, a]));
		return recentIds
			.map((id) => byId.get(id))
			.filter((a): a is DesktopItem => a != null);
	}, [appsList, recentIds]);
	const recentAppsFiltered = useMemo(() => {
		if (!search.trim()) return recentApps;
		const filteredIds = new Set(filteredApps.map((a) => a.id));
		return recentApps.filter((a) => filteredIds.has(a.id));
	}, [recentApps, filteredApps, search]);

	const appsToShow =
		activeTab === 'recent'
			? recentAppsFiltered
			: activeTab === 'pinned'
				? pinnedApps
				: filteredApps;
	const hasWorkItems = Boolean(
		expansionState &&
			(expansionState.workspaceProfiles.length > 0 ||
				expansionState.appCollections.length > 0 ||
				expansionState.contentShortcuts.length > 0 ||
				expansionState.assistantContextActions.some((action) => action.enabled))
	);
	const desktopAppIdSet = useMemo(
		() => new Set(desktopAppIds),
		[desktopAppIds]
	);

	const canToggleDesktopPin = Boolean(onPinAppToDesktop);

	const toggleAppDesktopPin = useCallback(
		(app: DesktopItem, onDesktop: boolean) => {
			if (isSystemDesktopApp(app)) return;
			if (onDesktop) {
				onUnpinAppFromDesktop?.(app);
				return;
			}
			onPinAppToDesktop?.(app);
		},
		[onPinAppToDesktop, onUnpinAppFromDesktop]
	);

	const profilesForActiveSpace = useMemo(() => {
		if (!expansionState?.workspaceProfiles.length) return [];
		if (!startMenuActiveDesktopId) return expansionState.workspaceProfiles;
		return expansionState.workspaceProfiles.filter(
			(pr) => !pr.desktopId || pr.desktopId === startMenuActiveDesktopId
		);
	}, [expansionState?.workspaceProfiles, startMenuActiveDesktopId]);

	const recommendedApps = useMemo(() => {
		const ids = new Set<string>();
		for (const pr of profilesForActiveSpace) {
			for (const id of pr.appIds) ids.add(id);
		}
		const byId = new Map(appsList.map((a) => [a.id, a]));
		return [...ids]
			.map((id) => byId.get(id))
			.filter((a): a is DesktopItem => a != null);
	}, [appsList, profilesForActiveSpace]);

	const recommendedAppsFiltered = useMemo(() => {
		if (!search.trim()) return recommendedApps;
		const filteredIds = new Set(filteredApps.map((a) => a.id));
		return recommendedApps.filter((a) => filteredIds.has(a.id));
	}, [recommendedApps, filteredApps, search]);

	return {
		appsList,
		appsById,
		contentManagerApp,
		workspaceItemCatalog,
		filteredApps,
		pinnedApps,
		appsByCategory,
		sortedCategories,
		recentAppsFiltered,
		appsToShow,
		hasWorkItems,
		desktopAppIdSet,
		canToggleDesktopPin,
		toggleAppDesktopPin,
		recommendedAppsFiltered,
	};
}
