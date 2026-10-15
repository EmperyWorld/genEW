/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * User-facing copy helpers for desktop window shell: friendly app names for load/error states
 * without exposing internal component ids.
 *
 * Invariants:
 * - Never surfaces raw `appComponent` strings to end users; catalog/window title resolution only.
 *
 * Related:
 * - EnhancedWindow.tsx, desktopWindowDisplayTitle.ts
 * - documentation/product/desktop/DESKTOP-WINDOW-MIN-SIZES.md
 */

import type { TFunction } from 'i18next';
import type { WindowState } from '../types/desktop.types';
import { resolveDesktopWindowDisplayTitle } from './desktopWindowDisplayTitle';

/** Friendly label for window chrome (title bar, load/error, toasts). */
export function resolveDesktopWindowFriendlyAppName(win: WindowState): string {
	const title = resolveDesktopWindowDisplayTitle(win).trim();
	if (title.length > 0) return title;
	return win.title?.trim() || 'App';
}

export function buildDesktopWindowLoadingMessage(
	t: TFunction<'desktopUi'>,
	win: WindowState
): string {
	return t('windowChrome.loading', {
		appName: resolveDesktopWindowFriendlyAppName(win),
	});
}

export function buildDesktopWindowErrorMessage(
	t: TFunction<'desktopUi'>,
	win: WindowState
): string {
	return t('windowChrome.loadFailed', {
		appName: resolveDesktopWindowFriendlyAppName(win),
	});
}

export function buildDesktopWindowMinSizeHint(
	t: TFunction<'desktopUi'>,
	minWidth: number,
	minHeight: number
): string {
	return t('windowChrome.minSizeHint', { minWidth, minHeight });
}
