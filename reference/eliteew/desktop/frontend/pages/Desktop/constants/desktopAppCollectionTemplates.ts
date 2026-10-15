/**
 * Wave 4: named app collections for Start Menu / Settings (shell_state.app_collections).
 * Resolves `appComponents` against installed catalog like workspace profile templates.
 */

export type DesktopAppCollectionTemplateId = 'myTools' | 'clientWork' | 'aiUgs';

export interface DesktopAppCollectionTemplateDef {
	id: DesktopAppCollectionTemplateId;
	appComponents: readonly string[];
}

export const DESKTOP_APP_COLLECTION_TEMPLATES: readonly DesktopAppCollectionTemplateDef[] =
	[
		{
			id: 'myTools',
			appComponents: [
				'ClipboardManager',
				'ContentManagerPro',
				'DesktopAiChatApp',
			],
		},
		{
			id: 'clientWork',
			appComponents: ['GAFChatApp', 'DocEditor', 'MarketingCabinet'],
		},
		{
			id: 'aiUgs',
			appComponents: ['StudioGU', 'DesktopAiChatApp', 'ImageStudio'],
		},
	] as const;
