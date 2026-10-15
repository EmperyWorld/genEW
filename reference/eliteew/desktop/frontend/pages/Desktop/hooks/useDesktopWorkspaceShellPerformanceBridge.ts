import { useMemo } from 'react';
import type { DesktopControlCenterTab } from '../components/DesktopSettingsPanel';
import { DESKTOP_PERFORMANCE_TARGETS } from '../constants';
import type { WindowState } from '../types/desktop.types';
import {
	QUIET_FLOATING_WIDGET_PERFORMANCE,
	STATIC_DESKTOP_SETTINGS_PERFORMANCE,
} from '../utils/desktopWorkspacePerformanceConstants';
import type { usePerformanceOptimizer } from './usePerformanceOptimizer';

type PerformanceOptimizerReturn = ReturnType<typeof usePerformanceOptimizer>;

export function useDesktopWorkspaceShellPerformanceBridge(params: {
	performance: PerformanceOptimizerReturn;
	currentDesktopWindows: WindowState[];
	isShellSettingsWindowOpen: boolean;
	desktopSettingsActiveTab: DesktopControlCenterTab;
}) {
	const {
		performance,
		currentDesktopWindows,
		isShellSettingsWindowOpen,
		desktopSettingsActiveTab,
	} = params;

	const settingsPerformance = useMemo(
		() => ({
			metrics: {
				fps: performance.metrics.fps,
				renderTime: performance.metrics.renderTime,
				memoryUsage: performance.metrics.memoryUsage,
				windowCount: currentDesktopWindows.length,
				activeAdapters: performance.metrics.activeAdapters,
				suspendedAdapters: performance.metrics.suspendedAdapters,
				pausedEffects: performance.metrics.pausedEffects,
				backgroundInvalidationsPerMin:
					performance.metrics.backgroundInvalidationsPerMin,
				longTaskSupported: performance.metrics.longTaskSupported,
				longTaskCount: performance.metrics.longTaskCount,
				lastLongTaskMs: performance.metrics.lastLongTaskMs,
				lastAction: performance.metrics.lastAction,
				actionSampleCount: performance.metrics.actionSampleCount,
			},
			isHighPerformanceMode: performance.isHighPerformanceMode,
			preferAggressiveBackgroundSuspend:
				performance.preferAggressiveBackgroundSuspend,
			recommendations: performance.recommendations,
			setPreferAggressiveBackgroundSuspend:
				performance.setPreferAggressiveBackgroundSuspend,
		}),
		[
			performance.metrics.fps,
			performance.metrics.renderTime,
			performance.metrics.memoryUsage,
			performance.metrics.activeAdapters,
			performance.metrics.suspendedAdapters,
			performance.metrics.pausedEffects,
			performance.metrics.backgroundInvalidationsPerMin,
			performance.metrics.longTaskSupported,
			performance.metrics.longTaskCount,
			performance.metrics.lastLongTaskMs,
			performance.metrics.lastAction,
			performance.metrics.actionSampleCount,
			performance.isHighPerformanceMode,
			performance.preferAggressiveBackgroundSuspend,
			performance.recommendations,
			performance.setPreferAggressiveBackgroundSuspend,
			currentDesktopWindows.length,
		]
	);
	const settingsPerformanceForPanel =
		isShellSettingsWindowOpen && desktopSettingsActiveTab === 'performance'
			? settingsPerformance
			: STATIC_DESKTOP_SETTINGS_PERFORMANCE;
	const autoQuietWindowLoad =
		currentDesktopWindows.length >
		DESKTOP_PERFORMANCE_TARGETS.WINDOW_AUTO_QUIET_COUNT;
	const floatingWidgetPerformanceForCanvas =
		isShellSettingsWindowOpen || autoQuietWindowLoad
			? QUIET_FLOATING_WIDGET_PERFORMANCE
			: settingsPerformance;

	return {
		settingsPerformanceForPanel,
		floatingWidgetPerformanceForCanvas,
		autoQuietWindowLoad,
	};
}
