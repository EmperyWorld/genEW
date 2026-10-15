/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Localized layout sync for desktop app window bodies without synthetic global resize.
 *
 * Invariants:
 * - Never calls `window.dispatchEvent(new Event('resize'))` — boot perf contract.
 * - Layout reads run after paint via double `requestAnimationFrame`.
 *
 * Related:
 * - src/pages/Desktop/components/EnhancedWindow.tsx
 */

/**
 * After nested flex + lazy Suspense settle, read body geometry locally (no window resize fan-out).
 */
export function scheduleAppWindowBodyLayoutSync(
	el: HTMLElement | null | undefined
): void {
	if (!el || typeof window === 'undefined') {
		return;
	}
	window.requestAnimationFrame(() => {
		window.requestAnimationFrame(() => {
			void el.getBoundingClientRect();
		});
	});
}
