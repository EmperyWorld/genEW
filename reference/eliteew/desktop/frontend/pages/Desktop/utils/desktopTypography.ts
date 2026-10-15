/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Resolve desktop body/display font stacks from profile preference ids.
 *
 * Invariants:
 * - Stacks must match `@fontsource/*` bundles imported in `src/styles/fontImports.ts`.
 *
 * Related:
 * - `useDesktopWorkspaceMainSurfaceEffects.ts`, `DesktopSettingsVisualStudioSection.tsx`
 */

import type {
	DesktopFontBodyId,
	DesktopFontDisplayId,
	DesktopSceneDepth,
} from '@/types/profile';

const DESKTOP_FONT_BODY_STACKS: Record<DesktopFontBodyId, string> = {
	manrope: '"Manrope", "Roboto", "Segoe UI", sans-serif',
	poppins: '"Poppins", "Manrope", "Segoe UI", sans-serif',
	raleway: '"Raleway", "Manrope", "Segoe UI", sans-serif',
	montserrat: '"Montserrat", "Manrope", "Segoe UI", sans-serif',
};

const DESKTOP_FONT_DISPLAY_STACKS: Record<
	Exclude<DesktopFontDisplayId, 'system'>,
	string
> = {
	cinzel: '"Cinzel", "Manrope", Georgia, serif',
	playfair: '"Playfair Display", "Cormorant Garamond", Georgia, serif',
	cormorant: '"Cormorant Garamond", "Playfair Display", Georgia, serif',
	raleway: '"Raleway", "Manrope", sans-serif',
};

export function resolveDesktopFontFamilyStack(body: DesktopFontBodyId): string {
	return DESKTOP_FONT_BODY_STACKS[body] ?? DESKTOP_FONT_BODY_STACKS.manrope;
}

/** Returns CSS font-family for display headings; `system` falls back to body stack. */
export function resolveDesktopFontDisplayStack(
	display: DesktopFontDisplayId,
	bodyStack: string
): string {
	if (display === 'system') return bodyStack;
	return (
		DESKTOP_FONT_DISPLAY_STACKS[display] ?? DESKTOP_FONT_DISPLAY_STACKS.cinzel
	);
}

export const DESKTOP_FONT_BODY_LABEL_KEYS: Record<DesktopFontBodyId, string> = {
	manrope: 'settingsPanel.visualStudio.fontBodyManrope',
	poppins: 'settingsPanel.visualStudio.fontBodyPoppins',
	raleway: 'settingsPanel.visualStudio.fontBodyRaleway',
	montserrat: 'settingsPanel.visualStudio.fontBodyMontserrat',
};

export const DESKTOP_FONT_DISPLAY_LABEL_KEYS: Record<
	DesktopFontDisplayId,
	string
> = {
	system: 'settingsPanel.visualStudio.fontDisplaySystem',
	cinzel: 'settingsPanel.visualStudio.fontDisplayCinzel',
	playfair: 'settingsPanel.visualStudio.fontDisplayPlayfair',
	cormorant: 'settingsPanel.visualStudio.fontDisplayCormorant',
	raleway: 'settingsPanel.visualStudio.fontDisplayRalewayDisplay',
};

export const DESKTOP_SCENE_DEPTH_LABEL_KEYS: Record<DesktopSceneDepth, string> =
	{
		soft: 'settingsPanel.visualStudio.sceneDepthSoft',
		balanced: 'settingsPanel.visualStudio.sceneDepthBalanced',
		immersive: 'settingsPanel.visualStudio.sceneDepthImmersive',
	};
