/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * One-time virtual desktops strip hint when user first has multiple desktops.
 *
 * Related:
 * - components/VirtualDesktops.tsx
 */

import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../constants';

export function useVirtualDesktopFirstUseHint(desktopCount: number): {
	showHint: boolean;
	dismissHint: () => void;
} {
	const [showHint, setShowHint] = useState(false);

	useEffect(() => {
		if (desktopCount <= 1) {
			setShowHint(false);
			return;
		}
		try {
			const dismissed =
				window.localStorage.getItem(
					STORAGE_KEYS.VD_FIRST_USE_HINT_DISMISSED
				) === '1';
			setShowHint(!dismissed);
		} catch {
			setShowHint(false);
		}
	}, [desktopCount]);

	const dismissHint = useCallback(() => {
		try {
			window.localStorage.setItem(
				STORAGE_KEYS.VD_FIRST_USE_HINT_DISMISSED,
				'1'
			);
		} catch {
			// ignore
		}
		setShowHint(false);
	}, []);

	return { showHint, dismissHint };
}
