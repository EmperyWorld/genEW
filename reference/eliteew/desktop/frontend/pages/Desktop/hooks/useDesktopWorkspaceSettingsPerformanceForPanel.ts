/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Merge session performance bridge with profile-backed Performance tab toggles.
 *
 * Invariants:
 * - Respects personalization staging via `deferVisualPersistRef` for backdrop blur PATCH.
 *
 * Related:
 * - `DesktopWorkspaceContent.tsx`, `useDesktopWorkspaceShellSettingsClusterInput.ts`
 */

import { useMemo, type MutableRefObject } from 'react';
import type { UserPreferencesAppContextValue } from '../../../contexts/UserPreferencesAppContext';
import profileService from '../../../services/profileService';
import type { DesktopShellSettingsBridgeValue } from '../context/DesktopShellSettingsBridgeContext';
import type { DesktopWorkspaceVisualPreferenceState } from './useDesktopWorkspaceVisualProfileBridge';

export type UseDesktopWorkspaceSettingsPerformanceForPanelParams = {
	settingsPerformanceForPanel: DesktopShellSettingsBridgeValue['performance'];
	preferencesApp: UserPreferencesAppContextValue | null;
	desktopReduceBackdropBlur: boolean;
	deferVisualPersistRef: MutableRefObject<boolean>;
	updateDesktopVisualPreferences: (
		updates: Partial<DesktopWorkspaceVisualPreferenceState>,
		options?: { persist?: boolean }
	) => void | Promise<void>;
	withProfileUiSaveIndicator: (fn: () => Promise<void>) => Promise<void>;
};

export function useDesktopWorkspaceSettingsPerformanceForPanel(
	params: UseDesktopWorkspaceSettingsPerformanceForPanelParams
): DesktopShellSettingsBridgeValue['performance'] {
	const {
		settingsPerformanceForPanel,
		preferencesApp,
		desktopReduceBackdropBlur,
		deferVisualPersistRef,
		updateDesktopVisualPreferences,
		withProfileUiSaveIndicator,
	} = params;

	return useMemo(
		(): DesktopShellSettingsBridgeValue['performance'] => ({
			...settingsPerformanceForPanel,
			animationsEnabled:
				preferencesApp?.preferences?.ui?.animations_enabled !== false,
			onAnimationsEnabledChange: async (next: boolean) => {
				if (!preferencesApp?.preferences) return;
				const uiBase = preferencesApp.preferences.ui ?? {};
				await withProfileUiSaveIndicator(async () => {
					const updated = await profileService.updatePreferences({
						ui: { ...uiBase, animations_enabled: next },
					});
					await preferencesApp.refresh?.(updated);
				});
			},
			reduceBackdropBlurEnabled: desktopReduceBackdropBlur === true,
			onReduceBackdropBlurChange: async (next: boolean) => {
				await updateDesktopVisualPreferences(
					{ desktop_reduce_backdrop_blur: next },
					{
						persist: deferVisualPersistRef.current !== true,
					}
				);
			},
		}),
		[
			settingsPerformanceForPanel,
			preferencesApp,
			desktopReduceBackdropBlur,
			deferVisualPersistRef,
			updateDesktopVisualPreferences,
			withProfileUiSaveIndicator,
		]
	);
}
