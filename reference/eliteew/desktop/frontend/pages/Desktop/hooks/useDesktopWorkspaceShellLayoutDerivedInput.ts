/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * T32 derived layout bridge — assembles the flat derived slice input from three
 * typed prop groups so DesktopWorkspaceContent avoids inline derived keys in the bridge.
 *
 * Invariants:
 * - Output satisfies useDesktopWorkspaceShellModalsLayoutDerivedHandlers params.
 * - No field remapping; groups are a partition of the flat contract.
 *
 * Related:
 * - types/desktopWorkspaceShellLayoutDerivedBridge.types.ts
 * - hooks/useDesktopWorkspaceShellLayoutInputBridge.ts
 * - documentation/product/desktop/DESKTOP-WORKSPACE-CONTENT-REFACTOR-PLAN.md
 */

import type { useDesktopWorkspaceShellModalsLayoutDerivedHandlers } from './useDesktopWorkspaceShellModalsLayoutDerivedHandlers';
import type { DesktopWorkspaceShellLayoutDerivedBridgeInput } from '../types/desktopWorkspaceShellLayoutDerivedBridge.types';

export type { DesktopWorkspaceShellLayoutDerivedBridgeInput } from '../types/desktopWorkspaceShellLayoutDerivedBridge.types';

export type DesktopWorkspaceShellLayoutDerivedInput = Parameters<
	typeof useDesktopWorkspaceShellModalsLayoutDerivedHandlers
>[0];

export function useDesktopWorkspaceShellLayoutDerivedInput(
	groups: DesktopWorkspaceShellLayoutDerivedBridgeInput
): DesktopWorkspaceShellLayoutDerivedInput {
	const {
		contextMenuAndOverlays,
		shellSettingsAndAdmin,
		virtualDesktopsState,
	} = groups;

	return {
		...contextMenuAndOverlays,
		...shellSettingsAndAdmin,
		...virtualDesktopsState,
	};
}
