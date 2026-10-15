/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * T36 input assembler: maps coarse workspace source slices to shell performance tracking cluster.
 *
 * Invariants:
 * - Pass-through field mapping only; cluster hook owns tracking effects and persistence wiring.
 *
 * Related:
 * - hooks/useDesktopWorkspaceShellPerformanceTrackingCluster.ts
 * - documentation/product/desktop/DESKTOP-WORKSPACE-CONTENT-REFACTOR-PLAN.md
 */

import type { DesktopItem } from '../types/desktop.types';
import type { DesktopShellToast } from './useDesktopShellWindowPersistence';
import type { ShellPerformanceActionName } from './usePerformanceOptimizer';
import {
	useDesktopWorkspaceShellPerformanceTrackingCluster,
	type DesktopWorkspaceShellPerformanceTrackingClusterResult,
} from './useDesktopWorkspaceShellPerformanceTrackingCluster';

type RecordShellAction = (
	name: ShellPerformanceActionName,
	durationMs?: number
) => void;

type RestoreWindowsFn = Parameters<
	typeof useDesktopWorkspaceShellPerformanceTrackingCluster
>[0]['windowOps']['restoreWindows'];

type HandleWindowDragCommitFn = Parameters<
	typeof useDesktopWorkspaceShellPerformanceTrackingCluster
>[0]['windowOps']['handleWindowDragCommit'];

export type DesktopWorkspaceShellPerformanceTrackingClusterSources = {
	recordShellAction: RecordShellAction;
	windowOps: {
		restoreWindows: RestoreWindowsFn;
		handleWindowDragCommit: HandleWindowDragCommitFn;
	};
	overlayBurst: {
		showQuickSearch: boolean;
		showTaskSwitcher: boolean;
		showAppStore: boolean;
		currentDesktopWindowCount: number;
	};
	windowPersistence: {
		windows: Parameters<
			typeof useDesktopWorkspaceShellPerformanceTrackingCluster
		>[0]['windowPersistence']['windows'];
		desktops: Parameters<
			typeof useDesktopWorkspaceShellPerformanceTrackingCluster
		>[0]['windowPersistence']['desktops'];
		activeDesktopId: string;
		installedApps: Parameters<
			typeof useDesktopWorkspaceShellPerformanceTrackingCluster
		>[0]['windowPersistence']['installedApps'];
		installedAppsLoading: boolean;
		storeApps: unknown;
		items: DesktopItem[];
		switchToDesktop: (id: string) => void;
		desktopToast: DesktopShellToast;
		persistSubjectKey?: string | null;
	};
};

export function useDesktopWorkspaceShellPerformanceTrackingClusterInput(
	sources: DesktopWorkspaceShellPerformanceTrackingClusterSources
): DesktopWorkspaceShellPerformanceTrackingClusterResult {
	return useDesktopWorkspaceShellPerformanceTrackingCluster({
		recordShellAction: sources.recordShellAction,
		windowOps: sources.windowOps,
		overlayBurst: sources.overlayBurst,
		windowPersistence: sources.windowPersistence,
	});
}
