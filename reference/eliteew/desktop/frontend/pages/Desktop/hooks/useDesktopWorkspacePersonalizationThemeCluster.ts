/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * T37 cluster: personalization staging state, wallpaper welcome bridge, theme/accent wiring,
 * and late-bound staging commit/cancel callbacks for DesktopWorkspaceContent.
 *
 * Invariants:
 * - Early hook before chrome state (effectiveTheme); staging actions after visual profile bridge.
 * - deferVisualPersistRef.current tracks personalizationStagingActive for remote PATCH deferral.
 *
 * Related:
 * - types/desktopWorkspacePersonalizationThemeCluster.types.ts
 * - documentation/product/desktop/DESKTOP-WORKSPACE-CONTENT-REFACTOR-PLAN.md
 */

import { useCallback, useRef, useState } from 'react';
import type {
	DesktopWorkspacePersonalizationStagingActionsInput,
	DesktopWorkspacePersonalizationStagingActionsResult,
	DesktopWorkspacePersonalizationThemeClusterEarlyInput,
	DesktopWorkspacePersonalizationThemeClusterEarlyResult,
	PersonalizationStagingBaseline,
} from '../types/desktopWorkspacePersonalizationThemeCluster.types';
import {
	persistDesktopOnboardingDismissed,
	useDesktopWelcomeOnboarding,
} from './useDesktopWelcomeOnboarding';
import { useDesktopWorkspaceSurfaceWelcomeBridge } from './useDesktopWorkspaceSurfaceWelcomeBridge';
import { useDesktopWorkspaceThemeAccent } from './useDesktopWorkspaceThemeAccent';

export function useDesktopWorkspacePersonalizationThemeCluster(
	input: DesktopWorkspacePersonalizationThemeClusterEarlyInput
): DesktopWorkspacePersonalizationThemeClusterEarlyResult {
	const { config, updateConfig, storageLoading, state, actions } = input;

	const [personalizationStagingActive, setPersonalizationStagingActive] =
		useState(false);
	const personalizationBaselineRef =
		useRef<PersonalizationStagingBaseline | null>(null);
	const deferVisualPersistRef = useRef(false);
	deferVisualPersistRef.current = personalizationStagingActive;

	const {
		wallpaper,
		setWallpaper,
		showWP,
		setShowWP,
		showNF,
		setShowNF,
		showWelcome,
		setShowWelcome,
	} = useDesktopWorkspaceSurfaceWelcomeBridge({
		configWallpaper: config?.wallpaper,
		stateWallpaper: state.wallpaper,
		showWP: state.showWP,
		showNF: state.showNF,
		showWelcome: state.showWelcome,
		actions: {
			setWallpaper: actions.setWallpaper,
			setShowWP: actions.setShowWP,
			setShowNF: actions.setShowNF,
			setShowWelcome: actions.setShowWelcome,
		},
	});

	useDesktopWelcomeOnboarding({
		storageLoading,
		showWelcome,
		setShowWelcome,
	});

	const onWelcomeComplete = useCallback(
		(
			options: import('../components/DesktopWelcomeScreen').DesktopWelcomeCompleteOptions
		) => {
			setShowWelcome(false);
			if (options.dismissPermanently) {
				persistDesktopOnboardingDismissed();
			}
		},
		[setShowWelcome]
	);

	const {
		theme,
		setTheme,
		effectiveTheme,
		desktopEmbeddedAppTheme,
		desktopThemeVars,
		accent,
		accentCustomHex,
		setAccentChoice,
		onAccentCustomHexChange,
		toggleExplicitTheme,
		applyCuratedDesktopConfigPreset,
	} = useDesktopWorkspaceThemeAccent({
		config,
		updateConfig,
		state: {
			theme: state.theme,
			accent: state.accent,
			accentCustomHex: state.accentCustomHex,
			wallpaper: state.wallpaper,
		},
		actions: {
			setTheme: actions.setTheme,
			setAccent: actions.setAccent,
			setAccentCustomHex: actions.setAccentCustomHex,
			setWallpaper: actions.setWallpaper,
		},
		deferConfigPersistRef: deferVisualPersistRef,
	});

	return {
		deferVisualPersistRef,
		personalizationStagingActive,
		personalizationBaselineRef,
		setPersonalizationStagingActive,
		wallpaper,
		setWallpaper,
		showWP,
		setShowWP,
		showNF,
		setShowNF,
		showWelcome,
		setShowWelcome,
		onWelcomeComplete,
		theme,
		setTheme,
		effectiveTheme,
		desktopEmbeddedAppTheme,
		desktopThemeVars,
		accent,
		accentCustomHex,
		setAccentChoice,
		onAccentCustomHexChange,
		toggleExplicitTheme,
		applyCuratedDesktopConfigPreset,
	};
}

export function useDesktopWorkspacePersonalizationStagingActions(
	input: DesktopWorkspacePersonalizationStagingActionsInput
): DesktopWorkspacePersonalizationStagingActionsResult {
	const {
		config,
		applyDesktopConfigSnapshotLocal,
		updateConfig,
		desktopVisualPreferences,
		desktopVisualPreferencesRef,
		setDesktopVisualPreferences,
		updateDesktopVisualPreferences,
		setPersonalizationStagingActive,
		personalizationBaselineRef,
	} = input;

	const startPersonalizationStaging = useCallback(() => {
		if (!config) return;
		personalizationBaselineRef.current = {
			config: { ...config },
			visual: { ...desktopVisualPreferences },
		};
		setPersonalizationStagingActive(true);
	}, [
		config,
		desktopVisualPreferences,
		personalizationBaselineRef,
		setPersonalizationStagingActive,
	]);

	const cancelPersonalizationStaging = useCallback(() => {
		const b = personalizationBaselineRef.current;
		setPersonalizationStagingActive(false);
		personalizationBaselineRef.current = null;
		if (b?.config) applyDesktopConfigSnapshotLocal(b.config);
		if (b?.visual) setDesktopVisualPreferences(b.visual);
	}, [
		applyDesktopConfigSnapshotLocal,
		personalizationBaselineRef,
		setDesktopVisualPreferences,
		setPersonalizationStagingActive,
	]);

	const commitPersonalizationStaging = useCallback(async () => {
		if (!config) return;
		setPersonalizationStagingActive(false);
		personalizationBaselineRef.current = null;
		await updateConfig(
			{
				theme: config.theme,
				wallpaper: config.wallpaper,
				...(config.accent != null && String(config.accent).trim().length > 0
					? { accent: config.accent }
					: {}),
				icon_size: config.icon_size,
				snap_to_grid: config.snap_to_grid === true,
				grid_step:
					config.grid_step === 'small' || config.grid_step === 'large'
						? config.grid_step
						: 'medium',
			},
			{ persistRemote: true }
		).catch(() => {});
		await updateDesktopVisualPreferences(
			{ ...desktopVisualPreferencesRef.current },
			{ persist: true }
		);
	}, [
		config,
		desktopVisualPreferencesRef,
		personalizationBaselineRef,
		setPersonalizationStagingActive,
		updateConfig,
		updateDesktopVisualPreferences,
	]);

	return {
		startPersonalizationStaging,
		cancelPersonalizationStaging,
		commitPersonalizationStaging,
	};
}
