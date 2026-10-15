/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Typed prop groups for T37 personalization / wallpaper / theme cluster in DesktopWorkspaceContent.
 *
 * Invariants:
 * - Early cluster runs before chrome state (effectiveTheme); staging actions run after visual profile bridge.
 * - deferVisualPersistRef mirrors personalizationStagingActive for remote PATCH deferral.
 *
 * Related:
 * - hooks/useDesktopWorkspacePersonalizationThemeCluster.ts
 * - documentation/product/desktop/DESKTOP-WORKSPACE-CONTENT-REFACTOR-PLAN.md
 */

import type { MutableRefObject } from 'react';
import type {
	DesktopState,
	useDesktopStateActions,
} from '../context/DesktopStateContext';
import type { DesktopConfig } from '../types/desktop.types';
import type { UseDesktopStorageReturn } from '../hooks/useDesktopStorage';
import type { DesktopWorkspaceVisualPreferenceState } from '../hooks/useDesktopWorkspaceVisualProfileBridge';
import type { DesktopWelcomeCompleteOptions } from '../components/DesktopWelcomeScreen';

type DesktopConfigVisualActions = ReturnType<typeof useDesktopStateActions>;

export type DesktopWorkspacePersonalizationThemeClusterEarlyInput = {
	config: UseDesktopStorageReturn['config'];
	updateConfig: UseDesktopStorageReturn['updateConfig'];
	storageLoading: boolean;
	state: Pick<
		DesktopState,
		| 'theme'
		| 'accent'
		| 'accentCustomHex'
		| 'wallpaper'
		| 'showWP'
		| 'showNF'
		| 'showWelcome'
	>;
	actions: DesktopConfigVisualActions;
};

export type PersonalizationStagingBaseline = {
	config: DesktopConfig;
	visual: DesktopWorkspaceVisualPreferenceState;
};

export type DesktopWorkspacePersonalizationThemeClusterEarlyResult = {
	deferVisualPersistRef: MutableRefObject<boolean>;
	personalizationStagingActive: boolean;
	personalizationBaselineRef: MutableRefObject<PersonalizationStagingBaseline | null>;
	setPersonalizationStagingActive: (active: boolean) => void;
	wallpaper: string;
	setWallpaper: (wallpaper: string) => void;
	showWP: boolean;
	setShowWP: (value: boolean) => void;
	showNF: boolean;
	setShowNF: (value: boolean) => void;
	showWelcome: boolean;
	setShowWelcome: (value: boolean) => void;
	onWelcomeComplete: (options: DesktopWelcomeCompleteOptions) => void;
	theme: DesktopConfig['theme'];
	setTheme: (theme: DesktopConfig['theme']) => void;
	effectiveTheme: 'dark' | 'light';
	desktopEmbeddedAppTheme: string;
	desktopThemeVars: Record<string, string>;
	accent: DesktopConfig['accent'];
	accentCustomHex: string;
	setAccentChoice: (accent: DesktopConfig['accent']) => void;
	onAccentCustomHexChange: (hex: string) => void;
	toggleExplicitTheme: () => void;
	applyCuratedDesktopConfigPreset: (
		set: import('../constants/desktopCuratedStyleSets').DesktopCuratedStyleSet
	) => void | Promise<void>;
};

export type DesktopWorkspacePersonalizationStagingActionsInput = {
	config: DesktopConfig | null | undefined;
	applyDesktopConfigSnapshotLocal: UseDesktopStorageReturn['applyDesktopConfigSnapshotLocal'];
	updateConfig: UseDesktopStorageReturn['updateConfig'];
	desktopVisualPreferences: DesktopWorkspaceVisualPreferenceState;
	desktopVisualPreferencesRef: MutableRefObject<DesktopWorkspaceVisualPreferenceState>;
	setDesktopVisualPreferences: (
		value: DesktopWorkspaceVisualPreferenceState
	) => void;
	updateDesktopVisualPreferences: (
		updates: Partial<DesktopWorkspaceVisualPreferenceState>,
		options?: { persist?: boolean }
	) => void | Promise<void>;
	setPersonalizationStagingActive: (active: boolean) => void;
	personalizationBaselineRef: MutableRefObject<PersonalizationStagingBaseline | null>;
};

export type DesktopWorkspacePersonalizationStagingActionsResult = {
	startPersonalizationStaging: () => void;
	cancelPersonalizationStaging: () => void;
	commitPersonalizationStaging: () => Promise<void>;
};
