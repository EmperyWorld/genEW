import { describe, expect, it } from 'vitest';
import {
	clampDesktopUiScale,
	DESKTOP_UI_SCALE_DEFAULT,
	DESKTOP_UI_SCALE_MAX,
	DESKTOP_UI_SCALE_MIN,
} from './desktopUiScale';

describe('clampDesktopUiScale', () => {
	it('возвращает значение по умолчанию для мусора', () => {
		expect(clampDesktopUiScale(undefined)).toBe(DESKTOP_UI_SCALE_DEFAULT);
		expect(clampDesktopUiScale('')).toBe(DESKTOP_UI_SCALE_DEFAULT);
	});

	it('клампит в диапазон', () => {
		expect(clampDesktopUiScale(0.3)).toBe(DESKTOP_UI_SCALE_MIN);
		expect(clampDesktopUiScale(2)).toBe(DESKTOP_UI_SCALE_MAX);
		expect(clampDesktopUiScale(0.5)).toBe(0.5);
		expect(clampDesktopUiScale(1)).toBe(1);
		expect(clampDesktopUiScale(0.9)).toBe(0.9);
	});
});
