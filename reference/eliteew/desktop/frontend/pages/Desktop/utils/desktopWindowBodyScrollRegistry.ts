/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Registry of first-party desktop apps that own vertical scrolling inside the
 * window body. Consumed by EnhancedWindow — do not duplicate membership checks.
 *
 * Invariants:
 * - Apps with h-full + internal overflow-y-auto/auto must be listed here.
 * - ContentManagerPro must stay out — outer data-desktop-scroll hosts preview geometry.
 *
 * Related:
 * - documentation/product/desktop/DESKTOP-CHROME-DECLUTTER-AND-SCROLL.md
 * - EnhancedWindow.tsx (`isDesktopAppWindowBodySelfScroll`)
 */

/** `appComponent` values whose window body uses overflow-hidden (self-scroll). */
export const DESKTOP_APP_WINDOW_BODY_SELF_SCROLL: ReadonlySet<string> = new Set(
	[
		'AppStore',
		'CustomerCabinet',
		'DesktopShellSettings',
		'DocEditor',
		'DocEditorV2',
		'ImageStudio',
		'MarketingCabinet',
		'MusicPlayer',
		'SocialHubApp',
		'UGS',
		'UGSHubApp',
		'UserSiteStudio',
		'VideoStudio',
	]
);

export function isDesktopAppWindowBodySelfScrollApp(
	appComponent?: string | null
): boolean {
	if (!appComponent) return false;
	return DESKTOP_APP_WINDOW_BODY_SELF_SCROLL.has(appComponent);
}
