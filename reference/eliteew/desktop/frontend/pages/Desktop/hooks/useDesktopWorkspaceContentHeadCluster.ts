/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Wave A1.1 head hook cluster composer: early (WM) + late (presets/sync) for DesktopWorkspaceContent.
 *
 * Invariants:
 * - Pass-through only — no field remapping vs prior Content inline hooks.
 *
 * Related:
 * - DesktopWorkspaceContent.tsx
 * - hooks/useDesktopWorkspaceContentTailCluster.ts
 * - hooks/useDesktopWorkspaceContentHeadEarlyCluster.ts
 * - hooks/useDesktopWorkspaceContentHeadLateCluster.ts
 */

import {
	useDesktopWorkspaceContentHeadEarlyCluster,
	type UseDesktopWorkspaceContentHeadClusterParams,
} from './useDesktopWorkspaceContentHeadEarlyCluster';
import { useDesktopWorkspaceContentHeadLateCluster } from './useDesktopWorkspaceContentHeadLateCluster';

export type { UseDesktopWorkspaceContentHeadClusterParams };

export function useDesktopWorkspaceContentHeadCluster(
	params: UseDesktopWorkspaceContentHeadClusterParams
) {
	const early = useDesktopWorkspaceContentHeadEarlyCluster(params);
	return useDesktopWorkspaceContentHeadLateCluster(early);
}

export type DesktopWorkspaceContentHeadClusterResult = ReturnType<
	typeof useDesktopWorkspaceContentHeadCluster
>;
