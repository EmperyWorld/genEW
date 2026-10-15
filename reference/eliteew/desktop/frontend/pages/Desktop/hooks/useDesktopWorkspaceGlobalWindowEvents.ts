/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop shell **window** listeners: context menu, minimize-all, close-active, settings tab, and companion
 * **`doc_editor_set_body`** fanout bootstrap (so lazy Doc Editor picks up events even with CDN chunk skew).
 *
 * Invariants:
 * - SSR-safe: only runs inside `useEffect` hooks.
 * - Event names stay aligned with **`desktopDeepLink.ts`** (`DESKTOP_OPEN_SHELL_SETTINGS_EVENT`, …).
 *
 * Related:
 * - `DesktopWorkspaceContent.tsx`
 * - `desktopDeepLink.ts` — `ensureDesktopDocEditorCompanionSetBodyFanout`
 */
import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { DesktopControlCenterTab } from '../components/DesktopSettingsPanel';
import {
	DESKTOP_OPEN_SHELL_SETTINGS_EVENT,
	ensureDesktopDocEditorCompanionSetBodyFanout,
} from '../utils/desktopDeepLink';

export function useDesktopWorkspaceGlobalWindowEvents({
	setWindowContextMenu,
	minimizeAllWindows,
	closeActiveDesktopWindow,
	openShellSettings,
}: {
	setWindowContextMenu: Dispatch<
		SetStateAction<{
			windowId: string;
			x: number;
			y: number;
		} | null>
	>;
	minimizeAllWindows: () => void;
	closeActiveDesktopWindow: () => void;
	openShellSettings: (tab?: DesktopControlCenterTab) => void;
}): void {
	useEffect(() => {
		ensureDesktopDocEditorCompanionSetBodyFanout();
	}, []);

	useEffect(() => {
		const handler = (event: Event) => {
			const { windowId, x, y } =
				(
					event as CustomEvent<{
						windowId: string;
						x: number;
						y: number;
					}>
				).detail ?? {};
			if (!windowId) return;
			setWindowContextMenu({ windowId, x, y });
		};
		window.addEventListener(
			'desktop-window-context-menu',
			handler as EventListener
		);
		return () =>
			window.removeEventListener(
				'desktop-window-context-menu',
				handler as EventListener
			);
	}, [setWindowContextMenu]);

	useEffect(() => {
		const handler = () => {
			minimizeAllWindows();
		};
		window.addEventListener('desktop-show-desktop', handler);
		return () => window.removeEventListener('desktop-show-desktop', handler);
	}, [minimizeAllWindows]);

	useEffect(() => {
		const handler = () => {
			closeActiveDesktopWindow();
		};
		window.addEventListener('close-active-window', handler);
		return () => window.removeEventListener('close-active-window', handler);
	}, [closeActiveDesktopWindow]);

	useEffect(() => {
		const handler = (event: Event) => {
			const tab = (event as CustomEvent<{ tab?: DesktopControlCenterTab }>)
				.detail?.tab;
			const allowed: DesktopControlCenterTab[] = [
				'personalize',
				'icons',
				'chrome',
				'shell',
				'performance',
			];
			const next =
				tab && allowed.includes(tab) ? tab : ('personalize' as const);
			openShellSettings(next);
		};
		window.addEventListener(
			DESKTOP_OPEN_SHELL_SETTINGS_EVENT,
			handler as EventListener
		);
		return () =>
			window.removeEventListener(
				DESKTOP_OPEN_SHELL_SETTINGS_EVENT,
				handler as EventListener
			);
	}, [openShellSettings]);
}
