/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Listen for ``desktop-focus-newest-app`` / ``desktop-minimize-newest-app`` so EWA companion **focus_app** /
 * **minimize_app** actions target the freshest window stack match (mirrors newest-close semantics).
 *
 * Invariants:
 * - Side-effect only; resolves host virtual desktop via `desktops[].windows`, then delegates to `switchToDesktop` /
 *   `focusWindow` / `minimizeWindow`.
 * - No-op if no matching visible window snapshot.
 *
 * Related:
 * - src/pages/Desktop/utils/desktopDeepLink.ts (`requestFocusDesktopAppLatest`)
 * - src/features/ewa/EwaCompanionChatPanel.tsx
 */
import type * as React from 'react';
import { useEffect } from 'react';

import type { VirtualDesktop } from './useVirtualDesktops';
import type { WindowState } from '../types/desktop.types';
import {
	DESKTOP_FOCUS_NEWEST_APP_EVENT,
	DESKTOP_MINIMIZE_NEWEST_APP_EVENT,
	type DesktopFocusNewestAppDetail,
} from '../utils/desktopDeepLink';

function pickNewestByApp(
	windows: WindowState[],
	appComponent: string
): WindowState | undefined {
	const candidates = windows.filter(
		(w) => (w.appComponent || '').trim() === appComponent
	);
	if (candidates.length === 0) return undefined;
	let best: WindowState | undefined;
	for (const w of candidates) {
		if (!best) {
			best = w;
			continue;
		}
		const a = best.zIndex ?? 0;
		const b = w.zIndex ?? 0;
		if (b >= a) best = w;
	}
	return best;
}

export function useDesktopWorkspaceCompanionFocusMinimizeEvents(deps: {
	windowsRef: React.MutableRefObject<WindowState[]>;
	desktops: VirtualDesktop[];
	activeDesktopId: string;
	switchToDesktop: (id: string) => void;
	focusWindow: (id: string) => void;
	minimizeWindow: (id: string) => void;
}): void {
	const {
		windowsRef,
		desktops,
		activeDesktopId,
		switchToDesktop,
		focusWindow,
		minimizeWindow,
	} = deps;

	useEffect(() => {
		const ensureDesktopForWindow = (winId: string) => {
			const host = desktops.find((d) => d.windows.includes(winId));
			if (host && activeDesktopId && host.id !== activeDesktopId) {
				switchToDesktop(host.id);
			}
		};

		const onFocus = (e: Event) => {
			const detail = (e as CustomEvent<DesktopFocusNewestAppDetail>).detail;
			const comp = (detail?.appComponent || '').trim();
			if (!comp) return;
			const best = pickNewestByApp(windowsRef.current || [], comp);
			if (!best) return;
			ensureDesktopForWindow(best.id);
			focusWindow(best.id);
		};

		const onMinimize = (e: Event) => {
			const detail = (e as CustomEvent<DesktopFocusNewestAppDetail>).detail;
			const comp = (detail?.appComponent || '').trim();
			if (!comp) return;
			const best = pickNewestByApp(windowsRef.current || [], comp);
			if (!best || best.isMinimized) return;
			ensureDesktopForWindow(best.id);
			minimizeWindow(best.id);
		};

		window.addEventListener(
			DESKTOP_FOCUS_NEWEST_APP_EVENT,
			onFocus as EventListener
		);
		window.addEventListener(
			DESKTOP_MINIMIZE_NEWEST_APP_EVENT,
			onMinimize as EventListener
		);
		return () => {
			window.removeEventListener(
				DESKTOP_FOCUS_NEWEST_APP_EVENT,
				onFocus as EventListener
			);
			window.removeEventListener(
				DESKTOP_MINIMIZE_NEWEST_APP_EVENT,
				onMinimize as EventListener
			);
		};
	}, [
		activeDesktopId,
		desktops,
		focusWindow,
		minimizeWindow,
		switchToDesktop,
		windowsRef,
	]);
}
