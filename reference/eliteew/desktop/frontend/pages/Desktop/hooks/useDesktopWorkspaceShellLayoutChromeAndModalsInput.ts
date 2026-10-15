/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * T31 chrome/modals layout bridge — assembles the flat chrome slice input from
 * eight typed prop groups so DesktopWorkspaceContent avoids ~100 inline bridge keys.
 *
 * Invariants:
 * - Output satisfies DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSliceInput.
 * - No field remapping; groups are a partition of the flat contract.
 *
 * Related:
 * - types/desktopWorkspaceShellLayoutChromeBridge.types.ts
 * - hooks/useDesktopWorkspaceShellLayoutInputBridge.ts
 * - documentation/product/desktop/DESKTOP-WORKSPACE-CONTENT-REFACTOR-PLAN.md
 */

import type { DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSliceInput } from './useDesktopWorkspaceShellModalsLayoutChromeAndModalsRestSlice';
import type { DesktopWorkspaceShellLayoutChromeAndModalsBridgeInput } from '../types/desktopWorkspaceShellLayoutChromeBridge.types';

export type { DesktopWorkspaceShellLayoutChromeAndModalsBridgeInput } from '../types/desktopWorkspaceShellLayoutChromeBridge.types';

export function useDesktopWorkspaceShellLayoutChromeAndModalsInput(
	groups: DesktopWorkspaceShellLayoutChromeAndModalsBridgeInput
): DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSliceInput {
	const {
		taskbarViewport,
		expansionAndLaunch,
		windowsAndSession,
		overlayState,
		appStore,
		searchAndRecents,
		clipboardAndFolderActions,
		shellSettingsAndWallpaper,
	} = groups;

	return {
		...taskbarViewport,
		...expansionAndLaunch,
		...windowsAndSession,
		...overlayState,
		...appStore,
		...searchAndRecents,
		...clipboardAndFolderActions,
		...shellSettingsAndWallpaper,
	};
}
