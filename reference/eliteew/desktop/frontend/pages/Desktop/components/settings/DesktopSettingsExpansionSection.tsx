/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Re-export expansion orchestrator from `settings/expansion/` submodule.
 *
 * Invariants:
 * - Import path stable for lazy tab chunks and tests.
 *
 * Related:
 * - `expansion/DesktopSettingsExpansionSection.tsx`
 */

export {
	ExpansionSettingsSection,
	type ExpansionSettingsSectionProps,
} from './expansion/DesktopSettingsExpansionSection';
