/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * DesktopWindowContext — registerBeforeClose for app content so windows can
 * confirm unsaved state before close (plan 02/20 R06).
 *
 * Invariants:
 * - Apps register at most one handler per window; unregister on unmount.
 *
 * Related:
 * - context/desktopWindowBeforeCloseConfirm.ts
 * - utils/desktopWindowCloseGuardCatalog.ts
 * - documentation/product/desktop/DESKTOP-EMBEDDED-APPS-UX-NEXT.md
 */

import * as React from 'react';
import { createContext, useContext, useCallback, useMemo } from 'react';
import type { BeforeCloseHandler } from '../types/desktop.types';

export {
	createDesktopWindowBeforeCloseConfirmHandler,
	type DesktopWindowBeforeCloseConfirmOptions,
} from './desktopWindowBeforeCloseConfirm';
export {
	DESKTOP_WINDOW_CLOSE_GUARD_CATALOG,
	isDesktopAppWithDocumentedCloseGuard,
	type DesktopWindowCloseGuardEntry,
} from '../utils/desktopWindowCloseGuardCatalog';

interface DesktopWindowContextValue {
	registerBeforeClose: (fn: BeforeCloseHandler) => void;
	unregisterBeforeClose: () => void;
}

const DesktopWindowContext = createContext<DesktopWindowContextValue | null>(
	null
);

export function useDesktopWindowBeforeClose(): DesktopWindowContextValue | null {
	return useContext(DesktopWindowContext);
}

interface ProviderProps {
	windowId: string;
	registerBeforeClose: (id: string, fn: BeforeCloseHandler) => void;
	unregisterBeforeClose: (id: string) => void;
	children: React.ReactNode;
}

export function DesktopWindowContextProvider({
	windowId,
	registerBeforeClose,
	unregisterBeforeClose,
	children,
}: ProviderProps): React.ReactElement {
	const registerBeforeCloseForWindow = useCallback(
		(fn: BeforeCloseHandler) => {
			registerBeforeClose(windowId, fn);
		},
		[windowId, registerBeforeClose]
	);

	const unregisterBeforeCloseForWindow = useCallback(() => {
		unregisterBeforeClose(windowId);
	}, [windowId, unregisterBeforeClose]);

	const value = useMemo<DesktopWindowContextValue>(
		() => ({
			registerBeforeClose: registerBeforeCloseForWindow,
			unregisterBeforeClose: unregisterBeforeCloseForWindow,
		}),
		[registerBeforeCloseForWindow, unregisterBeforeCloseForWindow]
	);
	return (
		<DesktopWindowContext.Provider value={value}>
			{children}
		</DesktopWindowContext.Provider>
	);
}
