/**
 * Built-in desktop wallpapers (static WebP under `public/desktop-wallpapers/`).
 */
import type { Wallpaper } from '../types/desktop.types';

/** Base URL path for bundled wallpapers (Vite serves `public/` at site root). */
export const DESKTOP_WALLPAPER_PUBLIC_BASE = '/desktop-wallpapers';

/** Default wallpaper for new sessions and API fallbacks (must match `1.webp`). */
export const DEFAULT_DESKTOP_WALLPAPER_STYLE = `${DESKTOP_WALLPAPER_PUBLIC_BASE}/1.webp`;

export const WALLPAPER_COUNT = 29;

/** Путь к встроенному фону `public/desktop-wallpapers/{n}.webp`. */
export function builtinDesktopWallpaperPath(index1Based: number): string {
	const n = Math.min(WALLPAPER_COUNT, Math.max(1, Math.round(index1Based)));
	return `${DESKTOP_WALLPAPER_PUBLIC_BASE}/${n}.webp`;
}

export const WALLPAPERS: Wallpaper[] = Array.from(
	{ length: WALLPAPER_COUNT },
	(_, i) => {
		const n = i + 1;
		return {
			id: `desktop-bg-${n}`,
			name: `Фон ${n}`,
			style: `${DESKTOP_WALLPAPER_PUBLIC_BASE}/${n}.webp`,
		};
	}
);

/** Статичные пресеты из `public/desktop-wallpapers/*.webp` (не пользовательские data URL). */
export function isBuiltInWallpaperStyle(style: string): boolean {
	return WALLPAPERS.some((w) => w.style === style);
}
