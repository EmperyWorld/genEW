/**
 * Legacy full-page hash / route targets → desktop window `appComponent`.
 * Used by embedded apps via {@link DesktopAppPropsContext} `onNavigate`.
 */

/** Pages opened as desktop windows (hash targets → app component id). */
export const PAGE_TO_APP_COMPONENT: Record<string, string> = {
	dashboard: 'UGS',
	'elite-dashboard-v3': 'UGS',
	ugs: 'UGS',
	'ugs-hub': 'UGSHubApp',
};
