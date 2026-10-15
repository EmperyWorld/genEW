/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Memoized input slices for {@link useDesktopWorkspaceSurfaceChromeBundle}.
 *
 * Invariants:
 * - Slice shapes match bundle param types; handlers stay in dedicated hooks inside bundle.
 *
 * Related:
 * - `DesktopWorkspaceContent.tsx`, `useDesktopWorkspaceSurfaceChromeBundle.ts`
 */

import { useMemo, type RefObject } from 'react';
import type { useDesktopWorkspaceSurfaceChromeBundle } from './useDesktopWorkspaceSurfaceChromeBundle';
import type { useDesktopWorkspaceAppearanceCallbacks } from './useDesktopWorkspaceAppearanceCallbacks';
import type { useDesktopWorkspaceWallpaperAndFolderHandlers } from './useDesktopWorkspaceWallpaperAndFolderHandlers';

type SurfaceChromeBundleParams = Parameters<
	typeof useDesktopWorkspaceSurfaceChromeBundle
>[0];

export type DesktopWorkspaceSurfaceChromeBundleInputParams = {
	accentRgb: SurfaceChromeBundleParams['accentRgbInput'];
	appearance: Parameters<typeof useDesktopWorkspaceAppearanceCallbacks>[0];
	wallpaper: Parameters<
		typeof useDesktopWorkspaceWallpaperAndFolderHandlers
	>[0];
	mainSurface: SurfaceChromeBundleParams['mainSurface'] & {
		desktopAreaRef: RefObject<HTMLElement | null>;
	};
};

export type DesktopWorkspaceSurfaceChromeBundleInput = Pick<
	SurfaceChromeBundleParams,
	'accentRgbInput' | 'appearanceInput' | 'wallpaperInput' | 'mainSurface'
>;

export function useDesktopWorkspaceSurfaceChromeBundleInput(
	params: DesktopWorkspaceSurfaceChromeBundleInputParams
): DesktopWorkspaceSurfaceChromeBundleInput {
	const { accentRgb, appearance, wallpaper, mainSurface } = params;

	return useMemo(
		(): DesktopWorkspaceSurfaceChromeBundleInput => ({
			accentRgbInput: accentRgb,
			appearanceInput: appearance,
			wallpaperInput: wallpaper,
			mainSurface,
		}),
		[accentRgb, appearance, mainSurface, wallpaper]
	);
}
