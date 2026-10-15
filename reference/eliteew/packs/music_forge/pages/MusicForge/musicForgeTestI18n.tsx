/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Vitest render helper with Russian `desktopUi` namespace for MusicForge tests.
 *
 * Invariants:
 * - Test-only; not imported from production MusicForge surfaces.
 *
 * Related:
 * - src/pages/MusicForge/__tests__/*
 */

import { render, type RenderOptions } from '@testing-library/react';
import i18n from 'i18next';
import type { ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import ruDesktopUi from '@/i18n/locales/ru/desktopUi.json';

const musicForgeTestI18n = i18n.createInstance();

musicForgeTestI18n.use(initReactI18next).init({
	lng: 'ru',
	fallbackLng: 'ru',
	initImmediate: false,
	resources: {
		ru: {
			desktopUi: ruDesktopUi,
		},
	},
	defaultNS: 'desktopUi',
	interpolation: { escapeValue: false },
});

export function renderMusicForge(
	ui: ReactElement,
	options?: Omit<RenderOptions, 'wrapper'>
) {
	return render(ui, {
		wrapper: ({ children }) => (
			<I18nextProvider i18n={musicForgeTestI18n}>{children}</I18nextProvider>
		),
		...options,
	});
}
