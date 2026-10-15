/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * i18n label builders for Desktop Settings Center visual pickers.
 *
 * Invariants:
 * - Keys mirror `desktopUi.json` settings* namespaces.
 *
 * Related:
 * - `desktopSettingsShared.types.ts`
 */

import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import {
	DESKTOP_TASKBAR_STYLE_KEYS,
	type DesktopIconOnlyStyle,
	type DesktopIconStyle,
	type DesktopWindowStyle,
} from '@/types/profile';
import { WALLPAPER_COUNT } from '../../constants/wallpapers';
import type {
	DesktopSettingsVisualLabels,
	GridStep,
	IconSize,
	ThemeMode,
} from './desktopSettingsShared.types';

export function buildDesktopSettingsThemeModeOptions(
	t: TFunction<'desktopUi'>
): {
	id: ThemeMode;
	name: string;
	description: string;
	icon: ReactNode;
	preview: string;
}[] {
	return [
		{
			id: 'dark',
			name: t('settingsThemeMode.darkName'),
			description: t('settingsThemeMode.darkDesc'),
			icon: <MoonIcon className="w-4 h-4" />,
			preview:
				'bg-linear-to-r from-slate-950 via-slate-900 to-zinc-950 shadow-[inset_0_0_0_1px_rgb(var(--desktop-fg-primary-rgb)/0.06)]',
		},
		{
			id: 'light',
			name: t('settingsThemeMode.lightName'),
			description: t('settingsThemeMode.lightDesc'),
			icon: <SunIcon className="w-4 h-4" />,
			preview:
				'bg-linear-to-r from-neutral-50 via-white to-zinc-100 shadow-[inset_0_0_0_1px_rgb(var(--desktop-fg-primary-rgb)/0.08)]',
		},
		{
			id: 'auto',
			name: t('settingsThemeMode.autoName'),
			description: t('settingsThemeMode.autoDesc'),
			icon: <SunIcon className="w-4 h-4" />,
			preview:
				'bg-linear-to-r from-slate-900 via-zinc-500 to-amber-50 shadow-[inset_0_0_0_1px_rgb(var(--desktop-fg-primary-rgb)/0.08)]',
		},
	];
}

export function buildSettingsIconSizeLabels(
	t: TFunction<'desktopUi'>
): Record<IconSize, string> {
	return {
		small: t('settingsIconSize.small'),
		medium: t('settingsIconSize.medium'),
		large: t('settingsIconSize.large'),
	};
}

export function buildSettingsGridStepLabels(
	t: TFunction<'desktopUi'>
): Record<GridStep, string> {
	return {
		small: t('settingsGridStep.small'),
		medium: t('settingsGridStep.medium'),
		large: t('settingsGridStep.large'),
	};
}

export function buildDesktopWindowStyleLabels(
	t: TFunction<'desktopUi'>
): Record<DesktopWindowStyle, string> {
	const o = {} as Record<DesktopWindowStyle, string>;
	for (const k of DESKTOP_TASKBAR_STYLE_KEYS) {
		o[k] = t(`settingsWindowStyle.${k}.name`);
	}
	return o;
}

export function buildDesktopWindowStyleDescriptions(
	t: TFunction<'desktopUi'>
): Record<DesktopWindowStyle, string> {
	const o = {} as Record<DesktopWindowStyle, string>;
	for (const k of DESKTOP_TASKBAR_STYLE_KEYS) {
		o[k] = t(`settingsWindowStyle.${k}.desc`);
	}
	return o;
}

export function buildDesktopIconOnlyStyleLabels(
	t: TFunction<'desktopUi'>
): Record<DesktopIconOnlyStyle, string> {
	return {
		prism: t('settingsIconOnlyStyle.prism.name'),
		mercury: t('settingsIconOnlyStyle.mercury.name'),
		vhs: t('settingsIconOnlyStyle.vhs.name'),
		slate: t('settingsIconOnlyStyle.slate.name'),
		clay: t('settingsIconOnlyStyle.clay.name'),
		ember: t('settingsIconOnlyStyle.ember.name'),
	};
}

export function buildDesktopIconOnlyStyleDescriptions(
	t: TFunction<'desktopUi'>
): Record<DesktopIconOnlyStyle, string> {
	return {
		prism: t('settingsIconOnlyStyle.prism.desc'),
		mercury: t('settingsIconOnlyStyle.mercury.desc'),
		vhs: t('settingsIconOnlyStyle.vhs.desc'),
		slate: t('settingsIconOnlyStyle.slate.desc'),
		clay: t('settingsIconOnlyStyle.clay.desc'),
		ember: t('settingsIconOnlyStyle.ember.desc'),
	};
}

export function builtinWallpaperIndexFromStyle(style: string): number {
	const m = /^\/desktop-wallpapers\/(\d+)\.webp$/i.exec(style.trim());
	if (!m) return 1;
	const n = Number.parseInt(m[1], 10);
	if (!Number.isFinite(n)) return 1;
	return Math.min(WALLPAPER_COUNT, Math.max(1, n));
}

export function buildDesktopIconStyleLabels(
	t: TFunction<'desktopUi'>
): Record<DesktopIconStyle, string> {
	return {
		...buildDesktopWindowStyleLabels(t),
		...buildDesktopIconOnlyStyleLabels(t),
	};
}

export function buildDesktopIconStyleDescriptions(
	t: TFunction<'desktopUi'>
): Record<DesktopIconStyle, string> {
	return {
		...buildDesktopWindowStyleDescriptions(t),
		...buildDesktopIconOnlyStyleDescriptions(t),
	};
}

export function buildDesktopSettingsVisualLabels(
	t: TFunction<'desktopUi'>
): DesktopSettingsVisualLabels {
	return {
		iconSize: buildSettingsIconSizeLabels(t),
		gridStep: buildSettingsGridStepLabels(t),
		windowStyle: buildDesktopWindowStyleLabels(t),
		windowStyleDesc: buildDesktopWindowStyleDescriptions(t),
		iconStyle: buildDesktopIconStyleLabels(t),
		iconStyleDesc: buildDesktopIconStyleDescriptions(t),
	};
}
