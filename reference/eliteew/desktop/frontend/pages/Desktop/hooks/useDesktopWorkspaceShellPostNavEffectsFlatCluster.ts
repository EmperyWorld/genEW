/**
 * T20b: плоские пропсы для {@link useDesktopWorkspaceShellPostNavEffectsCluster}.
 */

import { useDesktopWorkspaceShellPostNavEffectsCluster } from './useDesktopWorkspaceShellPostNavEffectsCluster';

type NavParams = Parameters<
	typeof useDesktopWorkspaceShellPostNavEffectsCluster
>[0];

export type DesktopWorkspaceShellPostNavEffectsFlatClusterParams =
	NavParams['legacyPendingOpen'] &
		NavParams['ugsDeepLink'] &
		NavParams['lifecycle'];

export function useDesktopWorkspaceShellPostNavEffectsFlatCluster(
	p: DesktopWorkspaceShellPostNavEffectsFlatClusterParams
): void {
	useDesktopWorkspaceShellPostNavEffectsCluster({
		legacyPendingOpen: {
			items: p.items,
			installedApps: p.installedApps,
			installedAppIds: p.installedAppIds,
			handleOpenWindow: p.handleOpenWindow,
		},
		ugsDeepLink: {
			openUgsDesktopApp: p.openUgsDesktopApp,
			currentPage: p.currentPage,
			setCurrentPage: p.setCurrentPage,
		},
		lifecycle: {
			isSyncing: p.isSyncing,
			storageError: p.storageError,
			notifyDesktop: p.notifyDesktop,
			windows: p.windows,
			closeWindow: p.closeWindow,
		},
	});
}
