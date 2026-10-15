/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Props for shell-tab body clusters under `settings/expansion/`.
 *
 * Invariants:
 * - Mirrors `DesktopSettingsShellTab` body props without scroll-nav helpers.
 *
 * Related:
 * - `DesktopSettingsExpansionShellCluster.tsx`
 * - `DesktopSettingsShellTab.tsx`
 */

import type { Dispatch, SetStateAction } from 'react';
import type { DesktopWidgetsStyle } from '@/types/profile';
import type { WidgetsPanelPosition } from '../../../types/desktop.types';
import type { DesktopExpansionSettings } from '../../../types/desktopExpansion.types';
import type { DesktopSettingsCenterBridge } from '../../../types/desktopSettingsCenterBridge.types';
import type { SettingsNavigateTarget } from '../../../utils/desktopSettingsStorageMapNavigation';
import type {
	DesktopSettingsShellHelpers,
	DesktopSettingsVisualLabels,
	DesktopSettingsWorkspaceProfilesShellContext,
	SavedFilterContentShortcutDraftState,
} from '../desktopSettingsShared.types';

export type DesktopSettingsExpansionShellClusterProps = {
	desktopOpenAppsMaximized: boolean;
	onDesktopOpenAppsMaximizedChange: (value: boolean) => void;
	desktopFloatingWidgetVisible: boolean;
	onDesktopFloatingWidgetVisibleChange: (value: boolean) => void;
	desktopWidgetsStyle: DesktopWidgetsStyle;
	onDesktopWidgetsStyleChange: (value: DesktopWidgetsStyle) => void;
	showWidgetsPanel: boolean;
	onShowWidgetsPanelChange: (value: boolean) => void;
	widgetsPanelPosition: WidgetsPanelPosition;
	onWidgetsPanelPositionChange: (value: WidgetsPanelPosition) => void;
	compactWidgets: boolean;
	onCompactWidgetsChange: (value: boolean) => void;
	expansionSettings: DesktopExpansionSettings;
	settingsCenterBridge: DesktopSettingsCenterBridge;
	shell: DesktopSettingsShellHelpers;
	visualLabels: DesktopSettingsVisualLabels;
	workspaceProfilesShellContext?: DesktopSettingsWorkspaceProfilesShellContext;
	onStorageMapFieldNavigate?: (target: SettingsNavigateTarget) => void;
	savedFilterShortcutDraft: SavedFilterContentShortcutDraftState;
	setSavedFilterShortcutDraft: Dispatch<
		SetStateAction<SavedFilterContentShortcutDraftState>
	>;
	onScrollToShellAnchor?: (domId: string) => void;
};
