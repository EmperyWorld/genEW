/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Pointer-driven wallpaper parallax on #desktop-main keyed by Visual Studio scene depth.
 *
 * Invariants:
 * - Skips touch-primary, reduced motion, and low-GPU desktop mode.
 *
 * Related:
 * - useDesktopWorkspaceMainSurfaceEffects.ts, desktopShellMotion.ts
 */

import type { RefObject } from 'react';
import { useEffect } from 'react';
import type { DesktopSceneDepth } from '@/types/profile';
import { isDesktopLowGpuModeEnabled } from '../runtime/desktopLowGpuMode';
import { DESKTOP_SCENE_PARALLAX_PCT } from '../utils/desktopShellMotion';

export function computeWallpaperParallaxOffsetPct(
	normalizedX: number,
	normalizedY: number,
	sceneDepth: DesktopSceneDepth,
	intensityScale = 1
): { x: string; y: string } {
	const intensity =
		(DESKTOP_SCENE_PARALLAX_PCT[sceneDepth] ?? 0) * intensityScale;
	return {
		x: `${(normalizedX * intensity).toFixed(3)}%`,
		y: `${(normalizedY * intensity).toFixed(3)}%`,
	};
}

export function useDesktopWallpaperParallax(
	desktopAreaRef: RefObject<HTMLElement | null>,
	sceneDepth: DesktopSceneDepth,
	disabled = false,
	parallaxIntensityScale = 1
): void {
	useEffect(() => {
		if (disabled || typeof window === 'undefined') return;
		if (isDesktopLowGpuModeEnabled()) return;

		const el =
			desktopAreaRef.current ?? document.getElementById('desktop-main');
		if (!el) return;

		const intensity =
			(DESKTOP_SCENE_PARALLAX_PCT[sceneDepth] ?? 0) * parallaxIntensityScale;
		if (intensity <= 0) return;

		const reduceMotionMq = window.matchMedia(
			'(prefers-reduced-motion: reduce)'
		);
		const finePointerMq = window.matchMedia('(pointer: fine)');

		const resetParallax = () => {
			el.style.setProperty('--desktop-wallpaper-parallax-x', '0%');
			el.style.setProperty('--desktop-wallpaper-parallax-y', '0%');
		};

		const isReduceMotion = () =>
			reduceMotionMq.matches ||
			document.documentElement.hasAttribute(
				'data-accessibility-reduce-motion'
			) ||
			document.documentElement.hasAttribute('data-ui-animations-disabled');

		if (isReduceMotion() || !finePointerMq.matches) {
			resetParallax();
			return;
		}

		let raf = 0;
		const onMove = (event: PointerEvent) => {
			if (event.pointerType !== 'mouse') return;
			if (isReduceMotion()) {
				resetParallax();
				return;
			}
			cancelAnimationFrame(raf);
			raf = window.requestAnimationFrame(() => {
				const rect = el.getBoundingClientRect();
				if (rect.width <= 0 || rect.height <= 0) return;
				const nx = (event.clientX - rect.left) / rect.width - 0.5;
				const ny = (event.clientY - rect.top) / rect.height - 0.5;
				const offset = computeWallpaperParallaxOffsetPct(
					nx,
					ny,
					sceneDepth,
					parallaxIntensityScale
				);
				el.style.setProperty('--desktop-wallpaper-parallax-x', offset.x);
				el.style.setProperty('--desktop-wallpaper-parallax-y', offset.y);
			});
		};

		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerleave', resetParallax);
		resetParallax();

		const onReduceMotionChange = () => {
			if (isReduceMotion()) resetParallax();
		};
		reduceMotionMq.addEventListener('change', onReduceMotionChange);

		return () => {
			cancelAnimationFrame(raf);
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerleave', resetParallax);
			reduceMotionMq.removeEventListener('change', onReduceMotionChange);
			resetParallax();
		};
	}, [desktopAreaRef, sceneDepth, disabled, parallaxIntensityScale]);
}
