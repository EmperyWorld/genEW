/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Pure helpers for live workspace-profile labels in Start/Menu settings: target desktop, open windows, recent apps,
 * and launch MRU ids.
 *
 * Invariants:
 * - Open-window titles use display-title helpers so persona-aware app chrome is preserved in workspace previews.
 * - Helpers stay pure; persistence and window mutations are owned by desktop hooks.
 *
 * Related:
 * - src/pages/Desktop/components/StartMenu.tsx
 * - src/pages/Desktop/components/settings/expansion/desktopSettingsExpansionWorkspaceProfileRow.tsx
 * - src/pages/Desktop/utils/desktopWindowDisplayTitle.ts
 */
import { DEFAULT_APPS } from '../constants';
import type { DesktopWorkspaceProfile } from '../types/desktopExpansion.types';
import type { DesktopItem, WindowState } from '../types/desktop.types';
import { resolveDesktopWindowDisplayTitle } from './desktopWindowDisplayTitle';

/** Стол, для которого показывать «живое» состояние карточки сценария. */
export function resolveWorkspaceProfileTargetDesktopId(
	profile: DesktopWorkspaceProfile,
	activeDesktopId: string | undefined
): string | undefined {
	if (profile.desktopId?.trim()) {
		return profile.desktopId;
	}
	return activeDesktopId?.trim() ? activeDesktopId : undefined;
}

export function filterWindowsOnVirtualDesktop(
	allWindows: WindowState[],
	getWindowsOnDesktop:
		| ((desktopId: string) => string[] | undefined)
		| undefined,
	desktopId: string | undefined
): WindowState[] {
	if (!desktopId || !getWindowsOnDesktop) {
		return [];
	}
	const idSet = new Set(getWindowsOnDesktop(desktopId) ?? []);
	return allWindows.filter((w) => idSet.has(w.id));
}

export function summarizeOpenWindowsForDisplay(
	wins: WindowState[],
	maxTitles: number
): {
	visibleTitles: string[];
	visibleCount: number;
	minimizedCount: number;
	totalCount: number;
} {
	const visible = wins.filter((w) => !w.isMinimized);
	const minimizedCount = wins.length - visible.length;
	const visibleTitles = visible.slice(0, maxTitles).map((w) => {
		const title = resolveDesktopWindowDisplayTitle(w).trim();
		return title.length > 0 ? title : '…';
	});
	return {
		visibleTitles,
		visibleCount: visible.length,
		minimizedCount,
		totalCount: wins.length,
	};
}

/**
 * Недавние приложения: список для карточки сценария — MRU по целевому VD, иначе глобальный MRU.
 */
export function effectiveRecentIdsForWorkspaceProfile(
	globalRecent: readonly string[],
	recentByDesktop: Readonly<Record<string, readonly string[]>>,
	profile: DesktopWorkspaceProfile,
	activeDesktopId: string | undefined
): readonly string[] {
	const target = resolveWorkspaceProfileTargetDesktopId(
		profile,
		activeDesktopId
	);
	if (!target) {
		return globalRecent;
	}
	const scoped = recentByDesktop[target];
	if (scoped && scoped.length > 0) {
		return scoped;
	}
	return globalRecent;
}

/** Недавние приложения из глобального списка, пересечение с appIds профиля, порядок — как в recent. */
export function recentAppNamesForWorkspaceProfile(
	recentIds: readonly string[],
	profile: DesktopWorkspaceProfile,
	catalog: Map<string, DesktopItem>,
	max: number
): string[] {
	const appSet = new Set(profile.appIds);
	const out: string[] = [];
	for (const id of recentIds) {
		if (!appSet.has(id)) continue;
		const it = catalog.get(id);
		if (it?.name) out.push(it.name);
		if (out.length >= max) break;
	}
	return out;
}

/**
 * Desktop item ids that {@link openWorkspaceProfile} will open (apps + folders),
 * in launch order — mirrors `openAppsByIds` + folder loop for MRU on the scenario VD.
 */
export function collectWorkspaceProfileLaunchItemIdsForMru(
	profile: DesktopWorkspaceProfile,
	installedApps: readonly DesktopItem[],
	desktopItems: readonly DesktopItem[]
): string[] {
	const out: string[] = [];
	for (const appId of profile.appIds.slice(0, 8)) {
		const app =
			installedApps.find((item) => item.id === appId) ??
			DEFAULT_APPS.find((item) => item.id === appId);
		if (app) out.push(app.id);
	}
	for (const folderId of profile.folderItemIds.slice(0, 6)) {
		if (desktopItems.some((it) => it.id === folderId)) out.push(folderId);
	}
	return out;
}
