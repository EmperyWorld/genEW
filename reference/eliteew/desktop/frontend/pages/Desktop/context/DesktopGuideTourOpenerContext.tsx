/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Registers a single guided-tour opener callback per desktop app window so `WindowTitleBar` can render «Экскурсия».
 *
 * Invariants:
 * - At most one opener per window; last registration wins until unmount/unregister.
 *
 * Related:
 * - hooks/useDesktopGuideTourOpener.ts, EnhancedWindow.tsx, WindowTitleBar.tsx
 */

import * as React from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';

export type DesktopGuideTourOpenerContextValue = {
	registerGuideTourOpener: (fn: () => void) => void;
	unregisterGuideTourOpener: () => void;
};

const DesktopGuideTourOpenerContext =
	createContext<DesktopGuideTourOpenerContextValue | null>(null);

export function DesktopGuideTourOpenerProvider({
	children,
	setOpener,
}: {
	children: React.ReactNode;
	setOpener: (fn: (() => void) | null) => void;
}): React.ReactElement {
	const registerGuideTourOpener = useCallback(
		(fn: () => void) => {
			setOpener(fn);
		},
		[setOpener]
	);

	const unregisterGuideTourOpener = useCallback(() => {
		setOpener(null);
	}, [setOpener]);

	const value = useMemo(
		() => ({ registerGuideTourOpener, unregisterGuideTourOpener }),
		[registerGuideTourOpener, unregisterGuideTourOpener]
	);

	return (
		<DesktopGuideTourOpenerContext.Provider value={value}>
			{children}
		</DesktopGuideTourOpenerContext.Provider>
	);
}

export function useDesktopGuideTourOpenerContext(): DesktopGuideTourOpenerContextValue | null {
	return useContext(DesktopGuideTourOpenerContext);
}
