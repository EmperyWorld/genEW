/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Defines quick-start Desktop workspace profile templates that are persisted in shell_state.workspace_profiles.
 *
 * Invariants:
 * - Templates resolve by installed appComponent and skip missing apps.
 * - Domain data must stay outside shell_state; templates only store Desktop launch composition.
 *
 * Related:
 * - documentation/product/PROFESSIONAL-WORLDS.md
 */

export type DesktopWorkspaceProfileTemplateId =
	| 'communication'
	| 'projects'
	| 'media'
	| 'marketing'
	| 'realtor';

export interface DesktopWorkspaceProfileTemplateDef {
	id: DesktopWorkspaceProfileTemplateId;
	appComponents: readonly string[];
}

export const DESKTOP_WORKSPACE_PROFILE_TEMPLATES: readonly DesktopWorkspaceProfileTemplateDef[] =
	[
		{
			id: 'communication',
			appComponents: ['GAFChatApp', 'SocialHubApp', 'FriendsApp'],
		},
		{
			id: 'projects',
			appComponents: [
				'ContentManagerPro',
				'DocEditor',
				'DesktopAiChatApp',
				'ClipboardManager',
			],
		},
		{
			id: 'media',
			appComponents: ['StudioGU', 'MusicPlayer', 'ImageStudio', 'VideoStudio'],
		},
		{
			id: 'marketing',
			appComponents: [
				'MarketingCabinet',
				'UserSiteStudio',
				'ContentManagerPro',
			],
		},
		{
			id: 'realtor',
			appComponents: [
				'ProfessionalWorlds',
				'EWRP',
				'ContentManagerPro',
				'UserSiteStudio',
				'GAFChatApp',
			],
		},
	] as const;
