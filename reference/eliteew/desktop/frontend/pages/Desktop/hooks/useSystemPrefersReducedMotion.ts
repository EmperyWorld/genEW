/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * OS `prefers-reduced-motion` without importing `framer-motion` into cold desktop chunks.
 *
 * Invariants:
 * - SSR/tests without `window.matchMedia` → false.
 *
 * Related:
 * - resolveDesktopShellMotion.ts, DesktopWorkspaceContent.tsx
 */

import { useEffect, useState } from 'react';

export function useSystemPrefersReducedMotion(): boolean {
	const [reduced, setReduced] = useState(() => {
		if (
			typeof window === 'undefined' ||
			typeof window.matchMedia !== 'function'
		) {
			return false;
		}
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	});

	useEffect(() => {
		if (
			typeof window === 'undefined' ||
			typeof window.matchMedia !== 'function'
		) {
			return;
		}
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		const onChange = () => setReduced(mq.matches);
		onChange();
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	}, []);

	return reduced;
}
