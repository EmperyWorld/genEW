/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Stable DOM ids for storage-map fields wired to Settings Center controls.
 *
 * Invariants:
 * - Pattern `desktop-settings-field-{bucket}-{field}` matches storage-map `data-testid` suffix.
 * - Only fields listed in `WIRED_STORAGE_MAP_FIELD_KEYS` receive field-level scroll targets.
 *
 * Related:
 * - `desktopSettingsStorageMapNavigation.ts`, `DesktopSettingsFormCard.tsx`
 */

import type { DesktopSettingsStorageMapRow } from '../types/desktopExpansion.types';

export function buildDesktopSettingsFieldElementId(
	bucket: DesktopSettingsStorageMapRow['bucket'],
	field: string
): string {
	return `desktop-settings-field-${bucket}-${field}`;
}

function fieldKey(
	bucket: DesktopSettingsStorageMapRow['bucket'],
	field: string
): string {
	return `${bucket}:${field}`;
}

/** Fields with a dedicated control or card section in Settings Center UI. */
export const WIRED_STORAGE_MAP_FIELD_KEYS = new Set<string>([
	fieldKey('desktop_config', 'wallpaper'),
	fieldKey('desktop_config', 'wallpapers_history'),
	fieldKey('desktop_config', 'live_wallpaper'),
	fieldKey('desktop_config', 'theme'),
	fieldKey('desktop_config', 'accent_color'),
	fieldKey('desktop_config', 'icon_size'),
	fieldKey('desktop_config', 'snap_to_grid'),
	fieldKey('desktop_config', 'grid_step'),
	fieldKey('desktop_config', 'show_widget'),
	fieldKey('desktop_config', 'widget_position'),
	fieldKey('desktop_config', 'show_widgets_panel'),
	fieldKey('desktop_config', 'widgets_panel_position'),
	fieldKey('desktop_config', 'compact_widgets'),
	fieldKey('profile_ui', 'desktop_window_style'),
	fieldKey('profile_ui', 'desktop_taskbar_style'),
	fieldKey('profile_ui', 'desktop_icon_style'),
	fieldKey('profile_ui', 'desktop_panel_opacity'),
	fieldKey('profile_ui', 'desktop_ui_scale'),
	fieldKey('profile_ui', 'desktop_accent_follows_window_style'),
	fieldKey('profile_ui', 'desktop_open_apps_maximized'),
	fieldKey('profile_ui', 'desktop_floating_widget_visible'),
	fieldKey('profile_ui', 'desktop_widgets_style'),
	fieldKey('profile_ui', 'animations_enabled'),
	fieldKey('profile_ui', 'desktop_reduce_backdrop_blur'),
	fieldKey('profile_ui', 'desktop_shell_reduce_motion'),
	fieldKey('profile_ui', 'desktop_shell_parallax_enabled'),
	fieldKey('profile_ui', 'desktop_shell_parallax_intensity'),
	fieldKey('profile_ui', 'desktop_shell_window_morph_enabled'),
	fieldKey('profile_ui', 'desktop_shell_motion_speed'),
	fieldKey('profile_ui', 'desktop_menu_mode'),
	fieldKey('shell_state', 'virtual_desktops'),
	fieldKey('shell_state', 'workspace_profiles'),
	fieldKey('shell_state', 'window_layout_presets'),
	fieldKey('shell_state', 'widgets_layout'),
	fieldKey('shell_state', 'app_collections'),
	fieldKey('shell_state', 'content_shortcuts'),
	fieldKey('shell_state', 'assistant_context_actions'),
	fieldKey('shell_state', 'visual_style_presets'),
	fieldKey('shell_state', 'persist_patch_queue'),
	fieldKey('shell_state', 'quiet_mode'),
	fieldKey('shell_state', 'clock_show_seconds'),
	fieldKey('shell_state', 'timezone'),
	fieldKey('shell_state', 'tray_show_feedback'),
	fieldKey('shell_state', 'tray_show_assistant'),
	fieldKey('local_session', 'performance_telemetry'),
	fieldKey('local_session', 'personalization_staging'),
]);

/** Returns field-level element id when the control exists in UI; otherwise null. */
export function resolveWiredFieldElementId(
	bucket: DesktopSettingsStorageMapRow['bucket'],
	field: string
): string | null {
	if (!WIRED_STORAGE_MAP_FIELD_KEYS.has(fieldKey(bucket, field))) {
		return null;
	}
	return buildDesktopSettingsFieldElementId(bucket, field);
}
