/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared types for Desktop Settings Center tabs and bridge props.
 *
 * Invariants:
 * - Tab ids match `DesktopControlCenterTab` union.
 *
 * Related:
 * - `DesktopSettingsPanel.tsx`, `settings/*Tab.tsx`
 */

import type { ComponentType, SVGProps } from 'react';
import type { DesktopIconStyle, DesktopWindowStyle } from '@/types/profile';
import type { WindowState } from '../../types/desktop.types';

export type ThemeMode = 'dark' | 'light' | 'auto';
export type IconSize = 'small' | 'medium' | 'large';
export type GridStep = 'small' | 'medium' | 'large';

export type DesktopControlCenterTab =
	| 'personalize'
	| 'icons'
	| 'chrome'
	| 'shell'
	| 'performance';

export type TabId = DesktopControlCenterTab;

/** Stable all-tab order for storage maps, lazy prefetch, and legacy deep links. */
export const DESKTOP_SETTINGS_TAB_ORDER: readonly TabId[] = [
	'personalize',
	'icons',
	'chrome',
	'shell',
	'performance',
] as const;

/** Top-level Settings Center navigation, ordered for the everyday personalize flow. */
export const PRIMARY_TAB_ORDER: readonly TabId[] = [
	'personalize',
	'icons',
	'chrome',
] as const;

/** Rare desktop controls are intentionally disclosed behind the comfort section. */
export const ADVANCED_TAB_IDS: readonly TabId[] = [
	'shell',
	'performance',
] as const;

export type DesktopSettingsShellHelpers = {
	windowStyle: DesktopWindowStyle;
	segmentClusterClass: string;
	segmentTabClass: (active: boolean) => string;
	checkboxClass: string;
	statTileClass: string;
};

export type SavedFilterContentShortcutDraftState = {
	label: string;
	searchQuery: string;
	filterType: string;
	filterVisibility: string;
	filterCompanyId: string;
	filterProjectId: string;
	filterFolderId: string;
	filesBrowseMode: '' | 'catalog' | 'explorer' | 'all_files';
	explorerFolderTarget: string;
};

export type DesktopSettingsVisualLabels = {
	iconSize: Record<IconSize, string>;
	gridStep: Record<GridStep, string>;
	windowStyle: Record<DesktopWindowStyle, string>;
	windowStyleDesc: Record<DesktopWindowStyle, string>;
	iconStyle: Record<DesktopIconStyle, string>;
	iconStyleDesc: Record<DesktopIconStyle, string>;
};

export type DesktopSettingsTabMeta = {
	id: TabId;
	label: string;
	description: string;
	Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

/** Live window context for workspace profile cards in shell tab. */
export type DesktopSettingsWorkspaceProfilesShellContext = {
	windows: WindowState[];
	getWindowsOnDesktop: (desktopId: string) => string[] | undefined;
	activeDesktopId: string;
};
