/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Resolve Desktop app metadata and visibility rules across default apps, installed apps, and legacy hidden apps.
 *
 * Invariants:
 * - App components that can be opened from the catalog must be listed as known components.
 * - Legacy hidden ids remain hidden even if stale rows still exist in persistence.
 *
 * Related:
 * - src/pages/Desktop/constants/index.ts
 * - src/pages/Desktop/components/desktopWindowAppContent.tsx
 */

import { DEFAULT_APPS } from '../constants';
import type { DesktopItem } from '../types/desktop.types';

type InstalledAppLike = Pick<
	DesktopItem,
	'id' | 'appComponent' | 'allowMultipleWindows' | 'maxWindowInstances'
>;

const defaultAppItems = DEFAULT_APPS.filter((item) => item.type === 'app');
const defaultAppsById = new Map(defaultAppItems.map((item) => [item.id, item]));
const defaultAppsByComponent = new Map(
	defaultAppItems
		.filter(
			(item) =>
				typeof item.appComponent === 'string' &&
				item.appComponent.trim().length > 0
		)
		.map((item) => [item.appComponent as string, item])
);
/** Старые ярлыки до объединения в Студию ГУ — скрывать из каталога/выдачи, если ещё встречаются в БД. */
const LEGACY_HIDDEN_DESKTOP_APP_IDS = new Set([
	'app-voice',
	'app-voicecmd',
	'app-transcription',
	// Merged into Social hub (app-social-hub / SocialHubApp).
	'app-friends',
	'app-user-profile',
	// Removed stubs (no canonical replacement).
	'app-analytics',
]);
const LEGACY_HIDDEN_DESKTOP_APP_COMPONENTS = new Set([
	'VoiceCommand',
	'VoiceStudio',
	'AudioTranscriptionPro',
	'FriendsApp',
	'UserProfile',
	'Analytics',
	'SystemMonitorWidget',
]);

/** Removed chat apps → GAF Chat (persisted desktop items / shell windows). */
export const LEGACY_DESKTOP_APP_COMPONENT_ALIASES: Readonly<
	Record<string, string>
> = {
	EliteChat: 'GAFChatApp',
	ArlyQueenChat: 'GAFChatApp',
};

const LEGACY_DESKTOP_APP_ID_ALIASES: Readonly<Record<string, string>> = {
	'app-chat': 'app-gaf-chat',
};

export function remapLegacyDesktopAppComponent(
	appComponent: string | null | undefined
): string | null | undefined {
	if (appComponent == null || appComponent === '') {
		return appComponent;
	}
	return LEGACY_DESKTOP_APP_COMPONENT_ALIASES[appComponent] ?? appComponent;
}

export function shouldMigrateLegacyDesktopChatApp(item: DesktopItem): boolean {
	if (item.type !== 'app') {
		return false;
	}
	return (
		item.id in LEGACY_DESKTOP_APP_ID_ALIASES ||
		(typeof item.appComponent === 'string' &&
			item.appComponent in LEGACY_DESKTOP_APP_COMPONENT_ALIASES)
	);
}

export function migrateLegacyDesktopChatAppItem(
	item: DesktopItem,
	gafDefault: DesktopItem
): DesktopItem {
	return {
		...gafDefault,
		...item,
		id: 'app-gaf-chat',
		appComponent: 'GAFChatApp',
		name: gafDefault.name,
		icon: gafDefault.icon,
		description: gafDefault.description ?? item.description,
	};
}

const EPHEMERAL_DESKTOP_WINDOW_COMPONENTS = new Set(['DesktopShellSettings']);

export function isEphemeralDesktopWindowComponent(
	appComponent: string | null | undefined
): boolean {
	return (
		typeof appComponent === 'string' &&
		EPHEMERAL_DESKTOP_WINDOW_COMPONENTS.has(appComponent)
	);
}

export const KNOWN_DESKTOP_APP_COMPONENTS = new Set(
	Array.from(defaultAppsByComponent.keys()).concat([
		'Presentations',
		'PresentationsArchive',
		'DocEditorV2',
		'UnifiedAdminApp',
		'DesktopAppMaintenance',
		'DesktopShellSettings',
		'EWDeskApp',
		'DesktopWidgetShelfApp',
		'DesktopDashboardFavoritesApp',
		'FeedbackHubApp',
		'SurveyHubApp',
		'AssistantApp',
		'ProjectAboutApp',
		'EmperyNexusChronicleApp',
		'ProfessionalWorlds',
		'VideoCallApp',
		'CustomerCabinet',
	])
);

export function getDefaultDesktopAppById(
	appId: string
): DesktopItem | undefined {
	return defaultAppsById.get(appId);
}

export function getDefaultDesktopAppByComponent(
	appComponent: string
): DesktopItem | undefined {
	return defaultAppsByComponent.get(appComponent);
}

export function isLegacyHiddenDesktopAppId(appId: string): boolean {
	return LEGACY_HIDDEN_DESKTOP_APP_IDS.has(appId);
}

export function isLegacyHiddenDesktopAppComponent(
	appComponent: string | null | undefined
): boolean {
	return (
		typeof appComponent === 'string' &&
		LEGACY_HIDDEN_DESKTOP_APP_COMPONENTS.has(appComponent)
	);
}

export function isLegacyHiddenDesktopApp(item: DesktopItem): boolean {
	return (
		item.type === 'app' &&
		(isLegacyHiddenDesktopAppId(item.id) ||
			isLegacyHiddenDesktopAppComponent(item.appComponent))
	);
}

export function isSystemDesktopApp(item: DesktopItem): boolean {
	const defaultApp = getDefaultDesktopAppById(item.id);
	return (
		item.id === 'app-store' || Boolean(item.isSystem || defaultApp?.isSystem)
	);
}

export function resolveDesktopAppItem(
	item: DesktopItem,
	installedApps: InstalledAppLike[] = []
): DesktopItem {
	if (item.type !== 'app') {
		return item;
	}

	const defaultApp = getDefaultDesktopAppById(item.id);
	const installedApp = installedApps.find((app) => app.id === item.id);
	const appComponent =
		item.appComponent ?? installedApp?.appComponent ?? defaultApp?.appComponent;

	if (!defaultApp && appComponent === item.appComponent) {
		return item;
	}

	return {
		...defaultApp,
		...item,
		appComponent,
		allowMultipleWindows:
			item.allowMultipleWindows ??
			installedApp?.allowMultipleWindows ??
			defaultApp?.allowMultipleWindows,
		maxWindowInstances:
			item.maxWindowInstances ??
			installedApp?.maxWindowInstances ??
			defaultApp?.maxWindowInstances,
		icon: item.icon ?? defaultApp?.icon,
		description: item.description ?? defaultApp?.description,
		category: item.category ?? defaultApp?.category,
		color: item.color ?? defaultApp?.color,
		gradient: item.gradient ?? defaultApp?.gradient,
	};
}

export function getDesktopAppItemIdForAccess(item: DesktopItem): string | null {
	if (item.type !== 'app') {
		return null;
	}
	return getDefaultDesktopAppById(item.id)?.id ?? item.id;
}

export function canDisplayDesktopItem(
	item: DesktopItem,
	installedAppIds: ReadonlySet<string>
): boolean {
	if (item.type !== 'app') {
		return true;
	}
	if (isLegacyHiddenDesktopApp(item)) {
		return false;
	}
	if (isSystemDesktopApp(item)) {
		return true;
	}
	const appId = getDesktopAppItemIdForAccess(item);
	return appId != null && installedAppIds.has(appId);
}

export function filterVisibleDesktopItems(
	items: DesktopItem[],
	installedAppIds: ReadonlySet<string>
): DesktopItem[] {
	return items.filter(
		(item) => !item.parentId && canDisplayDesktopItem(item, installedAppIds)
	);
}

export function findDesktopAppItemByComponent(
	items: DesktopItem[],
	appComponent: string
): DesktopItem | undefined {
	return (
		items.find(
			(item) => item.type === 'app' && item.appComponent === appComponent
		) ?? getDefaultDesktopAppByComponent(appComponent)
	);
}

export function isKnownDesktopAppComponent(
	appComponent: string | null | undefined
): boolean {
	if (!appComponent) {
		return false;
	}
	return KNOWN_DESKTOP_APP_COMPONENTS.has(appComponent);
}
