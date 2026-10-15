/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Normalize `desktop_configs.widgets_panel_position` to a known corner enum.
 *
 * Invariants:
 * - Unknown values fall back to `top-right` (matches `useDesktopStorage` default).
 *
 * Related:
 * - `DesktopWorkspaceContent.tsx`, `useDesktopWorkspaceShellSettingsClusterInput.ts`
 */

import type { WidgetsPanelPosition } from '../types/desktop.types';

const WIDGETS_PANEL_POSITIONS: readonly WidgetsPanelPosition[] = [
	'top-left',
	'top-right',
	'bottom-left',
	'bottom-right',
];

export function normalizeDesktopWidgetsPanelPosition(
	value: string | null | undefined
): WidgetsPanelPosition {
	if (
		value === 'top-left' ||
		value === 'top-right' ||
		value === 'bottom-left' ||
		value === 'bottom-right'
	) {
		return value;
	}
	return 'top-right';
}

export function isWidgetsPanelPosition(
	value: string | null | undefined
): value is WidgetsPanelPosition {
	return WIDGETS_PANEL_POSITIONS.includes(value as WidgetsPanelPosition);
}
