/**
 * Волна 16: один вызов из контента вместо пяти подряд shell-слотов layout.
 * Порядок хуков совпадает с прежним в DesktopWorkspaceContent.
 */

import { useDesktopWorkspaceShellAuxLayerProps } from './useDesktopWorkspaceShellAuxLayerProps';
import { useDesktopWorkspaceShellCanvasProps } from './useDesktopWorkspaceShellCanvasProps';
import { useDesktopWorkspaceShellSearchOverlaysProps } from './useDesktopWorkspaceShellSearchOverlaysProps';
import { useDesktopWorkspaceShellTaskbarProps } from './useDesktopWorkspaceShellTaskbarProps';
import { useDesktopWorkspaceShellWindowSlotProps } from './useDesktopWorkspaceShellWindowSlotProps';

export type DesktopWorkspaceShellLayoutSlotsBundleParams = {
	canvas: Parameters<typeof useDesktopWorkspaceShellCanvasProps>[0];
	windowSlot: Parameters<typeof useDesktopWorkspaceShellWindowSlotProps>[0];
	taskbar: Parameters<typeof useDesktopWorkspaceShellTaskbarProps>[0];
	searchOverlays: Parameters<
		typeof useDesktopWorkspaceShellSearchOverlaysProps
	>[0];
	aux: Parameters<typeof useDesktopWorkspaceShellAuxLayerProps>[0];
};

export function useDesktopWorkspaceShellLayoutSlotsBundle(
	params: DesktopWorkspaceShellLayoutSlotsBundleParams
) {
	const shellCanvasProps = useDesktopWorkspaceShellCanvasProps(params.canvas);
	const {
		windowContextMenu: windowContextMenuProps,
		windowLayer: windowLayerProps,
	} = useDesktopWorkspaceShellWindowSlotProps(params.windowSlot);
	const shellTaskbarProps = useDesktopWorkspaceShellTaskbarProps(
		params.taskbar
	);
	const shellSearchOverlaysProps = useDesktopWorkspaceShellSearchOverlaysProps(
		params.searchOverlays
	);
	const {
		helpAndSession: helpAndSessionProps,
		appStoreLayer: appStoreLayerProps,
	} = useDesktopWorkspaceShellAuxLayerProps(params.aux);

	return {
		shellCanvasProps,
		windowContextMenuProps,
		windowLayerProps,
		shellTaskbarProps,
		shellSearchOverlaysProps,
		helpAndSessionProps,
		appStoreLayerProps,
	};
}
