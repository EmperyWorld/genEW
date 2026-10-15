/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Определяет, безопасно ли программно фокусировать поле поиска в оболочке стола (Пуск, быстрый поиск).
 *
 * Invariants:
 * - На touch-primary экране (`pointer: coarse` и `hover: none`) не автофокусируем: открывается виртуальная клавиатура.
 *
 * Related:
 * - `StartMenu.tsx`, `QuickSearch.tsx`
 * - hooks/useDesktopShellSearchFocusOnVisible.ts
 */

/**
 * @returns false on typical phones / touch tablets; true on mouse-first and hybrid with fine pointer.
 */
export function shouldAutofocusDesktopShellSearch(): boolean {
	if (typeof window === 'undefined') return true;
	try {
		return !(
			window.matchMedia('(pointer: coarse)').matches &&
			window.matchMedia('(hover: none)').matches
		);
	} catch {
		return true;
	}
}

/** Programmatic focus for shell search fields (Start / Quick Search). */
export function focusDesktopShellSearchInput(
	input: HTMLInputElement | null | undefined,
	delayMs = 100
): void {
	if (!input || !shouldAutofocusDesktopShellSearch()) return;
	window.setTimeout(() => input.focus(), delayMs);
}
