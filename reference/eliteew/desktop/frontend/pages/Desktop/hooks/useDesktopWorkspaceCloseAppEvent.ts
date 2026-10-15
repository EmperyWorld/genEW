/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Listen to ``DESKTOP_CLOSE_NEWEST_APP_EVENT`` and close the most recently opened window matching the requested
 * ``appComponent``. Powers the undo button on EWA companion auto-actions (open_app → undo).
 *
 * Invariants:
 * - Pure side-effect hook; no React state. Safe to mount alongside `useDesktopWorkspaceOpenAppEvent`.
 * - "Newest" is decided by max ``zIndex`` falling back to last array index, mirroring focus stacking.
 * - If no matching window exists, the event is a no-op (companion may have already been closed manually).
 *
 * Related:
 * - src/pages/Desktop/utils/desktopDeepLink.ts (`requestCloseDesktopAppLatest`)
 * - src/pages/Desktop/DesktopWorkspaceContent.tsx
 * - src/features/ewa/EwaCompanionChatPanel.tsx (undo card)
 */
import type * as React from 'react';
import { useEffect } from 'react';

import {
	DESKTOP_CLOSE_NEWEST_APP_EVENT,
	type DesktopCloseNewestAppDetail,
} from '../utils/desktopDeepLink';
import type { WindowState } from '../types/desktop.types';

export function useDesktopWorkspaceCloseAppEvent(deps: {
	windowsRef: React.MutableRefObject<WindowState[]>;
	closeWindow: (id: string) => void;
}): void {
	const { windowsRef, closeWindow } = deps;

	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent<DesktopCloseNewestAppDetail>).detail;
			const targetComponent = (detail?.appComponent || '').trim();
			if (!targetComponent) return;
			const targetCallId = (detail?.videoCallId || '').trim();
			const candidates = (windowsRef.current || []).filter((w) => {
				if ((w.appComponent || '') !== targetComponent) return false;
				if (!targetCallId) return true;
				const windowCallId =
					typeof w.initialPayload?.videoCallId === 'string'
						? w.initialPayload.videoCallId.trim()
						: '';
				return windowCallId === targetCallId;
			});
			if (candidates.length === 0) return;
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
			if (!best) return;
			closeWindow(best.id);
		};
		window.addEventListener(
			DESKTOP_CLOSE_NEWEST_APP_EVENT,
			handler as EventListener
		);
		return () => {
			window.removeEventListener(
				DESKTOP_CLOSE_NEWEST_APP_EVENT,
				handler as EventListener
			);
		};
	}, [closeWindow, windowsRef]);
}
