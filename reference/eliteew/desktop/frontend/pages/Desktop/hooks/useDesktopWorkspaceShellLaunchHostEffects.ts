import { useDesktopUrlLaunchEffects } from './useDesktopUrlLaunchEffects';
import { useDesktopWorkspaceGlobalWindowEvents } from './useDesktopWorkspaceGlobalWindowEvents';

type GlobalWindowParams = Parameters<
	typeof useDesktopWorkspaceGlobalWindowEvents
>[0];
type UrlLaunchParams = Parameters<typeof useDesktopUrlLaunchEffects>[0];

export function useDesktopWorkspaceShellLaunchHostEffects(params: {
	globalWindow: GlobalWindowParams;
	urlLaunch: UrlLaunchParams;
}): void {
	useDesktopWorkspaceGlobalWindowEvents(params.globalWindow);
	useDesktopUrlLaunchEffects(params.urlLaunch);
}
