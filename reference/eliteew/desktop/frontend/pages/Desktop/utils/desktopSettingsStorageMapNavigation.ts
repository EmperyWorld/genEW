/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Map storage-map field keys to Settings Center tab/anchor navigation targets.
 *
 * Invariants:
 * - Targets reference stable element ids (field-level, tab surfaces, shell anchors).
 *
 * Related:
 * - `DesktopSettingsExpansionStorageCard.tsx`, `DesktopSettingsPanel.tsx`
 */

import { DESKTOP_SETTINGS_SHELL_ANCHORS } from '../constants/desktopSettingsShellAnchors';
import { resolveWiredFieldElementId } from './desktopSettingsFieldElementIds';
import type { DesktopSettingsStorageMapRow } from '../types/desktopExpansion.types';
import {
	DESKTOP_SETTINGS_TAB_ORDER,
	type TabId,
} from '../components/settings/desktopSettingsShared.types';

export type SettingsNavigateTarget = {
	tab: TabId;
	elementId: string;
};

/** Root surface ids for each Settings tab panel (for `aria-controls`). */
export const DESKTOP_SETTINGS_TAB_SURFACE_IDS: Record<TabId, string> = {
	personalize: 'desktop-settings-tab-personalize',
	icons: 'desktop-settings-tab-icons',
	chrome: 'desktop-settings-tab-chrome',
	shell: 'desktop-settings-tab-shell',
	performance: 'desktop-settings-tab-performance',
};

const PROFILE_UI_SHELL_WINDOWS_FIELDS = new Set([
	'desktop_open_apps_maximized',
	'desktop_floating_widget_visible',
	'desktop_widgets_style',
]);

const PROFILE_UI_ICONS_FIELDS = new Set(['desktop_icon_style']);

const PROFILE_UI_PERFORMANCE_FIELDS = new Set([
	'animations_enabled',
	'desktop_reduce_backdrop_blur',
]);

const DESKTOP_CONFIG_SHELL_WIDGET_FIELDS = new Set([
	'show_widget',
	'widget_position',
	'show_widgets_panel',
	'widgets_panel_position',
	'compact_widgets',
]);

const LOCAL_SESSION_FIELD_TAB: Partial<Record<string, TabId>> = {
	personalization_staging: 'personalize',
	persist_patch_queue: 'shell',
};

function withFieldElementId(
	bucket: DesktopSettingsStorageMapRow['bucket'],
	field: string,
	target: SettingsNavigateTarget
): SettingsNavigateTarget {
	const fieldElementId = resolveWiredFieldElementId(bucket, field);
	return fieldElementId ? { ...target, elementId: fieldElementId } : target;
}

const SHELL_STATE_FIELD_ANCHOR: Record<string, string> = {
	virtual_desktops: DESKTOP_SETTINGS_SHELL_ANCHORS.workspaces,
	workspace_profiles: DESKTOP_SETTINGS_SHELL_ANCHORS.workspaces,
	window_layout_presets: DESKTOP_SETTINGS_SHELL_ANCHORS.windows,
	app_collections: DESKTOP_SETTINGS_SHELL_ANCHORS.apps,
	content_shortcuts: DESKTOP_SETTINGS_SHELL_ANCHORS.apps,
	widgets_layout: DESKTOP_SETTINGS_SHELL_ANCHORS.advanced,
	assistant_context_actions: DESKTOP_SETTINGS_SHELL_ANCHORS.advanced,
	visual_style_presets: DESKTOP_SETTINGS_SHELL_ANCHORS.advanced,
	recent_app_ids: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
	recent_app_ids_by_desktop: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
	recent_file_ids: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
	clipboard_history: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
	windows_snapshot: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
	clock_show_seconds: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
	timezone: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
	quiet_mode: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
	tray_show_feedback: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
	tray_show_assistant: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
	now_playing: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
	gaf_chat_sound_enabled: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
	music_playlists: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
	ewa_hints: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
};

/** Resolve navigation target for a storage-map field; null if bucket unknown. */
export function resolveStorageMapFieldNavigateTarget(
	bucket: DesktopSettingsStorageMapRow['bucket'],
	field: string
): SettingsNavigateTarget | null {
	switch (bucket) {
		case 'desktop_config':
			if (DESKTOP_CONFIG_SHELL_WIDGET_FIELDS.has(field)) {
				return withFieldElementId(bucket, field, {
					tab: 'shell',
					elementId: DESKTOP_SETTINGS_SHELL_ANCHORS.advanced,
				});
			}
			return withFieldElementId(bucket, field, {
				tab: 'personalize',
				elementId: DESKTOP_SETTINGS_TAB_SURFACE_IDS.personalize,
			});
		case 'desktop_items':
			return {
				tab: 'icons',
				elementId: DESKTOP_SETTINGS_TAB_SURFACE_IDS.icons,
			};
		case 'profile_ui':
			if (PROFILE_UI_SHELL_WINDOWS_FIELDS.has(field)) {
				return withFieldElementId(bucket, field, {
					tab: 'shell',
					elementId: DESKTOP_SETTINGS_SHELL_ANCHORS.windows,
				});
			}
			if (PROFILE_UI_ICONS_FIELDS.has(field)) {
				return withFieldElementId(bucket, field, {
					tab: 'icons',
					elementId: DESKTOP_SETTINGS_TAB_SURFACE_IDS.icons,
				});
			}
			if (PROFILE_UI_PERFORMANCE_FIELDS.has(field)) {
				return withFieldElementId(bucket, field, {
					tab: 'performance',
					elementId: DESKTOP_SETTINGS_TAB_SURFACE_IDS.performance,
				});
			}
			return withFieldElementId(bucket, field, {
				tab: 'chrome',
				elementId: DESKTOP_SETTINGS_TAB_SURFACE_IDS.chrome,
			});
		case 'shell_state': {
			if (field === 'visual_style_presets') {
				return withFieldElementId(bucket, field, {
					tab: 'personalize',
					elementId: DESKTOP_SETTINGS_TAB_SURFACE_IDS.personalize,
				});
			}
			if (field === 'persist_patch_queue') {
				return withFieldElementId(bucket, field, {
					tab: 'shell',
					elementId: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
				});
			}
			const anchor =
				SHELL_STATE_FIELD_ANCHOR[field] ?? DESKTOP_SETTINGS_SHELL_ANCHORS.sync;
			return withFieldElementId(bucket, field, {
				tab: 'shell',
				elementId: anchor,
			});
		}
		case 'local_session': {
			const tab = LOCAL_SESSION_FIELD_TAB[field] ?? ('performance' as const);
			const surfaceId =
				tab === 'personalize'
					? DESKTOP_SETTINGS_TAB_SURFACE_IDS.personalize
					: tab === 'shell'
						? DESKTOP_SETTINGS_SHELL_ANCHORS.sync
						: DESKTOP_SETTINGS_TAB_SURFACE_IDS.performance;
			return withFieldElementId(bucket, field, {
				tab,
				elementId: surfaceId,
			});
		}
		default:
			return null;
	}
}

export function isSettingsTabId(value: string): value is TabId {
	return (DESKTOP_SETTINGS_TAB_ORDER as readonly string[]).includes(value);
}
