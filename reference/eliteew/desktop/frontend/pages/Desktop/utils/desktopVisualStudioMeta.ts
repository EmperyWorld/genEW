/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Format Visual Studio fields for preset cards (curated + user-saved).
 *
 * Related:
 * - desktopTypography.ts, DesktopSettingsPersonalizeTab.tsx
 */

import type { TFunction } from 'i18next';
import type {
	DesktopFontBodyId,
	DesktopFontDisplayId,
	DesktopSceneDepth,
} from '@/types/profile';
import {
	DESKTOP_FONT_BODY_LABEL_KEYS,
	DESKTOP_FONT_DISPLAY_LABEL_KEYS,
	DESKTOP_SCENE_DEPTH_LABEL_KEYS,
} from './desktopTypography';

export type VisualStudioPresetMetaFields = {
	fontBody?: DesktopFontBodyId;
	fontDisplay?: DesktopFontDisplayId;
	sceneDepth?: DesktopSceneDepth;
};

export function buildVisualStudioPresetMetaLine(
	fields: VisualStudioPresetMetaFields,
	t: TFunction<'desktopUi'>
): string {
	const parts: string[] = [];
	if (fields.fontBody) {
		parts.push(t(DESKTOP_FONT_BODY_LABEL_KEYS[fields.fontBody]));
	}
	if (fields.fontDisplay && fields.fontDisplay !== 'system') {
		parts.push(t(DESKTOP_FONT_DISPLAY_LABEL_KEYS[fields.fontDisplay]));
	}
	if (fields.sceneDepth) {
		parts.push(t(DESKTOP_SCENE_DEPTH_LABEL_KEYS[fields.sceneDepth]));
	}
	return parts.join(' · ');
}

export function hasVisualStudioPresetMeta(
	fields: VisualStudioPresetMetaFields
): boolean {
	return Boolean(
		fields.fontBody ||
			(fields.fontDisplay && fields.fontDisplay !== 'system') ||
			fields.sceneDepth
	);
}
