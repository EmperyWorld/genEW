/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared taskbar strip helpers: dense mode threshold, window title, source app resolution.
 *
 * Related:
 * - `TaskbarPinnedAndWindowsStrip.tsx`
 */

import type { DesktopItem, WindowState } from '../../types/desktop.types';
import { findDesktopAppItemByComponent } from '../../utils/desktopAppRegistry';
import {
	resolveDesktopWindowDisplayTitle,
	withEwaDesktopItemDisplayName,
} from '../../utils/desktopWindowDisplayTitle';

export const TASKBAR_DENSE_WINDOW_COUNT = 10;

export function shouldUseDenseTaskbarWindowMode(windowCount: number): boolean {
	return windowCount >= TASKBAR_DENSE_WINDOW_COUNT;
}

export function isFriendsAppBadge(appComponent?: string | null): boolean {
	return appComponent === 'FriendsApp' || appComponent === 'SocialHubApp';
}

export function isGafChatAppBadge(appComponent?: string | null): boolean {
	return appComponent === 'GAFChatApp';
}

export function getTaskbarWindowTitle(win: WindowState): string {
	return resolveDesktopWindowDisplayTitle(win);
}

export function resolveWindowSourceApp(
	apps: DesktopItem[],
	desktopWindow: WindowState
): DesktopItem | undefined {
	const hit =
		apps.find((app) => app.id === desktopWindow.folderId) ??
		(desktopWindow.appComponent
			? findDesktopAppItemByComponent(apps, desktopWindow.appComponent)
			: undefined);
	return hit ? withEwaDesktopItemDisplayName(hit, [desktopWindow]) : undefined;
}
