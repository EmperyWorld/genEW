import type * as React from 'react';
import { useDesktopWorkspaceCloseAppEvent } from './useDesktopWorkspaceCloseAppEvent';
import { useDesktopWorkspaceCompanionFocusMinimizeEvents } from './useDesktopWorkspaceCompanionFocusMinimizeEvents';
import { useDesktopWorkspaceOpenAppEvent } from './useDesktopWorkspaceOpenAppEvent';
import { useDesktopWorkspaceShellInputSurfaces } from './useDesktopWorkspaceShellInputSurfaces';
import type { UseDesktopWorkspaceKeyboardShortcutsParams } from './useDesktopWorkspaceKeyboardShortcuts';
import type { VirtualDesktop } from './useVirtualDesktops';
import type { OpenWindowOptions } from './useWindowManager';
import type {
	DesktopItem,
	WindowInitialPayload,
	WindowState,
} from '../types/desktop.types';

/**
 * T12 — рядом стоящие эффекты ввода и `desktop-open-app` (раньше два вызова в `DesktopWorkspaceContent.tsx`).
 * iter3-actions: `desktop-close-newest-app` для undo EWA-спутника.
 * Companion roadmap: `desktop-focus-newest-app` / `desktop-minimize-newest-app` (**focus_app** / **minimize_app**).
 */
export function useDesktopWorkspaceOpenAppAndInputSurfaces(params: {
	keyboard: UseDesktopWorkspaceKeyboardShortcutsParams;
	setShowCommandPalette: (open: boolean) => void;
	minimizeAllWindows: () => void;
	items: DesktopItem[];
	windowsRef: React.MutableRefObject<WindowState[]>;
	desktops: VirtualDesktop[];
	activeDesktopId: string;
	switchToDesktop: (id: string) => void;
	focusWindow: (id: string) => void;
	handleOpenWindow: (item: DesktopItem, options?: OpenWindowOptions) => void;
	updateWindowPayload: (
		windowId: string,
		payload: WindowInitialPayload
	) => void;
	closeWindow: (id: string) => void;
	minimizeWindow: (id: string) => void;
}): void {
	const {
		keyboard,
		setShowCommandPalette,
		minimizeAllWindows,
		items,
		windowsRef,
		desktops,
		activeDesktopId,
		switchToDesktop,
		focusWindow,
		handleOpenWindow,
		updateWindowPayload,
		closeWindow,
		minimizeWindow,
	} = params;

	useDesktopWorkspaceShellInputSurfaces({
		keyboard,
		setShowCommandPalette,
		minimizeAllWindows,
	});

	useDesktopWorkspaceOpenAppEvent({
		items,
		windowsRef,
		desktops,
		activeDesktopId,
		switchToDesktop,
		focusWindow,
		handleOpenWindow,
		updateWindowPayload,
	});

	useDesktopWorkspaceCloseAppEvent({
		windowsRef,
		closeWindow,
	});

	useDesktopWorkspaceCompanionFocusMinimizeEvents({
		windowsRef,
		desktops,
		activeDesktopId,
		switchToDesktop,
		focusWindow,
		minimizeWindow,
	});
}
