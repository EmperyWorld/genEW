/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Legacy CMS section id aliases for Site Studio storefront/admin content lookup.
 *
 * Invariants:
 * - Canonical section ids are the first entry in each alias list.
 * - Saves always use the catalog section id (canonical).
 *
 * Related:
 * - features/site-studio/admin/content/ContentPage.tsx
 */

/** Canonical section → legacy ids still present in older runtime DB seeds. */
export const CONTENT_SECTION_READ_ALIASES: Record<string, readonly string[]> = {
	value_block: ['value_block', 'aromatherapy'],
};

export function contentSectionCandidates(section: string): readonly string[] {
	return CONTENT_SECTION_READ_ALIASES[section] ?? [section];
}
