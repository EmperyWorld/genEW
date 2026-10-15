/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Catalog of desktop apps that register `beforeClose` guards (plan 02/20 R06) for Settings copy
 * and operator docs — not a runtime enforcement list.
 *
 * Invariants:
 * - Apps not listed may still register guards; listing is best-effort documentation.
 *
 * Related:
 * - context/DesktopWindowContext.tsx, documentation/product/desktop/DESKTOP-STATE-PERSISTENCE.md
 */

export type DesktopWindowCloseGuardEntry = {
	appComponent: string;
	/** i18n key under desktopUi.windowChrome.closeGuardApps.* */
	labelKey: string;
};

/** Apps known to prompt before closing when there is unsaved work. */
export const DESKTOP_WINDOW_CLOSE_GUARD_CATALOG: readonly DesktopWindowCloseGuardEntry[] =
	[
		{ appComponent: 'DocEditor', labelKey: 'docEditor' },
		{ appComponent: 'DocEditorV2', labelKey: 'docEditorV2' },
		{ appComponent: 'UserSiteStudio', labelKey: 'siteStudio' },
		{ appComponent: 'MarketingCabinet', labelKey: 'marketingCabinet' },
	] as const;

export function isDesktopAppWithDocumentedCloseGuard(
	appComponent: string | null | undefined
): boolean {
	if (!appComponent) return false;
	return DESKTOP_WINDOW_CLOSE_GUARD_CATALOG.some(
		(e) => e.appComponent === appComponent
	);
}
