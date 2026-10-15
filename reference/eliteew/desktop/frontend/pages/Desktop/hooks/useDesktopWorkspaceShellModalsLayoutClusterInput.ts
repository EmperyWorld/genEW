/**
 * T26: фасад над тремя срезами для {@link useDesktopWorkspaceShellModalsAndLayoutSlotsCluster} —
 * один вызов из {@link DesktopWorkspaceContent} вместо трёх отдельных хуков + спреда.
 * Порядок внутренних хуков: derived → chrome/rest → canvas (как в контенте до T26).
 */

import type { DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams } from './useDesktopWorkspaceShellModalsAndLayoutSlotsCluster';
import { useDesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice } from './useDesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice';
import type { DesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice } from './useDesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice';
import { useDesktopWorkspaceShellModalsLayoutChromeAndModalsRestSlice } from './useDesktopWorkspaceShellModalsLayoutChromeAndModalsRestSlice';
import type { DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSliceInput } from './useDesktopWorkspaceShellModalsLayoutChromeAndModalsRestSlice';
import { useDesktopWorkspaceShellModalsLayoutDerivedHandlers } from './useDesktopWorkspaceShellModalsLayoutDerivedHandlers';

export type DesktopWorkspaceShellModalsLayoutClusterFacadeInput = {
	derived: Parameters<
		typeof useDesktopWorkspaceShellModalsLayoutDerivedHandlers
	>[0];
	chromeAndModalsRest: DesktopWorkspaceShellModalsLayoutChromeAndModalsRestSliceInput;
	canvasAndInteractions: DesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice;
};

export function useDesktopWorkspaceShellModalsLayoutClusterInput(
	input: DesktopWorkspaceShellModalsLayoutClusterFacadeInput
) {
	const shellModalsLayoutDerived =
		useDesktopWorkspaceShellModalsLayoutDerivedHandlers(input.derived);
	const shellModalsLayoutChromeAndModalsRestSlice =
		useDesktopWorkspaceShellModalsLayoutChromeAndModalsRestSlice(
			input.chromeAndModalsRest
		);
	const shellModalsLayoutCanvasAndInteractionsSlice =
		useDesktopWorkspaceShellModalsLayoutCanvasAndInteractionsSlice(
			input.canvasAndInteractions
		);
	return {
		...shellModalsLayoutCanvasAndInteractionsSlice,
		...shellModalsLayoutChromeAndModalsRestSlice,
		...shellModalsLayoutDerived,
	} satisfies DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams;
}
