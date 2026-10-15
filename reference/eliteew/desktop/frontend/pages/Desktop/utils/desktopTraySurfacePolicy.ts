/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Pure policy for taskbar background-process tray membership and surface badges.
 * Keeps inventory counts out of alert chrome and socket-only GAF out of the tray list.
 *
 * Invariants:
 * - GAF tray row requires unread mail or a user-minimized GAF window — not bare socket online.
 * - Tray chip numeric badge is alert-only (GAF unread); inventory length is not a badge.
 *
 * Related:
 * - hooks/useDesktopTrayItems.ts
 * - components/TaskbarTrayGafCluster.tsx
 * - documentation/product/desktop/DESKTOP-TASKBAR-ARCHITECTURE.md
 */

export const DESKTOP_TRAY_PANEL_ID = 'desktop-taskbar-tray-panel';

export function shouldIncludeGafTrayRow(input: {
	gafUnread: number;
	gafMinimized: boolean;
}): boolean {
	return input.gafUnread > 0 || input.gafMinimized;
}

export type TraySurfaceBadge =
	| { kind: 'unread'; count: number }
	| { kind: 'none' };

/** Alert badge on the tray chip — never raw process inventory. */
export function resolveTraySurfaceBadge(input: {
	gafUnread: number;
}): TraySurfaceBadge {
	if (input.gafUnread > 0) {
		return { kind: 'unread', count: input.gafUnread };
	}
	return { kind: 'none' };
}
