/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Locale helpers for Feedback Hub list dates.
 *
 * Invariants:
 * - Uses resolveIntlDateLocale for consistent date formatting with app i18n language.
 *
 * Related:
 * - src/pages/Desktop/components/FeedbackHubApp.tsx
 */

import { resolveIntlDateLocale } from '../../../components/UnifiedContent/utils/contentUtils';

export function formatFeedbackListDate(iso: string, locale?: string): string {
	try {
		const date = new Date(iso);
		if (Number.isNaN(date.getTime())) return iso;
		return date.toLocaleString(resolveIntlDateLocale(locale), {
			dateStyle: 'medium',
			timeStyle: 'short',
		});
	} catch {
		return iso;
	}
}
