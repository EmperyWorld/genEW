/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Drop **transient**, possibly large fields from **`WindowInitialPayload`** before serializing desks into **`windows_snapshot`**.
 *
 * Invariants:
 * - `companionSurfaceExcerpt`, `companionSurfaceSelectionPlain`, `companionListingPlain`, and one-shot Professional
 *   Worlds cross-app draft keys stay only in-memory — never PATCH'd to PG as part of snapshots.
 *
 * Related:
 * - `hooks/useDesktopShellWindowPersistence.ts`
 * - `hooks/useDesktopExpansionSettings.ts` (`persistableWindow`)
 */

import type { WindowInitialPayload } from '../types/desktop.types';

/**
 * Returns a shallow copy without volatile companion shell / one-shot draft fields.
 */
export function sanitizeWindowPayloadForShellPersistence(
	payload: WindowInitialPayload | undefined
): WindowInitialPayload | undefined {
	if (
		payload == null ||
		(!(payload.companionSurfaceExcerpt ?? '') &&
			!(payload.companionSurfaceSelectionPlain ?? '') &&
			!(payload.companionListingPlain ?? '') &&
			!(payload.professionalWorldsCrossAppDraftKey ?? ''))
	) {
		return payload;
	}
	const {
		companionSurfaceExcerpt: _ex,
		companionSurfaceSelectionPlain: _sel,
		companionListingPlain: _li,
		professionalWorldsCrossAppDraftKey: _pw,
		...rest
	} = payload;
	return Object.keys(rest).length > 0 ? rest : undefined;
}
