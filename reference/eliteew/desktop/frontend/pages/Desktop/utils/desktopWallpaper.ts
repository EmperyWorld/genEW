import { isBuiltInWallpaperStyle } from '../constants/wallpapers';

/**
 * Desktop wallpaper string is either a CSS gradient / solid token, or a raster URL
 * (data URL, http(s), protocol-relative, same-origin path, blob).
 */
export function isDesktopWallpaperImageRef(
	value: string | undefined | null
): boolean {
	if (value == null || typeof value !== 'string') return false;
	const s = value.trim();
	if (!s) return false;
	const lower = s.toLowerCase();
	if (lower.startsWith('data:image')) return true;
	if (lower.startsWith('http://') || lower.startsWith('https://')) return true;
	if (lower.startsWith('//')) return true;
	if (s.startsWith('/')) return true;
	if (lower.startsWith('blob:')) return true;
	return false;
}

/** Пользовательские загрузки (data URL и т.д.), не встроенные `/desktop-wallpapers/*.webp`. */
export function isUserUploadedWallpaperStyle(style: string): boolean {
	return isDesktopWallpaperImageRef(style) && !isBuiltInWallpaperStyle(style);
}
