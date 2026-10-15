/**
 * T25: срез плоских пропсов для {@link useDesktopWorkspaceShellModalsAndLayoutSlotsCluster} —
 * canvas, window slot, взаимодействия с иконками рабочего стола (всё до `...shellModalsLayoutChromeAndModalsRestSlice`).
 */

import type { DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSlice } from './useDesktopWorkspaceShellModalsLayoutChromeAndModalsRestSlice';
import type { DesktopWorkspaceShellModalsLayoutDerivedHandlers } from './useDesktopWorkspaceShellModalsLayoutDerivedHandlers';
import type { DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams } from './useDesktopWorkspaceShellModalsAndLayoutSlotsCluster';

type P = DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams;

export type DesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice = Pick<
	P,
	Exclude<
		keyof P,
		| keyof DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSlice
		| keyof DesktopWorkspaceShellModalsLayoutDerivedHandlers
	>
>;

export function useDesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice(
	input: DesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice
): DesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice {
	return input;
}
