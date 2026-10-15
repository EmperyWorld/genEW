/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Effective desktop shell motion prefs for chrome components (morph, parallax, springs).
 *
 * Invariants:
 * - Falls back to defaults when used outside provider (tests / isolated widgets).
 *
 * Related:
 * - resolveDesktopShellMotion.ts, DesktopWorkspaceContent.tsx
 */

import { createContext, useContext, type ReactNode } from 'react';
import {
	resolveDesktopShellMotionPrefs,
	type DesktopShellMotionPrefs,
} from '../utils/resolveDesktopShellMotion';
import { DEFAULT_UI_PREFERENCES } from '@/types/profile';

const DEFAULT_SHELL_MOTION_PREFS = resolveDesktopShellMotionPrefs({
	ui: DEFAULT_UI_PREFERENCES,
});

const DesktopShellMotionPrefsContext = createContext<DesktopShellMotionPrefs>(
	DEFAULT_SHELL_MOTION_PREFS
);

export function DesktopShellMotionPrefsProvider({
	value,
	children,
}: {
	value: DesktopShellMotionPrefs;
	children: ReactNode;
}): React.ReactElement {
	return (
		<DesktopShellMotionPrefsContext.Provider value={value}>
			{children}
		</DesktopShellMotionPrefsContext.Provider>
	);
}

export function useDesktopShellMotionPrefs(): DesktopShellMotionPrefs {
	return useContext(DesktopShellMotionPrefsContext);
}
