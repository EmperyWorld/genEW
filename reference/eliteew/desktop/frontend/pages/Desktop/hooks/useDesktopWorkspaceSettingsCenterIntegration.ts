/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Settings Center bridge + personalization pack handlers extracted from `DesktopWorkspaceContent`.
 *
 * Invariants:
 * - Must run under `DesktopTaskbarShellPrefsProvider` (bridge reads taskbar shell prefs).
 * - `deferVisualPersistRef` mirrors personalization staging — no remote PATCH while staging.
 *
 * Related:
 * - `useDesktopSettingsCenterBridge.ts`, `DesktopWorkspaceContent.tsx`
 */

import { notify as toast } from '@/notifications';
import type { TFunction } from 'i18next';
import { useCallback, useMemo, type MutableRefObject } from 'react';
import { builtinDesktopWallpaperPath } from '../constants/wallpapers';
import type { ExpansionShellSlicePatch } from '../services/desktopApi';
import {
	flushShellStatePipelineNow,
	scheduleShellStateMutation,
} from '../utils/desktopShellStateMutationPipeline';
import type {
	DesktopUserVisualStylePreset,
	DesktopExpansionSettings,
} from '../types/desktopExpansion.types';
import type { DesktopConfig, WindowState } from '../types/desktop.types';
import type { DesktopSettingsCenterBridge } from '../types/desktopSettingsCenterBridge.types';
import { clampDesktopPanelOpacity } from '@/types/profile';
import { clampDesktopUiScale } from '../utils/desktopUiScale';
import { parseDesktopAccentFromApi } from '../utils/desktopAccentColor';
import {
	buildDesktopVisualProfilePackJson,
	parseDesktopVisualProfilePack,
} from '../utils/desktopVisualProfilePack';
import { enqueueDesktopPersistShellPatch } from '../utils/desktopPersistPatchQueue';
import type { DesktopWorkspaceVisualPreferenceState } from './useDesktopWorkspaceVisualProfileBridge';
import {
	useDesktopSettingsCenterBridge,
	type UseDesktopSettingsCenterBridgeParams,
} from './useDesktopSettingsCenterBridge';

type DesktopConfigVisualActions = {
	setTheme: (theme: DesktopConfig['theme']) => void;
	setWallpaper: (wallpaper: string) => void;
	setAccent: (accent: DesktopConfig['accent']) => void;
	setAccentCustomHex: (hex: string) => void;
};

export type UseDesktopWorkspaceSettingsCenterIntegrationParams = {
	bridge: Omit<
		UseDesktopSettingsCenterBridgeParams,
		't' | 'clientLanguage' | 'expansionSettings'
	> & {
		expansionSettings: DesktopExpansionSettings;
		t: TFunction;
		clientLanguage: string;
	};
	personalization: {
		config: DesktopConfig | null | undefined;
		desktopVisualPreferences: DesktopWorkspaceVisualPreferenceState;
		deferVisualPersistRef: MutableRefObject<boolean>;
		actions: DesktopConfigVisualActions;
		updateConfig: (
			patch: Partial<DesktopConfig>,
			options?: { persistRemote?: boolean }
		) => Promise<void> | void;
		updateDesktopVisualPreferences: (
			updates: Partial<DesktopWorkspaceVisualPreferenceState>,
			options?: { persist?: boolean }
		) => void | Promise<void>;
		updateDesktopWallpaper: (id: string, wallpaper: string) => void;
		activeDesktopId: string;
		persistSubjectForQueue: string | null | undefined;
	};
	workspaceProfilesShellContext: {
		windows: WindowState[];
		getWindowsOnDesktop: (desktopId: string) => string[];
		activeDesktopId: string;
	};
};

export type UseDesktopWorkspaceSettingsCenterIntegrationResult = {
	settingsCenterBridge: DesktopSettingsCenterBridge;
	workspaceProfilesShellContext: UseDesktopWorkspaceSettingsCenterIntegrationParams['workspaceProfilesShellContext'];
	clearActiveDesktopWallpaperOverride: () => void;
	onApplyUserVisualStylePreset: (
		preset: DesktopUserVisualStylePreset
	) => Promise<void>;
	onExportPersonalizationPackJson: () => string;
	onImportPersonalizationPackJson: (
		json: string
	) => Promise<
		{ ok: true; shellSlicesApplied: boolean } | { ok: false; error: string }
	>;
};

export function useDesktopWorkspaceSettingsCenterIntegration(
	params: UseDesktopWorkspaceSettingsCenterIntegrationParams
): UseDesktopWorkspaceSettingsCenterIntegrationResult {
	const { bridge, personalization, workspaceProfilesShellContext } = params;
	const {
		config,
		desktopVisualPreferences,
		deferVisualPersistRef,
		actions,
		updateConfig,
		updateDesktopVisualPreferences,
		updateDesktopWallpaper,
		activeDesktopId,
		persistSubjectForQueue,
	} = personalization;
	const { expansionSettings, t, clientLanguage, ...bridgeRest } = bridge;

	const settingsCenterBridge = useDesktopSettingsCenterBridge({
		...bridgeRest,
		expansionSettings,
		t,
		clientLanguage,
	});

	const clearActiveDesktopWallpaperOverride = useCallback(() => {
		updateDesktopWallpaper(activeDesktopId, '');
	}, [activeDesktopId, updateDesktopWallpaper]);

	const onApplyUserVisualStylePreset = useCallback(
		async (preset: DesktopUserVisualStylePreset) => {
			const wall =
				preset.wallpaperRef != null &&
				String(preset.wallpaperRef).trim().length > 0
					? String(preset.wallpaperRef)
					: builtinDesktopWallpaperPath(preset.wallpaperIndex);
			clearActiveDesktopWallpaperOverride();
			actions.setTheme(preset.theme);
			actions.setWallpaper(wall);

			const patch: Partial<DesktopConfig> = {
				theme: preset.theme,
				wallpaper: wall,
			};

			if (!preset.accentFollows && preset.accent) {
				const parsed = parseDesktopAccentFromApi(String(preset.accent));
				if (parsed.id === 'custom') {
					actions.setAccentCustomHex(parsed.customHex);
					actions.setAccent('custom');
					patch.accent = parsed.customHex;
				} else {
					actions.setAccent(parsed.id);
					patch.accent = parsed.id;
				}
			}

			const persistRemote = deferVisualPersistRef.current !== true;
			await updateConfig(patch, { persistRemote }).catch(() => {});

			const visPatch: Partial<DesktopWorkspaceVisualPreferenceState> = {
				desktop_accent_follows_window_style: preset.accentFollows,
				desktop_window_style: preset.windowStyle,
				desktop_taskbar_style: preset.taskbarStyle,
				desktop_icon_style: preset.iconStyle,
				desktop_widgets_style: preset.widgetsStyle,
			};
			if (preset.desktopPanelOpacity != null) {
				visPatch.desktop_panel_opacity = clampDesktopPanelOpacity(
					preset.desktopPanelOpacity
				);
			}
			if (preset.desktopUiScale != null) {
				visPatch.desktop_ui_scale = clampDesktopUiScale(preset.desktopUiScale);
			}
			if (preset.desktopSceneDepth != null) {
				visPatch.desktop_scene_depth = preset.desktopSceneDepth;
			}
			if (preset.desktopFontBody != null) {
				visPatch.desktop_font_body = preset.desktopFontBody;
			}
			if (preset.desktopFontDisplay != null) {
				visPatch.desktop_font_display = preset.desktopFontDisplay;
			}
			if (preset.desktopWallpaperCrossfadeEnabled != null) {
				visPatch.desktop_wallpaper_crossfade_enabled =
					preset.desktopWallpaperCrossfadeEnabled;
			}
			if (preset.desktopStyledTooltips != null) {
				visPatch.desktop_styled_tooltips = preset.desktopStyledTooltips;
			}

			await updateDesktopVisualPreferences(visPatch, {
				persist: persistRemote,
			});
		},
		[
			actions,
			clearActiveDesktopWallpaperOverride,
			deferVisualPersistRef,
			updateConfig,
			updateDesktopVisualPreferences,
		]
	);

	const onExportPersonalizationPackJson = useCallback(() => {
		if (!config) return '';
		const presetRows = expansionSettings.windowLayoutPresets.map((preset) =>
			JSON.parse(JSON.stringify(preset))
		) as Record<string, unknown>[];
		const profilesPlain = expansionSettings.workspaceProfiles.map((profile) =>
			JSON.parse(JSON.stringify(profile))
		) as Record<string, unknown>[];
		return buildDesktopVisualProfilePackJson({
			config,
			visual: desktopVisualPreferences,
			shell: {
				workspace_profiles:
					profilesPlain.length > 0
						? { profiles: profilesPlain.slice(0, 24) }
						: undefined,
				window_layout_presets:
					presetRows.length > 0 ? presetRows.slice(0, 96) : undefined,
			},
		});
	}, [
		config,
		desktopVisualPreferences,
		expansionSettings.windowLayoutPresets,
		expansionSettings.workspaceProfiles,
	]);

	const onImportPersonalizationPackJson = useCallback(
		async (json: string) => {
			const parsed = parseDesktopVisualProfilePack(json);
			if (!parsed.ok) {
				return { ok: false as const, error: parsed.error };
			}
			const { config: cfg, visual, shell } = parsed.data;
			clearActiveDesktopWallpaperOverride();
			actions.setTheme(cfg.theme);
			actions.setWallpaper(cfg.wallpaper);
			if (cfg.accent != null && String(cfg.accent).trim().length > 0) {
				const p = parseDesktopAccentFromApi(String(cfg.accent));
				if (p.id === 'custom') {
					actions.setAccentCustomHex(p.customHex);
					actions.setAccent('custom');
				} else {
					actions.setAccent(p.id);
				}
			}
			const persistRemote = deferVisualPersistRef.current !== true;
			await updateConfig(
				{
					theme: cfg.theme,
					wallpaper: cfg.wallpaper,
					...(cfg.accent != null && String(cfg.accent).trim().length > 0
						? { accent: cfg.accent }
						: {}),
					icon_size: cfg.icon_size,
					snap_to_grid: cfg.snap_to_grid,
					grid_step: cfg.grid_step,
				},
				{ persistRemote }
			).catch(() => {});
			await updateDesktopVisualPreferences(visual, { persist: persistRemote });

			const shellPatch: ExpansionShellSlicePatch = {};
			if (shell?.workspace_profiles != null) {
				shellPatch.workspace_profiles =
					shell.workspace_profiles as ExpansionShellSlicePatch['workspace_profiles'];
			}
			if (shell?.window_layout_presets != null) {
				shellPatch.window_layout_presets = shell.window_layout_presets;
			}
			let shellSlicesApplied = false;
			if (
				shellPatch.workspace_profiles != null ||
				shellPatch.window_layout_presets != null
			) {
				try {
					const shellPatchRecord = shellPatch as Record<string, unknown>;
					scheduleShellStateMutation({
						source: 'expansion',
						merge: () => shellPatchRecord,
						immediate: true,
					});
					await flushShellStatePipelineNow('expansion');
					await expansionSettings.refresh();
					shellSlicesApplied = true;
				} catch (e) {
					if (persistSubjectForQueue) {
						enqueueDesktopPersistShellPatch(
							persistSubjectForQueue,
							shellPatch as Record<string, unknown>
						);
					}
					const msg =
						e instanceof Error ? e.message : 'desktop shell-state failed';
					toast.error(t('settingsPanel.shellPatchFailedToast'), msg);
				}
			}

			return { ok: true as const, shellSlicesApplied };
		},
		[
			actions,
			clearActiveDesktopWallpaperOverride,
			deferVisualPersistRef,
			expansionSettings,
			persistSubjectForQueue,
			t,
			updateConfig,
			updateDesktopVisualPreferences,
		]
	);

	const {
		windows: workspaceWindows,
		getWindowsOnDesktop,
		activeDesktopId: workspaceActiveDesktopId,
	} = workspaceProfilesShellContext;

	const workspaceProfilesShellContextMemo = useMemo(
		() => ({
			windows: workspaceWindows,
			getWindowsOnDesktop,
			activeDesktopId: workspaceActiveDesktopId,
		}),
		[workspaceActiveDesktopId, getWindowsOnDesktop, workspaceWindows]
	);

	return {
		settingsCenterBridge,
		workspaceProfilesShellContext: workspaceProfilesShellContextMemo,
		clearActiveDesktopWallpaperOverride,
		onApplyUserVisualStylePreset,
		onExportPersonalizationPackJson,
		onImportPersonalizationPackJson,
	};
}
