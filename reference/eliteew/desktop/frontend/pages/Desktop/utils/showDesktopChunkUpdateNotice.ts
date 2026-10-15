/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Brief user-visible notice before SPA chunk reload on the desktop shell (plan 02/20 R11).
 *
 * Invariants:
 * - Falls back to immediate reload when overlay mount fails or user is not on desktop route.
 *
 * Related:
 * - EnhancedWindow.tsx AppErrorBoundary, utils/staleBundleReload.ts
 */

import { mountEliteTechnicalOverlay } from '@/utils/mountEliteImperativeOverlay';
import { reloadAllAppTabs } from '@/utils/staleBundleReload';
import { isDesktopShellRoute } from '@/utils/desktopShellRoute';

const DESKTOP_CHUNK_UPDATE_OVERLAY_ID = 'eliteew-desktop-chunk-update-overlay';
const NOTICE_MS = 1600;

let pendingReloadTimer: ReturnType<typeof setTimeout> | null = null;

export function showDesktopChunkUpdateNoticeThenReload(
	reason = 'chunk_load_failure'
): void {
	if (pendingReloadTimer != null) {
		return;
	}
	if (typeof document === 'undefined' || !isDesktopShellRoute()) {
		reloadAllAppTabs(reason);
		return;
	}
	if (document.getElementById(DESKTOP_CHUNK_UPDATE_OVERLAY_ID)) {
		return;
	}
	try {
		mountEliteTechnicalOverlay(DESKTOP_CHUNK_UPDATE_OVERLAY_ID, {
			title: 'EliteEW was updated',
			description: 'Reloading to open the latest version…',
			eyebrow: 'EliteEW · update',
			tone: 'sky',
			role: 'alert',
			ariaLive: 'assertive',
			quote: null,
			actionLabel: 'Reload now',
			onAction: () => {
				if (pendingReloadTimer != null) {
					clearTimeout(pendingReloadTimer);
					pendingReloadTimer = null;
				}
				reloadAllAppTabs(reason);
			},
		});
	} catch {
		reloadAllAppTabs(reason);
		return;
	}
	pendingReloadTimer = setTimeout(() => {
		pendingReloadTimer = null;
		reloadAllAppTabs(reason);
	}, NOTICE_MS);
}

/** Test-only: cancel pending auto-reload. */
export function cancelDesktopChunkUpdateNoticeForTests(): void {
	if (pendingReloadTimer != null) {
		clearTimeout(pendingReloadTimer);
		pendingReloadTimer = null;
	}
}
