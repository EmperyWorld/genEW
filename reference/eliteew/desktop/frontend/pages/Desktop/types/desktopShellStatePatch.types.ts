/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Strict TypeScript overlays for `DesktopShellStatePatch` expansion slices (OpenAPI arrays are loosely typed).
 *
 * Invariants:
 * - `EXPANSION_SHELL_STATE_PATCH_KEYS` stays in sync with pilot `DesktopShellStatePatch` and `desktop.py`.
 * - Runtime PATCH bodies still merge on the backend; types guide the frontend only.
 *
 * Related:
 * - `services/desktopApi.ts`, `utils/desktopShellStateWriteCoordinator.ts`
 * - `types/desktopShellStatePatch.types.ts`
 * - `documentation/api/FRONTEND-BACKEND-HTTP.md`
 */

import type {
	DesktopAppCollection,
	DesktopAssistantContextAction,
	DesktopContentShortcut,
	DesktopUserVisualStylePreset,
	DesktopWidgetsLayout,
	DesktopWindowLayoutPreset,
	DesktopWorkspaceProfile,
} from './desktopExpansion.types';
import type {
	DesktopShellState,
	DesktopShellStatePatch,
} from '../services/desktopApi';

/** Expansion-related keys on shell_state (subset of OpenAPI `DesktopShellStatePatch`). */
export const EXPANSION_SHELL_STATE_PATCH_KEYS = [
	'workspace_profiles',
	'window_layout_presets',
	'widgets_layout',
	'app_collections',
	'content_shortcuts',
	'assistant_context_actions',
	'visual_style_presets',
] as const;

export type ExpansionShellStatePatchKey =
	(typeof EXPANSION_SHELL_STATE_PATCH_KEYS)[number];

/** GET shell_state with typed expansion slices (hydration in expansion settings). */
export type ExpansionShellState = DesktopShellState & {
	workspace_profiles?: { profiles?: DesktopWorkspaceProfile[] } | null;
	window_layout_presets?: DesktopWindowLayoutPreset[];
	widgets_layout?: DesktopWidgetsLayout | null;
	app_collections?: DesktopAppCollection[];
	content_shortcuts?: DesktopContentShortcut[];
	assistant_context_actions?: DesktopAssistantContextAction[];
	visual_style_presets?: unknown;
};

/**
 * PATCH shell_state with typed expansion arrays/objects (replaces OpenAPI `unknown[]` slots).
 * Non-expansion keys remain from generated `DesktopShellStatePatch`.
 */
export type ExpansionShellStatePatch = Omit<
	DesktopShellStatePatch,
	ExpansionShellStatePatchKey
> & {
	workspace_profiles?: { profiles: DesktopWorkspaceProfile[] };
	window_layout_presets?: DesktopWindowLayoutPreset[];
	widgets_layout?: DesktopWidgetsLayout;
	app_collections?: DesktopAppCollection[];
	content_shortcuts?: DesktopContentShortcut[];
	assistant_context_actions?: DesktopAssistantContextAction[];
	visual_style_presets?: DesktopUserVisualStylePreset[];
};

/** Import pack / queue flush: workspace profiles + layout presets only. */
export type ExpansionShellSlicePatch = Pick<
	ExpansionShellStatePatch,
	'workspace_profiles' | 'window_layout_presets'
>;

/** Patch accepted by `scheduleCoalescedDesktopShellStatePatch` (all shell writers). */
export type CoalescedDesktopShellStatePatch = ExpansionShellStatePatch;
