import { useMemo } from 'react';
import type { DesktopItem } from '../types/desktop.types';

/**
 * Stable Set of installed app ids for workspace shell wiring (launch, search, etc.).
 */
export function useDesktopWorkspaceInstalledAppIds(
	installedApps: DesktopItem[]
): ReadonlySet<string> {
	return useMemo(
		() => new Set(installedApps.map((a) => a.id)),
		[installedApps]
	);
}
