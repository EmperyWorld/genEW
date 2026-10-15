/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Map visual pack import failures to plain user-facing copy (no raw parser tokens).
 *
 * Invariants:
 * - Unknown errors fall back to generic damaged-file message.
 *
 * Related:
 * - `personalize/DesktopSettingsPersonalizePresetsFacade.tsx`
 */

import type { TFunction } from 'i18next';

const DAMAGED_FILE_PATTERN =
	/json|parse|syntax|unexpected token|invalid|schema|bundle|format|version|malformed/i;

export function mapVisualPackImportErrorMessage(
	raw: string | undefined,
	t: TFunction<'desktopUi'>
): string {
	if (!raw?.trim()) {
		return t('settingsPanel.visualPackImportFailedDamaged');
	}
	if (DAMAGED_FILE_PATTERN.test(raw)) {
		return t('settingsPanel.visualPackImportFailedDamaged');
	}
	return t('settingsPanel.visualPackImportFailedDamaged');
}
