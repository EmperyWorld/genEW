/**
 * T17: один плоский вызов вместо пары {@link useDesktopWorkspaceShellModalsCluster}
 * + {@link useDesktopWorkspaceShellLayoutSlotsCluster}: `handleAction` для слотов
 * берётся из цепочки модалок.
 */

import type { DesktopItem, RecentFile } from '../types/desktop.types';
import type { DesktopWorkspaceShellLayoutSlotsClusterParams } from './useDesktopWorkspaceShellLayoutSlotsCluster';
import { useDesktopWorkspaceShellLayoutSlotsCluster } from './useDesktopWorkspaceShellLayoutSlotsCluster';
import type { DesktopWorkspaceShellModalsClusterParams } from './useDesktopWorkspaceShellModalsCluster';
import { useDesktopWorkspaceShellModalsCluster } from './useDesktopWorkspaceShellModalsCluster';

export type DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams =
	DesktopWorkspaceShellModalsClusterParams &
		Omit<DesktopWorkspaceShellLayoutSlotsClusterParams, 'handleAction'> & {
			/** Пуск: снять ярлык приложения с рабочего стола */
			onUnpinAppFromDesktop?: (app: DesktopItem) => void;
			/** Пуск: переключить стол/обои профиля и открыть одно приложение */
			onOpenAppInWorkspace?: (
				app: DesktopItem,
				workspaceProfileId: string
			) => void;
			/** Пуск: открыть недавний файл (тот же контракт, что у Quick Search) */
			onStartMenuOpenRecentFile?: (file: RecentFile) => void;
			/** Пуск: убрать файл из недавних */
			onStartMenuRemoveRecentFile?: (fileId: string) => void;
		};

export function useDesktopWorkspaceShellModalsAndLayoutSlotsCluster(
	p: DesktopWorkspaceShellModalsAndLayoutSlotsClusterParams
): ReturnType<typeof useDesktopWorkspaceShellModalsCluster> &
	ReturnType<typeof useDesktopWorkspaceShellLayoutSlotsCluster> {
	const modals = useDesktopWorkspaceShellModalsCluster(p);
	const layout = useDesktopWorkspaceShellLayoutSlotsCluster({
		...p,
		handleAction: modals.handleAction,
	});
	return { ...modals, ...layout };
}
