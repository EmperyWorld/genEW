/** Масштаб рабочей области (как «разрешение» / DPI): `transform: scale` контента стола; модалки вне этого слоя. */

export const DESKTOP_UI_SCALE_MIN = 0.5;
export const DESKTOP_UI_SCALE_MAX = 1.5;
export const DESKTOP_UI_SCALE_DEFAULT = 1;

/** Пресеты ПКМ и шаг слайдера в настройках (25%). */
export const DESKTOP_UI_SCALE_PRESETS = [0.5, 0.75, 1, 1.25, 1.5] as const;

export function clampDesktopUiScale(value: unknown): number {
	if (value === null || value === undefined || value === '') {
		return DESKTOP_UI_SCALE_DEFAULT;
	}
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n) || n <= 0) {
		return DESKTOP_UI_SCALE_DEFAULT;
	}
	return Math.min(DESKTOP_UI_SCALE_MAX, Math.max(DESKTOP_UI_SCALE_MIN, n));
}
