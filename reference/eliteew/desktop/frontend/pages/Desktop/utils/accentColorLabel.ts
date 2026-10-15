/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Resolve desktop accent swatch id to localized label for settings UI and tooltips.
 *
 * Invariants:
 * - Unknown ids fall back to the raw id string (custom accents use separate copy).
 *
 * Related:
 * - constants/index.ts ACCENT_COLORS
 * - DesktopSettingsPersonalizeThemeAccentCard.tsx
 */
import type { TFunction } from 'i18next';

export function accentColorLabel(
	accentId: string,
	t: TFunction<'desktopUi'>
): string {
	return t(`settingsAccent.colors.${accentId}`, { defaultValue: accentId });
}
