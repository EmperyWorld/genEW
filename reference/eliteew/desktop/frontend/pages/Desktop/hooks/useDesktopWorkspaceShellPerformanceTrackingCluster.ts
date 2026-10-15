/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * T36 cluster: shell action timing wrappers, primary-overlay transitions, chrome render-burst
 * sampling, and window persistence wired through tracked restore.
 *
 * Invariants:
 * - Side effects mirror prior DesktopWorkspaceContent inline wiring; persistence uses tracked restore only.
 *
 * Related:
 * - hooks/useDesktopShellWindowPersistence.ts
 * - hooks/usePerformanceOptimizer.ts
 * - documentation/product/desktop/DESKTOP-WORKSPACE-CONTENT-REFACTOR-PLAN.md
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { DesktopItem, PersistedWindowState } from '../types/desktop.types';
import {
	useDesktopShellWindowPersistence,
	type DesktopShellToast,
} from './useDesktopShellWindowPersistence';
import type { ShellPerformanceActionName } from './usePerformanceOptimizer';

type RecordShellAction = (
	name: ShellPerformanceActionName,
	durationMs?: number
) => void;

type RestoreWindowsFn = (
	windows: PersistedWindowState[],
	items: DesktopItem[]
) => void;

type HandleWindowDragCommitFn = (id: string, x: number, y: number) => void;

export type DesktopWorkspaceShellPerformanceTrackingClusterInput = {
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
		windows: Parameters<typeof useDesktopShellWindowPersistence>[0]['windows'];
		desktops: Parameters<
			typeof useDesktopShellWindowPersistence
		>[0]['desktops'];
		activeDesktopId: string;
		installedApps: Parameters<
			typeof useDesktopShellWindowPersistence
		>[0]['installedApps'];
		installedAppsLoading: boolean;
		storeApps: unknown;
		items: DesktopItem[];
		switchToDesktop: (id: string) => void;
		desktopToast: DesktopShellToast;
		persistSubjectKey?: string | null;
	};
};

export type DesktopWorkspaceShellPerformanceTrackingClusterResult = {
	trackedHandleWindowDragCommit: HandleWindowDragCommitFn;
};

function usePrimaryOverlayShellActionTracking(
	recordShellAction: RecordShellAction,
	overlayBurst: DesktopWorkspaceShellPerformanceTrackingClusterInput['overlayBurst']
): void {
	const { showQuickSearch, showTaskSwitcher, showAppStore } = overlayBurst;
	const previousPrimaryOverlayRef = useRef({
		showQuickSearch,
		showTaskSwitcher,
		showAppStore,
	});

	useEffect(() => {
		const prev = previousPrimaryOverlayRef.current;
		const wasOpen =
			prev.showQuickSearch || prev.showTaskSwitcher || prev.showAppStore;
		const isOpen = showQuickSearch || showTaskSwitcher || showAppStore;
		if (isOpen && !wasOpen) {
			recordShellAction('primary-overlay-open');
		} else if (!isOpen && wasOpen) {
			recordShellAction('primary-overlay-close');
		}
		previousPrimaryOverlayRef.current = {
			showQuickSearch,
			showTaskSwitcher,
			showAppStore,
		};
	}, [recordShellAction, showAppStore, showQuickSearch, showTaskSwitcher]);
}

function useShellChromeRenderBurstTracking(
	recordShellAction: RecordShellAction,
	overlayBurst: DesktopWorkspaceShellPerformanceTrackingClusterInput['overlayBurst']
): void {
	const {
		currentDesktopWindowCount,
		showAppStore,
		showQuickSearch,
		showTaskSwitcher,
	} = overlayBurst;

	const shellChromeRenderBurstKey = useMemo(
		() =>
			[
				currentDesktopWindowCount,
				showAppStore ? 1 : 0,
				showQuickSearch ? 1 : 0,
				showTaskSwitcher ? 1 : 0,
			].join(':'),
		[currentDesktopWindowCount, showAppStore, showQuickSearch, showTaskSwitcher]
	);

	useEffect(() => {
		void shellChromeRenderBurstKey;
		const start = window.performance.now();
		const frame = window.requestAnimationFrame(() => {
			recordShellAction(
				'shell-chrome-render-burst',
				window.performance.now() - start
			);
		});
		return () => window.cancelAnimationFrame(frame);
	}, [recordShellAction, shellChromeRenderBurstKey]);
}

export function useDesktopWorkspaceShellPerformanceTrackingCluster(
	input: DesktopWorkspaceShellPerformanceTrackingClusterInput
): DesktopWorkspaceShellPerformanceTrackingClusterResult {
	const { recordShellAction, windowOps, overlayBurst, windowPersistence } =
		input;
	const { restoreWindows, handleWindowDragCommit } = windowOps;

	const trackedRestoreWindows = useCallback(
		(...args: Parameters<RestoreWindowsFn>) => {
			const start = window.performance.now();
			restoreWindows(...args);
			recordShellAction('restore-burst', window.performance.now() - start);
		},
		[recordShellAction, restoreWindows]
	);

	useDesktopShellWindowPersistence({
		...windowPersistence,
		restoreWindows: trackedRestoreWindows,
	});

	usePrimaryOverlayShellActionTracking(recordShellAction, overlayBurst);
	useShellChromeRenderBurstTracking(recordShellAction, overlayBurst);

	const trackedHandleWindowDragCommit = useCallback(
		(id: string, x: number, y: number) => {
			const start = window.performance.now();
			handleWindowDragCommit(id, x, y);
			recordShellAction('window-drag-commit', window.performance.now() - start);
		},
		[handleWindowDragCommit, recordShellAction]
	);

	return { trackedHandleWindowDragCommit };
}
