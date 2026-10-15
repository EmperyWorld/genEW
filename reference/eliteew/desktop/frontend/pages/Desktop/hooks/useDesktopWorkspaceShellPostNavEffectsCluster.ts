/**
 * Подряд эффекты после navigation bridge: legacy open → UGS deep link → lifecycle.
 * Порядок важен: {@link useLegacyPendingDesktopOpenEffect} должен идти до UGS.
 */

import { useDesktopUgsDeepLinkEffects } from './useDesktopUgsDeepLinkEffects';
import { useLegacyPendingDesktopOpenEffect } from './useLegacyPendingDesktopOpenEffect';
import { useDesktopWorkspaceLifecycleEffects } from './useDesktopWorkspaceLifecycleEffects';

type LegacyPendingParams = Parameters<
	typeof useLegacyPendingDesktopOpenEffect
>[0];
type UgsDeepLinkParams = Parameters<typeof useDesktopUgsDeepLinkEffects>[0];
type LifecycleParams = Parameters<
	typeof useDesktopWorkspaceLifecycleEffects
>[0];

export function useDesktopWorkspaceShellPostNavEffectsCluster(params: {
	legacyPendingOpen: LegacyPendingParams;
	ugsDeepLink: UgsDeepLinkParams;
	lifecycle: LifecycleParams;
}): void {
	useLegacyPendingDesktopOpenEffect(params.legacyPendingOpen);
	useDesktopUgsDeepLinkEffects(params.ugsDeepLink);
	useDesktopWorkspaceLifecycleEffects(params.lifecycle);
}
