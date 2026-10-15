import type * as React from 'react';
import { useEffect, useLayoutEffect } from 'react';
import { DESKTOP_DESIGN_TOKENS } from '../constants';
import { useDesktopWallpaperParallax } from './useDesktopWallpaperParallax';
import { isDesktopWallpaperImageRef } from '../utils/desktopWallpaper';
import {
	resolveDesktopFontDisplayStack,
	resolveDesktopFontFamilyStack,
} from '../utils/desktopTypography';
import { DESKTOP_WORKSPACE_MOTION } from '../utils/desktopVisualSystem';
import type {
	DesktopFontBodyId,
	DesktopFontDisplayId,
	DesktopSceneDepth,
} from '@/types/profile';

export type DesktopWorkspaceMainSurfaceStyleParams = {
	accentRgb: string;
	desktopThemeVars: Record<string, string>;
	effectiveTheme: 'dark' | 'light';
	wallpaper: string;
	desktopFontBody: DesktopFontBodyId;
	desktopFontDisplay: DesktopFontDisplayId;
	desktopSceneDepth: DesktopSceneDepth;
	wallpaperCrossfadeEnabled: boolean;
	styledTooltips: boolean;
};

function buildDesktopFontCssVars(
	body: DesktopFontBodyId,
	display: DesktopFontDisplayId
): { bodyStack: string; displayStack: string } {
	const bodyStack = resolveDesktopFontFamilyStack(body);
	const displayStack = resolveDesktopFontDisplayStack(display, bodyStack);
	return { bodyStack, displayStack };
}

export function buildDesktopWorkspaceMainSurfaceStyle({
	accentRgb,
	desktopThemeVars,
	effectiveTheme,
	wallpaper,
	desktopFontBody,
	desktopFontDisplay,
	wallpaperCrossfadeEnabled,
}: DesktopWorkspaceMainSurfaceStyleParams): React.CSSProperties {
	const { bodyStack, displayStack } = buildDesktopFontCssVars(
		desktopFontBody,
		desktopFontDisplay
	);
	const crossfadeSec = wallpaperCrossfadeEnabled
		? DESKTOP_WORKSPACE_MOTION.backgroundCrossfadeSec
		: 0;

	const baseStyle = {
		...DESKTOP_DESIGN_TOKENS,
		...desktopThemeVars,
		'--desktop-accent-rgb': accentRgb,
		'--desktop-font-family': bodyStack,
		'--desktop-font-display': displayStack,
		paddingTop: 'env(safe-area-inset-top, 0px)',
		paddingLeft: 'env(safe-area-inset-left, 0px)',
		paddingRight: 'env(safe-area-inset-right, 0px)',
		transition: `background ${crossfadeSec}s ease, background-image ${crossfadeSec}s ease`,
		colorScheme: effectiveTheme,
		fontFamily: 'var(--desktop-font-family)',
	} as React.CSSProperties;

	if (typeof wallpaper === 'string' && isDesktopWallpaperImageRef(wallpaper)) {
		return {
			...baseStyle,
			background: undefined,
			backgroundImage: `url("${wallpaper}")`,
			backgroundSize: 'cover',
			backgroundPosition:
				'calc(50% + var(--desktop-wallpaper-parallax-x, 0%)) calc(50% + var(--desktop-wallpaper-parallax-y, 0%))',
			backgroundRepeat: 'no-repeat',
		};
	}

	return {
		...baseStyle,
		background: String(wallpaper),
		backgroundImage: undefined,
		backgroundSize: undefined,
		backgroundPosition: undefined,
		backgroundRepeat: undefined,
	};
}

export function useDesktopWorkspaceMainSurfaceEffects(params: {
	accentRgb: string;
	desktopAreaRef: React.RefObject<HTMLElement | null>;
	desktopThemeVars: Record<string, string>;
	effectiveTheme: 'dark' | 'light';
	wallpaper: string;
	storageLoading: boolean;
	reduceBackdropBlur: boolean;
	desktopFontBody: DesktopFontBodyId;
	desktopFontDisplay: DesktopFontDisplayId;
	desktopSceneDepth: DesktopSceneDepth;
	wallpaperCrossfadeEnabled: boolean;
	styledTooltips: boolean;
	parallaxDisabled?: boolean;
	parallaxIntensityScale?: number;
}): void {
	const {
		accentRgb,
		desktopAreaRef,
		desktopThemeVars,
		effectiveTheme,
		wallpaper,
		storageLoading,
		reduceBackdropBlur,
		desktopFontBody,
		desktopFontDisplay,
		desktopSceneDepth,
		wallpaperCrossfadeEnabled,
		styledTooltips,
		parallaxDisabled = false,
		parallaxIntensityScale = 1,
	} = params;

	useDesktopWallpaperParallax(
		desktopAreaRef,
		desktopSceneDepth,
		parallaxDisabled,
		parallaxIntensityScale
	);

	const { bodyStack, displayStack } = buildDesktopFontCssVars(
		desktopFontBody,
		desktopFontDisplay
	);
	const crossfadeSec = wallpaperCrossfadeEnabled
		? DESKTOP_WORKSPACE_MOTION.backgroundCrossfadeSec
		: 0;

	useEffect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.style.setProperty(
			'--desktop-accent-rgb',
			accentRgb
		);
		return () => {
			document.documentElement.style.removeProperty('--desktop-accent-rgb');
		};
	}, [accentRgb]);

	useLayoutEffect(() => {
		if (storageLoading) return;
		let retryFrame: number | null = null;
		const applySurface = (): boolean => {
			const el =
				desktopAreaRef.current ?? document.getElementById('desktop-main');
			if (!el) return false;
			if (reduceBackdropBlur) {
				el.setAttribute('data-desktop-reduce-backdrop-blur', 'true');
			} else {
				el.removeAttribute('data-desktop-reduce-backdrop-blur');
			}
			el.setAttribute('data-desktop-scene-depth', desktopSceneDepth);
			if (styledTooltips) {
				el.setAttribute('data-desktop-styled-tooltips', 'true');
			} else {
				el.setAttribute('data-desktop-styled-tooltips', 'false');
			}
			for (const [k, v] of Object.entries(DESKTOP_DESIGN_TOKENS)) {
				el.style.setProperty(k, String(v));
			}
			for (const [k, v] of Object.entries(desktopThemeVars)) {
				el.style.setProperty(k, v);
			}
			el.style.setProperty('--desktop-accent-rgb', accentRgb);
			el.style.setProperty('--desktop-font-family', bodyStack);
			el.style.setProperty('--desktop-font-display', displayStack);
			el.style.paddingTop = 'env(safe-area-inset-top, 0px)';
			el.style.paddingLeft = 'env(safe-area-inset-left, 0px)';
			el.style.paddingRight = 'env(safe-area-inset-right, 0px)';
			el.style.transition = `background ${crossfadeSec}s ease, background-image ${crossfadeSec}s ease, background-position 0.45s ease-out`;
			el.style.colorScheme = effectiveTheme;
			el.style.fontFamily = 'var(--desktop-font-family)';
			if (
				typeof wallpaper === 'string' &&
				isDesktopWallpaperImageRef(wallpaper)
			) {
				el.style.background = '';
				el.style.backgroundImage = `url("${wallpaper}")`;
				el.style.backgroundSize = 'cover';
				el.style.backgroundPosition =
					'calc(50% + var(--desktop-wallpaper-parallax-x, 0%)) calc(50% + var(--desktop-wallpaper-parallax-y, 0%))';
				el.style.backgroundRepeat = 'no-repeat';
			} else {
				el.style.backgroundImage = '';
				el.style.backgroundSize = '';
				el.style.backgroundPosition = '';
				el.style.backgroundRepeat = '';
				el.style.background = String(wallpaper);
			}
			return true;
		};
		if (!applySurface()) {
			retryFrame = window.requestAnimationFrame(() => {
				applySurface();
			});
		}
		return () => {
			if (retryFrame !== null) {
				window.cancelAnimationFrame(retryFrame);
			}
		};
	}, [
		wallpaper,
		accentRgb,
		desktopThemeVars,
		effectiveTheme,
		desktopAreaRef,
		storageLoading,
		reduceBackdropBlur,
		bodyStack,
		displayStack,
		desktopSceneDepth,
		crossfadeSec,
		styledTooltips,
	]);
}
