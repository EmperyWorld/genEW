import { useCallback, useEffect } from 'react';
import { DEFAULT_APPS, DESKTOP_GRID, DESKTOP_GRID_STEPS } from '../constants';
import type { DesktopItem, WindowState } from '../types/desktop.types';
import { findNearestFreePosition } from '../utils/desktopGrid';
import { readDesktopWorkArea } from '../utils/desktopSnapGeometry';
import { isSystemDesktopApp } from '../utils/desktopAppRegistry';

export type PinAppToDesktopResult =
	| 'ok'
	| 'already'
	| 'not_installed'
	| 'system';

interface InstalledDesktopApp {
	id: string;
	name: string;
	description?: string | null;
	appComponent?: string | null;
	category?: string | null;
	color?: string | null;
	gradient?: string | null;
}

interface StoreAppRecord {
	app_id: string;
	name?: string | null;
	description?: string | null;
	app_component?: string | null;
	category?: string | null;
	color?: string | null;
	gradient?: string | null;
}

interface UseDesktopAppLifecycleParams {
	items: DesktopItem[];
	installedApps: InstalledDesktopApp[];
	storeApps?: StoreAppRecord[];
	installedAppIds: ReadonlySet<string>;
	gridStep?: 'small' | 'medium' | 'large';
	windows: WindowState[];
	installApp: (appId: string) => Promise<unknown>;
	uninstallApp: (appId: string) => Promise<unknown>;
	commitItems: (next: DesktopItem[]) => void;
	closeWindow: (windowId: string) => void;
}

const buildInstalledAppItem = (
	appId: string,
	collisionItems: DesktopItem[],
	gridStep: 'small' | 'medium' | 'large',
	appFromStore?: StoreAppRecord,
	installedApp?: InstalledDesktopApp
): DesktopItem => {
	const defaultApp = DEFAULT_APPS.find((app) => app.id === appId);
	const basePosition = defaultApp?.position ?? {
		x: DESKTOP_GRID.OFFSET,
		y: DESKTOP_GRID.OFFSET,
	};
	const layoutMax =
		typeof document !== 'undefined'
			? (() => {
					const wa = readDesktopWorkArea();
					return {
						maxX: Math.max(
							DESKTOP_GRID.OFFSET,
							wa.width - DESKTOP_GRID.ICON_WIDTH
						),
						maxY: Math.max(
							DESKTOP_GRID.OFFSET,
							wa.height - DESKTOP_GRID.ICON_HEIGHT
						),
					};
				})()
			: undefined;
	const position = findNearestFreePosition(
		collisionItems,
		appId,
		basePosition.x,
		basePosition.y,
		DESKTOP_GRID_STEPS[gridStep],
		DESKTOP_GRID.OFFSET,
		layoutMax
	);

	return {
		id: appId,
		name: installedApp?.name ?? appFromStore?.name ?? defaultApp?.name ?? appId,
		type: 'app',
		description:
			installedApp?.description ??
			appFromStore?.description ??
			defaultApp?.description,
		appComponent:
			installedApp?.appComponent ??
			appFromStore?.app_component ??
			defaultApp?.appComponent,
		category:
			installedApp?.category ?? appFromStore?.category ?? defaultApp?.category,
		color: installedApp?.color ?? appFromStore?.color ?? defaultApp?.color,
		gradient:
			installedApp?.gradient ?? appFromStore?.gradient ?? defaultApp?.gradient,
		position,
		isPinned: defaultApp?.isPinned ?? false,
		icon: defaultApp?.icon,
	};
};

export function useDesktopAppLifecycle({
	items,
	installedApps,
	storeApps,
	installedAppIds,
	gridStep = 'medium',
	windows,
	installApp,
	uninstallApp,
	commitItems,
	closeWindow,
}: UseDesktopAppLifecycleParams) {
	const handleInstallApp = useCallback(
		async (appId: string) => {
			await installApp(appId);

			if (items.some((item) => item.id === appId)) {
				return;
			}

			const appFromStore = storeApps?.find((app) => app.app_id === appId);
			const installedApp = installedApps.find((a) => a.id === appId);
			const collisionItems = items.filter(
				(item) =>
					!item.parentId &&
					(item.type !== 'app' || installedAppIds.has(item.id))
			);
			const newItem = buildInstalledAppItem(
				appId,
				collisionItems,
				gridStep,
				appFromStore,
				installedApp
			);
			const nextItems = [...items, newItem];
			commitItems(nextItems);
		},
		[
			commitItems,
			gridStep,
			installApp,
			installedAppIds,
			installedApps,
			items,
			storeApps,
		]
	);

	const pinAppShortcutToDesktop = useCallback(
		(app: DesktopItem): PinAppToDesktopResult => {
			if (app.type !== 'app') {
				return 'system';
			}
			if (isSystemDesktopApp(app)) {
				return 'system';
			}
			if (!installedAppIds.has(app.id)) {
				return 'not_installed';
			}
			if (
				items.some((i) => i.type === 'app' && i.id === app.id && !i.parentId)
			) {
				return 'already';
			}
			const installedApp = installedApps.find((a) => a.id === app.id);
			const appFromStore = storeApps?.find((a) => a.app_id === app.id);
			const collisionItems = items.filter(
				(item) =>
					!item.parentId &&
					(item.type !== 'app' || installedAppIds.has(item.id))
			);
			const newItem = buildInstalledAppItem(
				app.id,
				collisionItems,
				gridStep,
				appFromStore,
				installedApp
			);
			commitItems([...items, newItem]);
			return 'ok';
		},
		[commitItems, gridStep, installedAppIds, installedApps, items, storeApps]
	);

	const handleUninstallApp = useCallback(
		async (appId: string) => {
			await uninstallApp(appId);

			const appFromStore = storeApps?.find((app) => app.app_id === appId);
			const defaultApp = DEFAULT_APPS.find((app) => app.id === appId);
			const appComponent =
				appFromStore?.app_component ?? defaultApp?.appComponent;
			if (appComponent) {
				windows
					.filter(
						(windowState) =>
							windowState.appComponent === appComponent ||
							windowState.folderId === appId
					)
					.forEach((windowState) => {
						closeWindow(windowState.id);
					});
			}

			if (!items.some((item) => item.id === appId)) {
				return;
			}

			const nextItems = items.filter((item) => item.id !== appId);
			commitItems(nextItems);
		},
		[closeWindow, commitItems, items, storeApps, uninstallApp, windows]
	);

	useEffect(() => {
		const handleExternalInstall = (event: Event): void => {
			const detail = (event as CustomEvent<{ appId: string }>).detail;
			if (detail?.appId) {
				void handleInstallApp(detail.appId);
			}
		};

		const handleExternalUninstall = (event: Event): void => {
			const detail = (event as CustomEvent<{ appId: string }>).detail;
			if (detail?.appId) {
				void handleUninstallApp(detail.appId);
			}
		};

		window.addEventListener(
			'desktop-app-installed',
			handleExternalInstall as EventListener
		);
		window.addEventListener(
			'desktop-app-uninstalled',
			handleExternalUninstall as EventListener
		);
		return () => {
			window.removeEventListener(
				'desktop-app-installed',
				handleExternalInstall as EventListener
			);
			window.removeEventListener(
				'desktop-app-uninstalled',
				handleExternalUninstall as EventListener
			);
		};
	}, [handleInstallApp, handleUninstallApp]);

	return {
		handleInstallApp,
		handleUninstallApp,
		pinAppShortcutToDesktop,
	};
}
