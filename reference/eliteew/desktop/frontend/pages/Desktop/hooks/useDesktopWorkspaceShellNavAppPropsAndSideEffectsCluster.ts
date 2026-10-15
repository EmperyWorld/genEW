/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Sequential cluster: launch host effects, navigation bridge, Content Manager opener, app props value,
 * post-nav effects and keyboard/open-app input surfaces — one call site in DesktopWorkspaceContent.
 *
 * Invariants:
 * - Hook order preserved; post-nav receives openUgsDesktopApp from navigation bridge.
 *
 * Related:
 * - DesktopWorkspaceContent.tsx · types/desktopWorkspaceShellNavAppPropsCluster.types.ts
 */

import type { DesktopAppPropsContextValue } from '../context/DesktopAppPropsContext';
import type { DesktopWorkspaceShellNavAppPropsClusterInput } from '../types/desktopWorkspaceShellNavAppPropsCluster.types';
import { useDesktopWorkspaceAppPropsValue } from './useDesktopWorkspaceAppPropsValue';
import { useDesktopWorkspaceOpenAppAndInputSurfacesCluster } from './useDesktopWorkspaceOpenAppAndInputSurfacesCluster';
import { useDesktopWorkspaceOpenContentManager } from './useDesktopWorkspaceOpenContentManager';
import { useDesktopWorkspaceShellLaunchHostEffectsCluster } from './useDesktopWorkspaceShellLaunchHostEffectsCluster';
import { useDesktopWorkspaceShellNavigationBridge } from './useDesktopWorkspaceShellNavigationBridge';
import { useDesktopWorkspaceShellPostNavEffectsFlatCluster } from './useDesktopWorkspaceShellPostNavEffectsFlatCluster';

export type DesktopWorkspaceShellNavAppPropsClusterResult = {
	appPropsValue: DesktopAppPropsContextValue;
	openVoiceCommandCenter: () => void;
};

export function useDesktopWorkspaceShellNavAppPropsAndSideEffectsCluster(
	input: DesktopWorkspaceShellNavAppPropsClusterInput
): DesktopWorkspaceShellNavAppPropsClusterResult {
	const { launchHost, navigation, appProps, postNav, openAppInput } = input;

	useDesktopWorkspaceShellLaunchHostEffectsCluster(launchHost);

	const { openUgsDesktopApp, onNavigate, openVoiceCommandCenter } =
		useDesktopWorkspaceShellNavigationBridge(navigation);

	const { openContentManager } = useDesktopWorkspaceOpenContentManager({
		itemsRef: navigation.itemsRef,
		handleOpenWindow: navigation.handleOpenWindow,
	});

	const appPropsValue = useDesktopWorkspaceAppPropsValue({
		...appProps,
		onNavigate,
		openContentManager,
	});

	useDesktopWorkspaceShellPostNavEffectsFlatCluster({
		...postNav,
		openUgsDesktopApp,
	});

	useDesktopWorkspaceOpenAppAndInputSurfacesCluster(openAppInput);

	return { appPropsValue, openVoiceCommandCenter };
}
