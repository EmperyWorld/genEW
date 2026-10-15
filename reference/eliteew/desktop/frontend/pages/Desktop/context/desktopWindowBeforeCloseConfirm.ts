/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared before-close guard helper for desktop embedded apps (plan 02/20 R06).
 *
 * Invariants:
 * - Returns true when close may proceed; false when user cancels the confirm dialog.
 *
 * Related:
 * - DesktopWindowContext.tsx, utils/desktopWindowCloseGuardCatalog.ts
 */

import type { TFunction } from 'i18next';
import type { BeforeCloseHandler } from '../types/desktop.types';

export type DesktopWindowBeforeCloseConfirmOptions = {
	/** When true, show confirm and block close if user declines. */
	hasUnsavedWork: () => boolean;
	t: TFunction<'desktopUi'>;
	/** Optional app-specific message; defaults to windowChrome.closeConfirmBody. */
	bodyMessage?: string;
};

/** Standard confirm dialog for unsaved work before window close. */
export function createDesktopWindowBeforeCloseConfirmHandler(
	options: DesktopWindowBeforeCloseConfirmOptions
): BeforeCloseHandler {
	const { hasUnsavedWork, t, bodyMessage } = options;
	return () => {
		if (!hasUnsavedWork()) return true;
		const body =
			bodyMessage?.trim() ||
			t('windowChrome.closeConfirmBody', {
				defaultValue: 'You have unsaved changes. Close this window anyway?',
			});
		return window.confirm(
			`${t('windowChrome.closeConfirmTitle', { defaultValue: 'Close window?' })}\n\n${body}`
		);
	};
}
