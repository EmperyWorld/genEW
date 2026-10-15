/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Общие варианты framer-motion для переходов каталог ↔ деталь App Store.
 *
 * Invariants:
 * - При prefers-reduced-motion — только opacity, без сдвига/scale.
 *
 * Related:
 * - AppStoreViewStack.tsx, DesktopWorkspaceAppStoreLayer.tsx
 */

import type { Transition, Variants } from 'framer-motion';

export function appStoreViewTransition(reduceMotion: boolean): Transition {
	if (reduceMotion) {
		return { duration: 0.15 };
	}
	return { type: 'spring', stiffness: 420, damping: 36, mass: 0.85 };
}

export function appStoreCatalogViewVariants(reduceMotion: boolean): Variants {
	if (reduceMotion) {
		return {
			initial: { opacity: 0 },
			animate: { opacity: 1 },
			exit: { opacity: 0 },
		};
	}
	return {
		initial: { opacity: 0, x: -24 },
		animate: { opacity: 1, x: 0 },
		exit: { opacity: 0, x: -18 },
	};
}

export function appStoreDetailViewVariants(reduceMotion: boolean): Variants {
	if (reduceMotion) {
		return {
			initial: { opacity: 0 },
			animate: { opacity: 1 },
			exit: { opacity: 0 },
		};
	}
	return {
		initial: { opacity: 0, x: 32, scale: 0.985 },
		animate: { opacity: 1, x: 0, scale: 1 },
		exit: { opacity: 0, x: 24, scale: 0.985 },
	};
}

export function appStoreModalDetailPanelVariants(
	reduceMotion: boolean
): Variants {
	if (reduceMotion) {
		return {
			initial: { opacity: 0 },
			animate: { opacity: 1 },
			exit: { opacity: 0 },
		};
	}
	return {
		initial: { opacity: 0, y: 16, scale: 0.96 },
		animate: { opacity: 1, y: 0, scale: 1 },
		exit: { opacity: 0, y: 12, scale: 0.96 },
	};
}
