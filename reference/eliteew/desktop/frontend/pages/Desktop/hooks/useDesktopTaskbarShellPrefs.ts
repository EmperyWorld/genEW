/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Combined taskbar shell preferences snapshot for Settings Center: clock seconds,
 * quiet mode and timezone hydrated from `shell_state`.
 *
 * Invariants:
 * - Tray process rows are runtime-derived; persisted static shortcut toggles are not exposed here.
 *
 * Related:
 * - `context/DesktopTaskbarShellPrefsContext.tsx`
 * - `components/settings/DesktopSettingsShellSyncPrefsCard.tsx`
 */

import {
	useTaskbarShellClockPrefs,
	useTaskbarShellMetaPrefs,
} from '../context/DesktopTaskbarShellPrefsContext';

export type UseDesktopTaskbarShellPrefsResult = {
	shellHydrated: boolean;
	quietMode: boolean;
	persistQuietMode: (value: boolean) => void;
	timezone: string;
	persistTimezone: (value: string) => void;
	showSeconds: boolean;
	persistClockShowSeconds: (value: boolean) => void;
};

/**
 * Объединённый снимок prefs — подписывает на узкие контексты; при любой смене
 * состояния компонент перерисуется. Для таскбара используйте узкие хуки.
 */
export function useDesktopTaskbarShellPrefs(): UseDesktopTaskbarShellPrefsResult {
	const {
		shellHydrated,
		quietMode,
		persistQuietMode,
		timezone,
		persistTimezone,
	} = useTaskbarShellMetaPrefs();
	const { showSeconds, persistClockShowSeconds } = useTaskbarShellClockPrefs();

	return {
		shellHydrated,
		quietMode,
		persistQuietMode,
		timezone,
		persistTimezone,
		showSeconds,
		persistClockShowSeconds,
	};
}

export {
	DesktopTaskbarShellPrefsProvider,
	useTaskbarShellClockPrefs,
	useTaskbarShellMetaPrefs,
} from '../context/DesktopTaskbarShellPrefsContext';
