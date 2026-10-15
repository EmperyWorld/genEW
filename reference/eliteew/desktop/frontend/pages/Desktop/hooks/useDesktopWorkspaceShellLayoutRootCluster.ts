/**
 * T21: собирает {@link useDesktopWorkspaceShellLayoutRootProps} с подписями из `t`
 * и флагом перетаскивания (`isDraggingIcon` / `groupDragState`).
 */

import type { TFunction } from 'i18next';
import type { DesktopWorkspaceGroupDragState } from './useDesktopWorkspaceIconInteractions';
import {
	type DesktopWorkspaceShellLayoutRootProps,
	useDesktopWorkspaceShellLayoutRootProps,
} from './useDesktopWorkspaceShellLayoutRootProps';

export type DesktopWorkspaceShellLayoutRootClusterParams = Omit<
	DesktopWorkspaceShellLayoutRootProps,
	| 'skipToContentLabel'
	| 'iconsKeyboardHint'
	| 'iconsKeyboardHintId'
	| 'mainAriaLabel'
	| 'isWorkspaceDragging'
> & {
	t: TFunction<'desktopUi'>;
	isDraggingIcon: boolean;
	groupDragState: DesktopWorkspaceGroupDragState | null;
	activeVirtualDesktopId?: string;
	activeVirtualDesktopName?: string;
};

export function useDesktopWorkspaceShellLayoutRootCluster(
	p: DesktopWorkspaceShellLayoutRootClusterParams
): DesktopWorkspaceShellLayoutRootProps {
	return useDesktopWorkspaceShellLayoutRootProps({
		openVoiceCommandCenter: p.openVoiceCommandCenter,
		skipToContentLabel: p.t('workspace.skipToContent'),
		iconsKeyboardHint: p.t('workspace.iconsKeyboardHint'),
		iconsKeyboardHintId: 'desktop-icons-keyboard-hint',
		workspaceShellCss: p.workspaceShellCss,
		desktopAreaRef: p.desktopAreaRef,
		effectiveTheme: p.effectiveTheme,
		isWorkspaceDragging: p.isDraggingIcon || p.groupDragState != null,
		mainAriaLabel: p.t('workspace.mainLabel'),
		desktopMainSurfaceStyle: p.desktopMainSurfaceStyle,
		desktopWindowStyle: p.desktopWindowStyle,
		shellSettingsBridge: p.shellSettingsBridge,
		desktopUiScale: p.desktopUiScale,
		hasOpenStudioGUWindow: p.hasOpenStudioGUWindow,
		activeVirtualDesktopId: p.activeVirtualDesktopId,
		activeVirtualDesktopName: p.activeVirtualDesktopName,
	});
}
