/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * T29+ shell layout input bridge. Single entrypoint from DesktopWorkspaceContent:
 * flattens three grouped slice inputs, then delegates to the modals/layout cluster facade.
 *
 * Invariants:
 * - Bridge output remains the direct contract for useDesktopWorkspaceShellModalsAndLayoutSlotsCluster.
 * - Group flattening is pass-through only; no field remapping.
 *
 * Related:
 * - hooks/useDesktopWorkspaceShellModalsLayoutClusterInput.ts
 * - hooks/useDesktopWorkspaceShellModalsAndLayoutSlotsCluster.ts
 * - documentation/product/desktop/DESKTOP-WORKSPACE-CONTENT-REFACTOR-PLAN.md
 */

import type { DesktopWorkspaceShellLayoutCanvasAndInteractionsBridgeInput } from '../types/desktopWorkspaceShellLayoutCanvasBridge.types';
import type { DesktopWorkspaceShellLayoutChromeAndModalsBridgeInput } from '../types/desktopWorkspaceShellLayoutChromeBridge.types';
import type { DesktopWorkspaceShellLayoutDerivedBridgeInput } from '../types/desktopWorkspaceShellLayoutDerivedBridge.types';
import type { DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams } from './useDesktopWorkspaceShellModalsAndLayoutSlotsCluster';
import { useDesktopWorkspaceShellLayoutCanvasAndInteractionsInput } from './useDesktopWorkspaceShellLayoutCanvasAndInteractionsInput';
import { useDesktopWorkspaceShellLayoutChromeAndModalsInput } from './useDesktopWorkspaceShellLayoutChromeAndModalsInput';
import { useDesktopWorkspaceShellLayoutDerivedInput } from './useDesktopWorkspaceShellLayoutDerivedInput';
import { useDesktopWorkspaceShellModalsLayoutClusterInput } from './useDesktopWorkspaceShellModalsLayoutClusterInput';

export type DesktopWorkspaceShellLayoutInputBridgeInput = {
	derived: DesktopWorkspaceShellLayoutDerivedBridgeInput;
	chromeAndModalsRest: DesktopWorkspaceShellLayoutChromeAndModalsBridgeInput;
	canvasAndInteractions: DesktopWorkspaceShellLayoutCanvasAndInteractionsBridgeInput;
};

export function useDesktopWorkspaceShellLayoutInputBridge(
	input: DesktopWorkspaceShellLayoutInputBridgeInput
): DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams {
	const canvasAndInteractions =
		useDesktopWorkspaceShellLayoutCanvasAndInteractionsInput(
			input.canvasAndInteractions
		);
	const chromeAndModalsRest =
		useDesktopWorkspaceShellLayoutChromeAndModalsInput(
			input.chromeAndModalsRest
		);
	const derived = useDesktopWorkspaceShellLayoutDerivedInput(input.derived);
	return useDesktopWorkspaceShellModalsLayoutClusterInput({
		derived,
		chromeAndModalsRest,
		canvasAndInteractions,
	});
}
