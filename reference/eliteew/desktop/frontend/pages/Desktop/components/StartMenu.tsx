/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Multimodal Start Menu orchestrator — switches Legacy / Command Console /
 * Workspace Dashboard from `profile.ui.desktop_menu_mode` without changing
 * Taskbar props or deep-link routing.
 *
 * Invariants:
 * - Default / unknown mode → `StartMenuLegacy` (production-stable Пуск).
 * - Mode bodies are lazy-loaded so idle taskbar does not ship all three menus.
 * - Mode is read from UserPreferencesApp; missing prefs → legacy.
 *
 * Related:
 * - `StartMenuLegacy.tsx`, `startMenu/StartMenuCommandConsole.tsx`
 * - `startMenu/StartMenuWorkspace.tsx`, `types/desktopStartMenu.ts`
 */

import { Suspense, lazy, memo, useMemo } from 'react';
import { useUserPreferencesApp } from '../../../contexts/UserPreferencesAppContext';
import { DEFAULT_UI_PREFERENCES } from '../../../types/profile';
import {
	normalizeDesktopMenuMode,
	type DesktopMenuMode,
} from '../types/desktopStartMenu';
import { StartMenuSuspenseFallback } from './startMenu/StartMenuSuspenseFallback';
import type { StartMenuProps } from './startMenu/startMenuShared.types';

export type { StartMenuProps };

const StartMenuLegacy = lazy(() =>
	import('./StartMenuLegacy').then((m) => ({ default: m.StartMenuLegacy }))
);
const StartMenuCommandConsole = lazy(() =>
	import('./startMenu/StartMenuCommandConsole').then((m) => ({
		default: m.StartMenuCommandConsole,
	}))
);
const StartMenuWorkspace = lazy(() =>
	import('./startMenu/StartMenuWorkspace').then((m) => ({
		default: m.StartMenuWorkspace,
	}))
);

function resolveMenuMode(raw: string | undefined | null): DesktopMenuMode {
	return normalizeDesktopMenuMode(raw);
}

export const StartMenu: React.FC<StartMenuProps> = memo((props) => {
	const prefsApp = useUserPreferencesApp();
	const mode = useMemo(
		() =>
			resolveMenuMode(
				prefsApp?.preferences?.ui?.desktop_menu_mode ??
					DEFAULT_UI_PREFERENCES.desktop_menu_mode
			),
		[prefsApp?.preferences?.ui?.desktop_menu_mode]
	);

	if (!props.isOpen) return null;

	const body =
		mode === 'command_console' ? (
			<StartMenuCommandConsole {...props} />
		) : mode === 'workspace_dashboard' ? (
			<StartMenuWorkspace {...props} />
		) : (
			<StartMenuLegacy {...props} />
		);

	return <Suspense fallback={<StartMenuSuspenseFallback />}>{body}</Suspense>;
});

StartMenu.displayName = 'StartMenu';

export default StartMenu;
