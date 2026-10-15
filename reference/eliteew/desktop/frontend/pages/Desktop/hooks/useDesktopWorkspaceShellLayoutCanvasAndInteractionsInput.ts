/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * T29+ canvas/interactions layout bridge — assembles the flat canvas slice from
 * six typed prop groups so DesktopWorkspaceContent avoids ~100 inline bridge keys.
 *
 * Invariants:
 * - Output satisfies DesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice.
 * - No field remapping; groups are a partition of the flat contract.
 *
 * Related:
 * - types/desktopWorkspaceShellLayoutCanvasBridge.types.ts
 * - hooks/useDesktopWorkspaceShellLayoutInputBridge.ts
 * - documentation/product/desktop/DESKTOP-WORKSPACE-CONTENT-REFACTOR-PLAN.md
 */

import type { DesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice } from './useDesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice';
import type { DesktopWorkspaceShellLayoutCanvasAndInteractionsBridgeInput } from '../types/desktopWorkspaceShellLayoutCanvasBridge.types';

export type { DesktopWorkspaceShellLayoutCanvasAndInteractionsBridgeInput } from '../types/desktopWorkspaceShellLayoutCanvasBridge.types';

export function useDesktopWorkspaceShellLayoutCanvasAndInteractionsInput(
	groups: DesktopWorkspaceShellLayoutCanvasAndInteractionsBridgeInput
): DesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice {
	const {
		shellSurface,
		syncPersistence,
		iconInteractions,
		windowSlot,
		widgetsAndDrop,
		assistant,
	} = groups;

	return {
		...shellSurface,
		...syncPersistence,
		...iconInteractions,
		...windowSlot,
		...widgetsAndDrop,
		...assistant,
	};
}
