import { useMemo } from 'react';
import type { DesktopWorkspaceShellLayoutProps } from '../components/DesktopWorkspaceShellLayout';

export type DesktopWorkspaceShellLayoutRootProps = Pick<
	DesktopWorkspaceShellLayoutProps,
	| 'openVoiceCommandCenter'
	| 'skipToContentLabel'
	| 'iconsKeyboardHint'
	| 'iconsKeyboardHintId'
	| 'workspaceShellCss'
	| 'desktopAreaRef'
	| 'effectiveTheme'
	| 'isWorkspaceDragging'
	| 'mainAriaLabel'
	| 'desktopMainSurfaceStyle'
	| 'desktopWindowStyle'
	| 'shellSettingsBridge'
	| 'desktopUiScale'
	| 'hasOpenStudioGUWindow'
	| 'activeVirtualDesktopId'
	| 'activeVirtualDesktopName'
>;

export function useDesktopWorkspaceShellLayoutRootProps(
	params: DesktopWorkspaceShellLayoutRootProps
): DesktopWorkspaceShellLayoutRootProps {
	return useMemo(
		() => ({
			openVoiceCommandCenter: params.openVoiceCommandCenter,
			skipToContentLabel: params.skipToContentLabel,
			iconsKeyboardHint: params.iconsKeyboardHint,
			iconsKeyboardHintId: params.iconsKeyboardHintId,
			workspaceShellCss: params.workspaceShellCss,
			desktopAreaRef: params.desktopAreaRef,
			effectiveTheme: params.effectiveTheme,
			isWorkspaceDragging: params.isWorkspaceDragging,
			mainAriaLabel: params.mainAriaLabel,
			desktopMainSurfaceStyle: params.desktopMainSurfaceStyle,
			desktopWindowStyle: params.desktopWindowStyle,
			shellSettingsBridge: params.shellSettingsBridge,
			desktopUiScale: params.desktopUiScale,
			hasOpenStudioGUWindow: params.hasOpenStudioGUWindow,
			activeVirtualDesktopId: params.activeVirtualDesktopId,
			activeVirtualDesktopName: params.activeVirtualDesktopName,
		}),
		[
			params.openVoiceCommandCenter,
			params.skipToContentLabel,
			params.iconsKeyboardHint,
			params.iconsKeyboardHintId,
			params.workspaceShellCss,
			params.desktopAreaRef,
			params.effectiveTheme,
			params.isWorkspaceDragging,
			params.mainAriaLabel,
			params.desktopMainSurfaceStyle,
			params.desktopWindowStyle,
			params.shellSettingsBridge,
			params.desktopUiScale,
			params.hasOpenStudioGUWindow,
			params.activeVirtualDesktopId,
			params.activeVirtualDesktopName,
		]
	);
}
