import {
	useCallback,
	type Dispatch,
	type MutableRefObject,
	type RefObject,
	type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { UserPreferencesAppContextValue } from '../../../contexts/UserPreferencesAppContext';
import profileService from '../../../services/profileService';
import type { UIPreferences } from '../../../types/profile';
import { clampDesktopPanelOpacity } from '../../../types/profile';
import { log } from '../../../utils/logger';
import type { DesktopConfig } from '../types/desktop.types';
import { clampDesktopUiScale } from '../utils/desktopUiScale';
import type { DesktopWorkspaceVisualPreferenceState } from './useDesktopWorkspaceVisualProfileBridge';

/** Debounce PATCH for panel opacity slider (avoids request storms / ERR_FAILED while dragging). */
const DESKTOP_PANEL_OPACITY_PERSIST_DEBOUNCE_MS = 450;

export function useDesktopWorkspaceAppearanceCallbacks(params: {
	setShowWP: (open: boolean) => void;
	updateConfig: (
		updates: Partial<DesktopConfig>,
		options?: { persistRemote?: boolean }
	) => Promise<void>;
	updateDesktopVisualPreferences: (
		updates: Partial<DesktopWorkspaceVisualPreferenceState>,
		options?: { persist?: boolean }
	) => void | Promise<void>;
	clearPanelOpacityPersistTimer: () => void;
	setDesktopVisualPreferences: Dispatch<
		SetStateAction<DesktopWorkspaceVisualPreferenceState>
	>;
	notifyDesktop: { error: (title: string, message: string) => void };
	preferencesApp: UserPreferencesAppContextValue | null;
	withProfileUiSaveIndicator: (fn: () => Promise<void>) => Promise<void>;
	serverUiPreferencesRef: MutableRefObject<UIPreferences>;
	desktopVisualPreferencesRef: MutableRefObject<DesktopWorkspaceVisualPreferenceState>;
	resolvedDesktopVisualPreferencesRef: MutableRefObject<DesktopWorkspaceVisualPreferenceState>;
	panelOpacityPersistTimerRef: MutableRefObject<number | null>;
	deferProfilePersistRef?: RefObject<boolean>;
}) {
	const { t } = useTranslation('desktopUi');
	const {
		setShowWP,
		updateConfig,
		updateDesktopVisualPreferences,
		clearPanelOpacityPersistTimer,
		setDesktopVisualPreferences,
		notifyDesktop,
		preferencesApp,
		withProfileUiSaveIndicator,
		serverUiPreferencesRef,
		desktopVisualPreferencesRef,
		resolvedDesktopVisualPreferencesRef,
		panelOpacityPersistTimerRef,
		deferProfilePersistRef,
	} = params;

	const persistDeferredRemote = useCallback(
		() => deferProfilePersistRef?.current !== true,
		[deferProfilePersistRef]
	);

	const openWallpaperFromDesktopSettings = useCallback(() => {
		setShowWP(true);
	}, [setShowWP]);

	const handleDesktopIconSizeChange = useCallback(
		(size: 'small' | 'medium' | 'large') => {
			updateConfig(
				{ icon_size: size },
				{ persistRemote: persistDeferredRemote() }
			).catch(() => {});
		},
		[persistDeferredRemote, updateConfig]
	);

	const handleDesktopSnapToGridChange = useCallback(
		(value: boolean) => {
			updateConfig(
				{ snap_to_grid: value },
				{ persistRemote: persistDeferredRemote() }
			).catch(() => {});
		},
		[persistDeferredRemote, updateConfig]
	);

	const handleDesktopGridStepChange = useCallback(
		(value: 'small' | 'medium' | 'large') => {
			updateConfig(
				{ grid_step: value },
				{ persistRemote: persistDeferredRemote() }
			).catch(() => {});
		},
		[persistDeferredRemote, updateConfig]
	);

	const handleDesktopIconStyleChange = useCallback(
		(value: UIPreferences['desktop_icon_style']) => {
			void updateDesktopVisualPreferences(
				{
					desktop_icon_style: value,
				},
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopTaskbarStyleChange = useCallback(
		(value: UIPreferences['desktop_taskbar_style']) => {
			void updateDesktopVisualPreferences(
				{
					desktop_taskbar_style: value,
				},
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopWindowStyleChange = useCallback(
		(value: UIPreferences['desktop_window_style']) => {
			void updateDesktopVisualPreferences(
				{
					desktop_window_style: value,
				},
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopAccentFollowsWindowStyleChange = useCallback(
		(value: boolean) => {
			void updateDesktopVisualPreferences(
				{
					desktop_accent_follows_window_style: value,
				},
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopFloatingWidgetVisibleChange = useCallback(
		(value: boolean) => {
			void updateDesktopVisualPreferences(
				{
					desktop_floating_widget_visible: value,
				},
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopOpenAppsMaximizedChange = useCallback(
		(value: boolean) => {
			void updateDesktopVisualPreferences(
				{
					desktop_open_apps_maximized: value,
				},
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopWidgetsStyleChange = useCallback(
		(value: UIPreferences['desktop_widgets_style']) => {
			void updateDesktopVisualPreferences(
				{
					desktop_widgets_style: value,
				},
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopUiScaleChange = useCallback(
		(value: number) => {
			void updateDesktopVisualPreferences(
				{
					desktop_ui_scale: clampDesktopUiScale(value),
				},
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopSceneDepthChange = useCallback(
		(value: UIPreferences['desktop_scene_depth']) => {
			void updateDesktopVisualPreferences(
				{ desktop_scene_depth: value },
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopFontBodyChange = useCallback(
		(value: UIPreferences['desktop_font_body']) => {
			void updateDesktopVisualPreferences(
				{ desktop_font_body: value },
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopFontDisplayChange = useCallback(
		(value: UIPreferences['desktop_font_display']) => {
			void updateDesktopVisualPreferences(
				{ desktop_font_display: value },
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopWallpaperCrossfadeChange = useCallback(
		(value: boolean) => {
			void updateDesktopVisualPreferences(
				{ desktop_wallpaper_crossfade_enabled: value },
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopStyledTooltipsChange = useCallback(
		(value: boolean) => {
			void updateDesktopVisualPreferences(
				{ desktop_styled_tooltips: value },
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopShellReduceMotionChange = useCallback(
		(value: boolean) => {
			void updateDesktopVisualPreferences(
				{ desktop_shell_reduce_motion: value },
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopShellParallaxEnabledChange = useCallback(
		(value: boolean) => {
			void updateDesktopVisualPreferences(
				{ desktop_shell_parallax_enabled: value },
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopShellParallaxIntensityChange = useCallback(
		(value: UIPreferences['desktop_shell_parallax_intensity']) => {
			void updateDesktopVisualPreferences(
				{ desktop_shell_parallax_intensity: value },
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopShellWindowMorphEnabledChange = useCallback(
		(value: boolean) => {
			void updateDesktopVisualPreferences(
				{ desktop_shell_window_morph_enabled: value },
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopShellMotionSpeedChange = useCallback(
		(value: UIPreferences['desktop_shell_motion_speed']) => {
			void updateDesktopVisualPreferences(
				{ desktop_shell_motion_speed: value },
				{ persist: persistDeferredRemote() }
			);
		},
		[persistDeferredRemote, updateDesktopVisualPreferences]
	);

	const handleDesktopPanelOpacityChange = useCallback(
		(value: number) => {
			const clamped = clampDesktopPanelOpacity(value);
			setDesktopVisualPreferences((prev) => ({
				...prev,
				desktop_panel_opacity: clamped,
			}));
			clearPanelOpacityPersistTimer();
			if (deferProfilePersistRef?.current === true) {
				return;
			}
			panelOpacityPersistTimerRef.current = window.setTimeout(() => {
				panelOpacityPersistTimerRef.current = null;
				const nextUi: UIPreferences = {
					...serverUiPreferencesRef.current,
					...desktopVisualPreferencesRef.current,
					desktop_panel_opacity: clamped,
				};
				void withProfileUiSaveIndicator(async () => {
					try {
						const updated = await profileService.updatePreferences({
							ui: nextUi,
						});
						await preferencesApp?.refresh?.(updated);
					} catch (error) {
						setDesktopVisualPreferences((prev) => ({
							...prev,
							desktop_panel_opacity:
								resolvedDesktopVisualPreferencesRef.current
									.desktop_panel_opacity,
						}));
						log.error(
							'Desktop',
							'Failed to persist desktop visual preferences',
							error instanceof Error ? error : undefined
						);
						notifyDesktop.error(
							t('shortcuts.profileSaveFailedTitle'),
							t('shortcuts.profileSaveFailedBody')
						);
					}
				});
			}, DESKTOP_PANEL_OPACITY_PERSIST_DEBOUNCE_MS);
		},
		[
			clearPanelOpacityPersistTimer,
			deferProfilePersistRef,
			desktopVisualPreferencesRef,
			notifyDesktop,
			panelOpacityPersistTimerRef,
			preferencesApp,
			resolvedDesktopVisualPreferencesRef,
			serverUiPreferencesRef,
			setDesktopVisualPreferences,
			withProfileUiSaveIndicator,
			t,
		]
	);

	return {
		openWallpaperFromDesktopSettings,
		handleDesktopIconSizeChange,
		handleDesktopSnapToGridChange,
		handleDesktopGridStepChange,
		handleDesktopIconStyleChange,
		handleDesktopTaskbarStyleChange,
		handleDesktopWindowStyleChange,
		handleDesktopAccentFollowsWindowStyleChange,
		handleDesktopFloatingWidgetVisibleChange,
		handleDesktopOpenAppsMaximizedChange,
		handleDesktopWidgetsStyleChange,
		handleDesktopPanelOpacityChange,
		handleDesktopUiScaleChange,
		handleDesktopSceneDepthChange,
		handleDesktopFontBodyChange,
		handleDesktopFontDisplayChange,
		handleDesktopWallpaperCrossfadeChange,
		handleDesktopStyledTooltipsChange,
		handleDesktopShellReduceMotionChange,
		handleDesktopShellParallaxEnabledChange,
		handleDesktopShellParallaxIntensityChange,
		handleDesktopShellWindowMorphEnabledChange,
		handleDesktopShellMotionSpeedChange,
	};
}
