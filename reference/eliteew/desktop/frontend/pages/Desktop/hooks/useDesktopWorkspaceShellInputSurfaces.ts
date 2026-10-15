import { useGestures } from './useGestures';
import {
	useDesktopWorkspaceKeyboardShortcuts,
	type UseDesktopWorkspaceKeyboardShortcutsParams,
} from './useDesktopWorkspaceKeyboardShortcuts';
import { useMultiSelect } from './useMultiSelect';

export function useDesktopWorkspaceShellInputSurfaces(params: {
	keyboard: UseDesktopWorkspaceKeyboardShortcutsParams;
	setShowCommandPalette: (value: boolean) => void;
	minimizeAllWindows: () => void;
}) {
	const { keyboard, setShowCommandPalette, minimizeAllWindows } = params;

	useMultiSelect();
	useGestures({
		onSwipeLeft: () => {},
		onSwipeRight: () => {},
		onSwipeUp: () => {},
		onSwipeDown: () => {},
		onPinchZoom: () => {},
		onTwoFingerSwipe: () => {},
		onThreeFingerSwipe: (direction) => {
			if (direction === 'up') setShowCommandPalette(true);
			if (direction === 'down') minimizeAllWindows();
		},
	});
	useDesktopWorkspaceKeyboardShortcuts(keyboard);
}
