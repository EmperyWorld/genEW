/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Detect fine-pointer hover capability (mouse/trackpad) vs VR laser / touch where :hover sticks.
 *
 * Invariants:
 * - SSR snapshot is false; matches `matchMedia('(hover: hover) and (pointer: fine)')`.
 * - Meta Quest Browser reports fine pointer but laser hover sticks — excluded via `desktopLaserPointerEnvironment`.
 *
 * Related:
 * - styles/index.css (`fine-hover` variant); Taskbar motion/hover chrome.
 * - utils/desktopLaserPointerEnvironment.ts
 */
import { useSyncExternalStore } from 'react';
import { isDesktopLaserPointerEnvironment } from '@/pages/Desktop/utils/desktopLaserPointerEnvironment';

const FINE_POINTER_HOVER_QUERY = '(hover: hover) and (pointer: fine)';

function subscribe(onStoreChange: () => void): () => void {
	if (typeof window === 'undefined') {
		return () => {};
	}
	const mq = window.matchMedia(FINE_POINTER_HOVER_QUERY);
	mq.addEventListener('change', onStoreChange);
	return () => mq.removeEventListener('change', onStoreChange);
}

function getSnapshot(): boolean {
	if (isDesktopLaserPointerEnvironment()) return false;
	return (
		typeof window !== 'undefined' &&
		window.matchMedia(FINE_POINTER_HOVER_QUERY).matches
	);
}

function getServerSnapshot(): boolean {
	return false;
}

/** True when CSS `:hover` is reliable (desktop mouse); false on Meta Quest / coarse pointers. */
export function useFinePointerHover(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
