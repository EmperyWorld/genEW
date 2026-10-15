/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Выбор «похожих» приложений для детальной карточки магазина (та же категория).
 *
 * Invariants:
 * - Исключает текущее приложение; порядок как в каталоге (`sort_order`, имя).
 *
 * Related:
 * - AppStoreRelatedAppsRow.tsx, AppStoreCard.tsx
 */

import type { StoreAppResponse } from '../services/desktopApi';

const DEFAULT_RELATED_LIMIT = 6;

function compareCatalogOrder(a: StoreAppResponse, b: StoreAppResponse): number {
	const sa = a.sort_order ?? 0;
	const sb = b.sort_order ?? 0;
	if (sa !== sb) return sa - sb;
	return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/** Apps in the same category as `current`, excluding `current`, capped by `limit`. */
export function pickRelatedStoreApps(
	storeApps: readonly StoreAppResponse[] | undefined,
	current: Pick<StoreAppResponse, 'app_id' | 'category'> | null | undefined,
	limit = DEFAULT_RELATED_LIMIT
): StoreAppResponse[] {
	if (!current || !storeApps?.length) {
		return [];
	}
	return storeApps
		.filter(
			(app) =>
				app.app_id !== current.app_id && app.category === current.category
		)
		.sort(compareCatalogOrder)
		.slice(0, limit);
}
