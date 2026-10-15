/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared props for Desktop Settings expansion cards.
 *
 * Invariants:
 * - —
 *
 * Related:
 * - `DesktopSettingsExpansionSection.tsx`
 */

import type { Dispatch, SetStateAction } from 'react';
import type { SettingsNavigateTarget } from '../../../utils/desktopSettingsStorageMapNavigation';
import type { DesktopExpansionSettings } from '../../../types/desktopExpansion.types';
import type { SettingsCenterVirtualDesktopRow } from '../../../types/desktopSettingsCenterBridge.types';
import type {
	DesktopItem,
	WidgetsPanelPosition,
} from '../../../types/desktop.types';
import type {
	DesktopSettingsShellHelpers,
	DesktopSettingsWorkspaceProfilesShellContext,
	SavedFilterContentShortcutDraftState,
} from '../desktopSettingsShared.types';

export type ExpansionSettingsSectionProps = {
	anchorId: string;
	expansionSettings: DesktopExpansionSettings;
	shell: DesktopSettingsShellHelpers;
	onBringWindowsToWorkArea?: () => void;
	workspaceProfileEditorContext?: {
		virtualDesktops: SettingsCenterVirtualDesktopRow[];
		globalWallpaper: string;
	};
	workspaceProfilesShellContext?: DesktopSettingsWorkspaceProfilesShellContext;
	profileAppCatalog: DesktopItem[];
	showWidgetsPanel: boolean;
	onShowWidgetsPanelChange: (value: boolean) => void;
	widgetsPanelPosition: WidgetsPanelPosition;
	onWidgetsPanelPositionChange: (value: WidgetsPanelPosition) => void;
	compactWidgets: boolean;
	onCompactWidgetsChange: (value: boolean) => void;
	onStorageMapFieldNavigate?: (target: SettingsNavigateTarget) => void;
	savedFilterShortcutDraft: SavedFilterContentShortcutDraftState;
	setSavedFilterShortcutDraft: Dispatch<
		SetStateAction<SavedFilterContentShortcutDraftState>
	>;
};

export type ExpansionCardBaseProps = Pick<
	ExpansionSettingsSectionProps,
	'expansionSettings' | 'shell' | 'onStorageMapFieldNavigate'
>;
