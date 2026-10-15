import { useCallback, useMemo } from 'react';
import type { DesktopControlCenterTab } from '../components/DesktopSettingsPanel';
import type { WindowInitialPayload, WindowState } from '../types/desktop.types';
import { useDesktopBackgroundRuntimeMetrics } from '../runtime/DesktopBackgroundRuntimeContext';
import { requestCloseStartMenu } from '../utils/desktopDeepLink';
import { usePerformanceOptimizer } from './usePerformanceOptimizer';

export type OpenDesktopAppByComponent = (
	appComponent: string,
	options?: { initialPayload?: WindowInitialPayload }
) => unknown;

export function useDesktopWorkspaceCurrentDesktopSession(params: {
	windows: WindowState[];
	activeDesktopId: string;
	getWindowsOnDesktop: (desktopId: string) => string[] | undefined;
	focusWindow: (id: string) => void;
	closeWindow: (id: string) => void;
	minimizeWindow: (id: string) => void;
	setDesktopSettingsActiveTab: (tab: DesktopControlCenterTab) => void;
	openDesktopAppByComponent: OpenDesktopAppByComponent;
	mergeShellSettingsWindowPayload: (patch: WindowInitialPayload) => void;
}) {
	const {
		windows,
		activeDesktopId,
		getWindowsOnDesktop,
		focusWindow,
		closeWindow,
		minimizeWindow,
		setDesktopSettingsActiveTab,
		openDesktopAppByComponent,
		mergeShellSettingsWindowPayload,
	} = params;

	const currentDesktopWindows = useMemo(() => {
		const windowIdsOnDesktop = getWindowsOnDesktop(activeDesktopId) ?? [];
		return (windows ?? []).filter((window) =>
			windowIdsOnDesktop.includes(window.id)
		);
	}, [windows, activeDesktopId, getWindowsOnDesktop]);

	const isShellSettingsWindowOpen = useMemo(
		() =>
			currentDesktopWindows.some(
				(w) => w.appComponent === 'DesktopShellSettings'
			),
		[currentDesktopWindows]
	);

	const openShellSettings = useCallback(
		(tab?: DesktopControlCenterTab, opts?: { scrollToElementId?: string }) => {
			// Choke-point: dismiss Start Menu (PANEL z-index) before settings window.
			requestCloseStartMenu();
			const nextTab = tab ?? 'personalize';
			const scrollId = opts?.scrollToElementId;
			setDesktopSettingsActiveTab(nextTab);
			const existing = currentDesktopWindows.find(
				(w) => w.appComponent === 'DesktopShellSettings'
			);
			if (existing) {
				focusWindow(existing.id);
				if (scrollId) {
					mergeShellSettingsWindowPayload({
						shellSettingsScrollToElementId: scrollId,
					});
				}
				return;
			}
			openDesktopAppByComponent('DesktopShellSettings', {
				initialPayload: {
					shellSettingsTab: nextTab,
					...(scrollId ? { shellSettingsScrollToElementId: scrollId } : {}),
				},
			});
		},
		[
			currentDesktopWindows,
			focusWindow,
			mergeShellSettingsWindowPayload,
			openDesktopAppByComponent,
			setDesktopSettingsActiveTab,
		]
	);

	const closeShellSettingsWindow = useCallback(() => {
		for (const w of currentDesktopWindows) {
			if (w.appComponent === 'DesktopShellSettings') {
				closeWindow(w.id);
				return;
			}
		}
	}, [currentDesktopWindows, closeWindow]);

	const hasOpenStudioGUWindow = useMemo(
		() => currentDesktopWindows.some((w) => w.appComponent === 'StudioGU'),
		[currentDesktopWindows]
	);

	const runtimeMetrics = useDesktopBackgroundRuntimeMetrics();

	const performance = usePerformanceOptimizer({
		windowCount: currentDesktopWindows.length,
		runtimeMetrics,
	});

	const activeDesktopWindow = useMemo(() => {
		if (currentDesktopWindows.length === 0) {
			return null;
		}
		const interactiveWindows = currentDesktopWindows.filter(
			(win) => !win.isMinimized && !win.isMinimizing
		);
		if (interactiveWindows.length === 0) {
			return null;
		}
		return interactiveWindows.reduce<WindowState | null>(
			(best, current) =>
				current.zIndex >= (best?.zIndex ?? -Infinity) ? current : best,
			null
		);
	}, [currentDesktopWindows]);

	const activeDesktopWindowId = activeDesktopWindow?.id ?? null;

	/** Клик по кнопке окна на таскбаре: активное не свёрнутое окно — свернуть; иначе — фокус (восстановить свёрнутое или переключить). */
	const handleTaskbarWinClick = useCallback(
		(id: string) => {
			const w = windows.find((x) => x.id === id);
			if (!w) return;
			if (w.isMinimized) {
				focusWindow(id);
				return;
			}
			if (id === activeDesktopWindowId) {
				minimizeWindow(id);
				return;
			}
			focusWindow(id);
		},
		[windows, activeDesktopWindowId, focusWindow, minimizeWindow]
	);

	const closeActiveDesktopWindow = useCallback(() => {
		if (activeDesktopWindowId) {
			closeWindow(activeDesktopWindowId);
		}
	}, [activeDesktopWindowId, closeWindow]);

	return {
		currentDesktopWindows,
		isShellSettingsWindowOpen,
		openShellSettings,
		closeShellSettingsWindow,
		hasOpenStudioGUWindow,
		performance,
		activeDesktopWindow,
		activeDesktopWindowId,
		handleTaskbarWinClick,
		closeActiveDesktopWindow,
	};
}
