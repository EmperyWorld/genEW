/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Builds client_meta payload for Feedback ticket submission.
 *
 * Related:
 * - src/pages/Desktop/components/FeedbackHubApp.tsx
 */

export type FeedbackClientMetaEnv = {
	mode: string;
	viteAppVersion?: string;
	userAgent?: string;
};

export function buildFeedbackClientMeta(
	env: FeedbackClientMetaEnv
): Record<string, unknown> {
	return {
		mode: env.mode,
		...(env.viteAppVersion ? { vite_app_version: env.viteAppVersion } : {}),
		...(env.userAgent ? { ua: env.userAgent } : {}),
	};
}
