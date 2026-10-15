/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Validate runtime disabled-reasons collapsing logic used by Desktop hint card.
 *
 * Invariants:
 * - Entries with the same reason are grouped into one line.
 * - Action labels keep their original order inside grouped output.
 * - Empty/whitespace hints are ignored.
 *
 * Related:
 * - `pages/Desktop/components/RuntimeDisabledActionsHintCard.tsx`
 * - `pages/Kirs/KirsPage.tsx`
 * - `features/site-studio/desktop/components/SiteStudioRuntimePanel.tsx`
 */
import { describe, expect, it } from 'vitest';
import {
	collapseRuntimeDisabledHints,
	loadRuntimeHintsExpandedPreference,
	saveRuntimeHintsExpandedPreference,
} from './RuntimeDisabledActionsHintCard';

describe('collapseRuntimeDisabledHints', () => {
	it('groups multiple actions with the same reason into one line', () => {
		const collapsed = collapseRuntimeDisabledHints([
			'Подготовить сайт: Операция уже выполняется.',
			'Запустить сайт: Операция уже выполняется.',
			'Обновить сайт: Операция уже выполняется.',
		]);

		expect(collapsed).toEqual([
			'Подготовить сайт / Запустить сайт / Обновить сайт: Операция уже выполняется.',
		]);
	});

	it('keeps distinct reasons as separate lines', () => {
		const collapsed = collapseRuntimeDisabledHints([
			'Запустить сайт: Сайт уже запущен.',
			'Поставить на паузу: Операция уже выполняется.',
			'Обновить сайт: Сначала запустите сайт, затем обновляйте его.',
		]);

		expect(collapsed).toEqual([
			'Запустить сайт: Сайт уже запущен.',
			'Поставить на паузу: Операция уже выполняется.',
			'Обновить сайт: Сначала запустите сайт, затем обновляйте его.',
		]);
	});

	it('ignores empty hints and supports reason-only entries', () => {
		const collapsed = collapseRuntimeDisabledHints([
			'',
			'   ',
			'Сначала создайте инстанс сайта для проекта.',
		]);

		expect(collapsed).toEqual(['Сначала создайте инстанс сайта для проекта.']);
	});
});

describe('runtime hints preference persistence', () => {
	it('returns false when storage key is missing', () => {
		expect(loadRuntimeHintsExpandedPreference('')).toBe(false);
		expect(loadRuntimeHintsExpandedPreference(undefined)).toBe(false);
	});

	it('persists expanded flag in session storage', () => {
		const key = 'runtime.hints.preference.test';
		window.sessionStorage.removeItem(key);

		expect(loadRuntimeHintsExpandedPreference(key)).toBe(false);

		saveRuntimeHintsExpandedPreference(key, true);
		expect(loadRuntimeHintsExpandedPreference(key)).toBe(true);

		saveRuntimeHintsExpandedPreference(key, false);
		expect(loadRuntimeHintsExpandedPreference(key)).toBe(false);
	});
});
