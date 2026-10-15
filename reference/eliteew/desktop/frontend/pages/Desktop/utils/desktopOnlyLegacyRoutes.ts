/**
 * Desktop-only shell: legacy full-page hash routes map to #/desktop + pending window open.
 * See documentation/product/desktop/DESKTOP-ONLY-NAV.md
 */

/** Routes that remain full-page (not coerced to desktop shell). */
export const SYSTEM_FULL_PAGE_ROUTES = new Set<string>([
	'desktop',
	'desktop/store',
	'login',
	'admin',
	'desktop-admin',
	/** Telegram / fixed link: Keycloak + APK (not desktop shell). */
	'mobile-app-download',
	/** MobileAndroid in-app WebView: fullscreen EWA companion (same SPA as desktop). */
	'mobile-ewa-companion',
	'mobile-handbook',
	'mobile-social-hub',
	'mobile-feedback-hub',
	'mobile-notifications',
	'mobile-content-manager',
	'mobile-ewdesk',
	'mobile-professional-worlds',
	'mobile-app-store',
	'mobile-desktop-settings',
	/** Immersive Empery Nexus Chronicle (lazy Three.js chunk; local/operator). */
	'empery-nexus',
]);

const LEGACY_PAGE_TO_APP_COMPONENT: Record<string, string> = {
	dashboard: 'UGS',
	'elite-dashboard-v3': 'UGS',
	'creative-studio': 'UGS',
	'audio-transcription': 'StudioGU',
	'live-voice': 'StudioGU',
	'voice-studio': 'StudioGU',
	'document-editor': 'DocEditor',
	'video-studio': 'VideoStudio',
	'unified-content': 'ContentManagerPro',
	'user-profile': 'SocialHubApp',
	presentations: 'EWRP',
	'presentations-archive': 'EWRP',
	ewrp: 'EWRP',
};

/** UGS-related hash segments (handled via storeUgsDesktopDeepLink, not appComponent). */
const UGS_LEGACY_PAGES = new Set<string>([
	'ugs',
	'ugs-hub',
	'ugs-admin',
	'ugs-analytics',
	'workflow-builder',
]);

export function isUgsLegacyPage(page: string): boolean {
	return UGS_LEGACY_PAGES.has(page);
}

export function getPendingAppComponentForLegacyPage(
	page: string
): string | null {
	return LEGACY_PAGE_TO_APP_COMPONENT[page] ?? null;
}
