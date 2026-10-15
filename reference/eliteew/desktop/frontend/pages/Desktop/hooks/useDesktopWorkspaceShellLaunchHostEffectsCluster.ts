/**
 * T20a: плоские пропсы для {@link useDesktopWorkspaceShellLaunchHostEffects}.
 */

import { useDesktopWorkspaceShellLaunchHostEffects } from './useDesktopWorkspaceShellLaunchHostEffects';

type HostParams = Parameters<
	typeof useDesktopWorkspaceShellLaunchHostEffects
>[0];

export type DesktopWorkspaceShellLaunchHostEffectsClusterParams =
	HostParams['globalWindow'] & HostParams['urlLaunch'];

export function useDesktopWorkspaceShellLaunchHostEffectsCluster(
	p: DesktopWorkspaceShellLaunchHostEffectsClusterParams
): void {
	useDesktopWorkspaceShellLaunchHostEffects({
		globalWindow: {
			setWindowContextMenu: p.setWindowContextMenu,
			minimizeAllWindows: p.minimizeAllWindows,
			closeActiveDesktopWindow: p.closeActiveDesktopWindow,
			openShellSettings: p.openShellSettings,
		},
		urlLaunch: {
			items: p.items,
			windows: p.windows,
			installedApps: p.installedApps,
			installedAppsLoading: p.installedAppsLoading,
			storeApps: p.storeApps,
			installedAppIds: p.installedAppIds,
			handleOpenWindow: p.handleOpenWindow,
		},
	});
}
