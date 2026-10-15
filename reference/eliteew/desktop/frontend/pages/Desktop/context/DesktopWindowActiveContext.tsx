/**
 * Window surface lifecycle in desktop shell.
 *
 * Legacy boolean hook (`useDesktopWindowActive`) remains available.
 */

import * as React from 'react';

export type DesktopWindowBackgroundLevel =
	| 'foreground'
	| 'background-lite'
	| 'suspended';

export interface DesktopWindowSurfaceState {
	isTopWindow: boolean;
	isMinimized: boolean;
	isMinimizing: boolean;
	isSurfaceVisible: boolean;
	isTabVisible: boolean;
	backgroundLevel: DesktopWindowBackgroundLevel;
	canRunHeavyEffects: boolean;
	shouldSuspendAppRuntime: boolean;
}

const DEFAULT_SURFACE_STATE: DesktopWindowSurfaceState = {
	isTopWindow: false,
	isMinimized: false,
	isMinimizing: false,
	isSurfaceVisible: false,
	isTabVisible: true,
	backgroundLevel: 'background-lite',
	canRunHeavyEffects: false,
	shouldSuspendAppRuntime: false,
};

const DesktopWindowSurfaceContext =
	React.createContext<DesktopWindowSurfaceState>(DEFAULT_SURFACE_STATE);

function resolveBackgroundLevel(
	params: Pick<
		DesktopWindowSurfaceState,
		'isTopWindow' | 'isMinimized' | 'isMinimizing' | 'isTabVisible'
	>
): DesktopWindowBackgroundLevel {
	if (!params.isTabVisible) {
		return 'suspended';
	}
	if (params.isMinimized || params.isMinimizing) {
		return 'suspended';
	}
	if (!params.isTopWindow) {
		return 'background-lite';
	}
	return 'foreground';
}

export function DesktopWindowActiveProvider({
	isActive,
	isMinimized = false,
	isMinimizing = false,
	isTabVisible = true,
	children,
}: {
	isActive: boolean;
	isMinimized?: boolean;
	isMinimizing?: boolean;
	isTabVisible?: boolean;
	children: React.ReactNode;
}): React.JSX.Element {
	const value = React.useMemo<DesktopWindowSurfaceState>(() => {
		const backgroundLevel = resolveBackgroundLevel({
			isTopWindow: isActive,
			isMinimized,
			isMinimizing,
			isTabVisible,
		});

		const isSurfaceVisible = isTabVisible && !isMinimized && !isMinimizing;

		return {
			isTopWindow: isActive,
			isMinimized,
			isMinimizing,
			isSurfaceVisible,
			isTabVisible,
			backgroundLevel,
			canRunHeavyEffects: backgroundLevel === 'foreground',
			shouldSuspendAppRuntime: backgroundLevel === 'suspended',
		};
	}, [isActive, isMinimized, isMinimizing, isTabVisible]);

	return (
		<DesktopWindowSurfaceContext.Provider value={value}>
			{children}
		</DesktopWindowSurfaceContext.Provider>
	);
}

export function useDesktopWindowSurfaceState(): DesktopWindowSurfaceState {
	return React.useContext(DesktopWindowSurfaceContext);
}

export function useDesktopWindowActive(): boolean {
	const state = useDesktopWindowSurfaceState();
	return state.backgroundLevel === 'foreground';
}
