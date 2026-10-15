import type { SiteSettings } from '@typings/admin';

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
	id: 'main',
	contactPhone: '',
	contactEmail: '',
	contactAddress: '',
	workingHours: '',
	siteTitle: 'Template Site',
	siteDescription: 'Reusable storefront and booking platform',
	defaultTheme: 'verdant-aurora',
	frontendUrl: '',
	shopUrl: '',
	updatedAt: new Date(0).toISOString(),
};

export const resolveSiteSettings = (
	siteSettings?: SiteSettings | null
): SiteSettings => ({
	...DEFAULT_SITE_SETTINGS,
	...siteSettings,
});
