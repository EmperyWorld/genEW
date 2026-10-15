/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Фокус в поле поиска каталога App Store после возврата из детали.
 *
 * Invariants:
 * - Ищет input по data-app-store-search; без побочных эффектов при отсутствии DOM.
 *
 * Related:
 * - AppStore.tsx, AppStoreViewStack.tsx
 */

export const APP_STORE_SEARCH_INPUT_ATTR = 'data-app-store-search';

export function focusAppStoreCatalogSearch(): void {
	if (typeof document === 'undefined') return;
	requestAnimationFrame(() => {
		const el = document.querySelector<HTMLInputElement>(
			`input[${APP_STORE_SEARCH_INPUT_ATTR}]`
		);
		el?.focus({ preventScroll: true });
	});
}
