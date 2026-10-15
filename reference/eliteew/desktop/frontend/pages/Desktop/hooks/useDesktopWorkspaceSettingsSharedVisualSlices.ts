/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Memoized shared visual slices for Settings surface chrome facade.
 *
 * Invariants:
 * - —
 *
 * Related:
 * - `desktopWorkspaceSettingsSharedVisualSlices.ts`
 */

import { useMemo } from 'react';
import {
	buildDesktopWorkspaceSettingsSharedVisualSlices,
	type DesktopWorkspaceSettingsSharedVisualSlices,
	type DesktopWorkspaceSettingsSharedVisualSlicesInput,
} from '../utils/desktopWorkspaceSettingsSharedVisualSlices';

export function useDesktopWorkspaceSettingsSharedVisualSlices(
	input: DesktopWorkspaceSettingsSharedVisualSlicesInput
): DesktopWorkspaceSettingsSharedVisualSlices {
	const {
		desktopVisualPreferences,
		desktopWindowStyle,
		accent,
		accentCustomHex,
	} = input;

	return useMemo(
		() =>
			buildDesktopWorkspaceSettingsSharedVisualSlices({
				desktopVisualPreferences,
				desktopWindowStyle,
				accent,
				accentCustomHex,
			}),
		[accent, accentCustomHex, desktopVisualPreferences, desktopWindowStyle]
	);
}
