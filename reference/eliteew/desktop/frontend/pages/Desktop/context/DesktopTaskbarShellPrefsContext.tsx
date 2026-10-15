/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shell prefs for taskbar: clock seconds, quiet mode and timezone — hydrated from shell_state.
 *
 * Invariants:
 * - PATCH goes through shell-state mutation pipeline (source `chrome`).
 * - Tray rows are derived from real runtime state, not persisted static shortcut visibility flags.
 *
 * Related:
 * - `DesktopTaskbarShellPrefsContext.tsx`, `Taskbar.tsx`
 */

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type Context,
	type ReactNode,
} from 'react';
import { STORAGE_KEYS } from '../constants';
import { fetchDesktopShellStateDeduplicated } from '../services/desktopApi';
import {
	flushShellStatePipelineNow,
	scheduleShellStateMutation,
	waitForShellStatePipelineFlush,
} from '../utils/desktopShellStateMutationPipeline';

export type TaskbarShellClockPrefs = {
	showSeconds: boolean;
	persistClockShowSeconds: (value: boolean) => void;
};

export type TaskbarShellMetaPrefs = {
	shellHydrated: boolean;
	quietMode: boolean;
	persistQuietMode: (value: boolean) => void;
	timezone: string;
	persistTimezone: (value: string) => void;
};

const ClockPrefsContext = createContext<TaskbarShellClockPrefs | null>(null);
const MetaPrefsContext = createContext<TaskbarShellMetaPrefs | null>(null);

export function DesktopTaskbarShellPrefsProvider({
	children,
	userId,
}: {
	children: ReactNode;
	/** Optional user id for one-time legacy localStorage migration into shell_state. */
	userId?: string;
}) {
	const [showSeconds, setShowSeconds] = useState(() => {
		try {
			return localStorage.getItem(STORAGE_KEYS.CLOCK_SECONDS) === 'true';
		} catch {
			return false;
		}
	});
	const [shellHydrated, setShellHydrated] = useState(false);
	const [quietMode, setQuietMode] = useState(false);
	const [timezone, setTimezone] = useState(() => {
		try {
			return (
				Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow'
			);
		} catch {
			return 'Europe/Moscow';
		}
	});

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const s = await fetchDesktopShellStateDeduplicated();
				if (cancelled) return;
				if (typeof s.clock_show_seconds === 'boolean') {
					setShowSeconds(s.clock_show_seconds);
				}
				setQuietMode(s.quiet_mode === true);
				if (typeof s.timezone === 'string' && s.timezone.trim()) {
					setTimezone(s.timezone.trim());
				}
				const toPatch: { timezone?: string; quiet_mode?: boolean } = {};
				if (!s.timezone?.trim() && userId) {
					try {
						const legacyTz = window.localStorage
							.getItem(`desktop_timezone::${userId}`)
							?.trim();
						if (legacyTz) {
							setTimezone(legacyTz);
							toPatch.timezone = legacyTz;
						}
					} catch {
						/* ignore */
					}
				}
				if (typeof s.quiet_mode !== 'boolean' && userId) {
					try {
						const legacyQuiet =
							window.localStorage.getItem(`desktop_quiet_mode::${userId}`) ===
							'1';
						if (legacyQuiet) {
							setQuietMode(true);
							toPatch.quiet_mode = true;
						}
					} catch {
						/* ignore */
					}
				}
				try {
					const leg = localStorage.getItem(STORAGE_KEYS.CLOCK_SECONDS);
					if (typeof s.clock_show_seconds !== 'boolean' && leg === 'true') {
						setShowSeconds(true);
						scheduleShellStateMutation({
							source: 'chrome',
							merge: () => ({ clock_show_seconds: true }),
						});
						await flushShellStatePipelineNow('chrome').catch(() => {});
					}
					localStorage.removeItem(STORAGE_KEYS.CLOCK_SECONDS);
					if (userId) {
						window.localStorage.removeItem(`desktop_timezone::${userId}`);
						window.localStorage.removeItem(`desktop_quiet_mode::${userId}`);
					}
				} catch {
					/* ignore */
				}
				if (Object.keys(toPatch).length > 0) {
					scheduleShellStateMutation({
						source: 'chrome',
						merge: () => toPatch,
						immediate: true,
					});
					await flushShellStatePipelineNow('chrome').catch(() => {});
				}
			} catch {
				/* offline: keep local init */
			} finally {
				if (!cancelled) {
					setShellHydrated(true);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [userId]);

	const persistClockShowSeconds = useCallback((value: boolean) => {
		setShowSeconds(value);
		try {
			localStorage.removeItem(STORAGE_KEYS.CLOCK_SECONDS);
		} catch {
			/* ignore */
		}
		scheduleShellStateMutation({
			source: 'chrome',
			merge: () => ({ clock_show_seconds: value }),
		});
		void waitForShellStatePipelineFlush().catch(() => {});
	}, []);

	const persistQuietMode = useCallback((value: boolean) => {
		setQuietMode(value);
		scheduleShellStateMutation({
			source: 'chrome',
			merge: () => ({ quiet_mode: value }),
		});
		void waitForShellStatePipelineFlush().catch(() => {});
	}, []);

	const persistTimezone = useCallback((value: string) => {
		const trimmed = value.trim();
		if (!trimmed) return;
		setTimezone(trimmed);
		scheduleShellStateMutation({
			source: 'chrome',
			merge: () => ({ timezone: trimmed }),
		});
		void waitForShellStatePipelineFlush().catch(() => {});
	}, []);

	const clockValue = useMemo<TaskbarShellClockPrefs>(
		() => ({
			showSeconds,
			persistClockShowSeconds,
		}),
		[showSeconds, persistClockShowSeconds]
	);

	const metaValue = useMemo<TaskbarShellMetaPrefs>(
		() => ({
			shellHydrated,
			quietMode,
			persistQuietMode,
			timezone,
			persistTimezone,
		}),
		[shellHydrated, quietMode, persistQuietMode, timezone, persistTimezone]
	);

	return (
		<MetaPrefsContext.Provider value={metaValue}>
			<ClockPrefsContext.Provider value={clockValue}>
				{children}
			</ClockPrefsContext.Provider>
		</MetaPrefsContext.Provider>
	);
}

function useCtx<T>(ctx: Context<T | null>, name: string): T {
	const v = useContext(ctx);
	if (!v) {
		throw new Error(
			`${name} must be used within DesktopTaskbarShellPrefsProvider`
		);
	}
	return v;
}

export function useTaskbarShellClockPrefs(): TaskbarShellClockPrefs {
	return useCtx(ClockPrefsContext, 'useTaskbarShellClockPrefs');
}

export function useTaskbarShellMetaPrefs(): TaskbarShellMetaPrefs {
	return useCtx(MetaPrefsContext, 'useTaskbarShellMetaPrefs');
}
