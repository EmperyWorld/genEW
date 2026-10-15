import type { DesktopState } from '../context/DesktopStateContext';

type DesktopStateActions = {
	setShowCommandPalette: (v: boolean) => void;
	setShowClipboard: (v: boolean) => void;
	setIsDraggingIcon: (v: boolean) => void;
	setShowEnhancedContextMenu: (v: boolean) => void;
	setContextMenuPosition: (v: { x: number; y: number }) => void;
	setContextMenuType: (
		v: 'desktop' | 'folder' | 'file' | 'app' | 'window'
	) => void;
};

export function useDesktopWorkspaceShellModalFields(params: {
	state: DesktopState;
	actions: DesktopStateActions;
}) {
	const { state, actions } = params;

	return {
		showCommandPalette: state.showCommandPalette,
		setShowCommandPalette: actions.setShowCommandPalette,
		showClipboard: state.showClipboard,
		setShowClipboard: actions.setShowClipboard,
		isDraggingIcon: state.isDraggingIcon,
		setIsDraggingIcon: actions.setIsDraggingIcon,
		showEnhancedContextMenu: state.showEnhancedContextMenu,
		setShowEnhancedContextMenu: actions.setShowEnhancedContextMenu,
		contextMenuPosition: state.contextMenuPosition,
		setContextMenuPosition: actions.setContextMenuPosition,
		contextMenuType: state.contextMenuType,
		setContextMenuType: actions.setContextMenuType,
	};
}
