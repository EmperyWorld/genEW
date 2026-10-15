/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Subscribe to `#desktop-main[data-desktop-styled-tooltips]` for chrome tooltip mode.
 *
 * Invariants:
 * - Defaults to true when attribute is missing (SSR / pre-mount).
 *
 * Related:
 * - `DesktopChromeTooltip.tsx`, `useDesktopWorkspaceMainSurfaceEffects.ts`
 */

import { useSyncExternalStore } from 'react';

const DESKTOP_MAIN_ID = 'desktop-main';

function readStyledTooltipsEnabled(): boolean {
	if (typeof document === 'undefined') return true;
	const el = document.getElementById(DESKTOP_MAIN_ID);
	if (!el) return true;
	return el.getAttribute('data-desktop-styled-tooltips') !== 'false';
}

function subscribeStyledTooltips(callback: () => void): () => void {
	if (typeof document === 'undefined') return () => {};
	const el = document.getElementById(DESKTOP_MAIN_ID);
	if (!el) return () => {};
	const observer = new MutationObserver(callback);
	observer.observe(el, {
		attributes: true,
		attributeFilter: ['data-desktop-styled-tooltips'],
	});
	return () => observer.disconnect();
}

export function useDesktopStyledTooltipsEnabled(): boolean {
	return useSyncExternalStore(
		subscribeStyledTooltips,
		readStyledTooltipsEnabled,
		() => true
	);
}

/** Native `title` only when styled TooltipV2 mode is off (e.g. taskbar window flyout). */
export function resolveDesktopChromeNativeTitle(
	content: string | undefined,
	styledTooltipsEnabled: boolean
): string | undefined {
	if (styledTooltipsEnabled || content == null || content === '') {
		return undefined;
	}
	return content;
}
