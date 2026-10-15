import { useCallback, useRef, type RefObject } from 'react';
import type { DesktopItem } from '../types/desktop.types';
import { resolveUgsDesktopWindowOpen } from '../utils/desktopUgsOpen';
import type { UGSDesktopDeepLink } from '../utils/ugsDesktopDeepLink';
import type { OpenWindowOptions } from './useWindowManager';

/**
 * Opens UGS Hub or UGS Studio window with {@link WindowInitialPayload} from a deep link.
 * Uses refs so the callback identity stays stable for context/effects (matches previous openWindowRef pattern).
 */
export function useDesktopUgsOpenWindow(params: {
	itemsRef: RefObject<DesktopItem[]>;
	canOpenUnifiedAdmin: boolean;
	handleOpenWindow: (item: DesktopItem, options?: OpenWindowOptions) => void;
}): (deepLink: UGSDesktopDeepLink) => void {
	const { itemsRef, canOpenUnifiedAdmin, handleOpenWindow } = params;
	const handleOpenRef = useRef(handleOpenWindow);
	handleOpenRef.current = handleOpenWindow;

	return useCallback(
		(deepLink: UGSDesktopDeepLink) => {
			const resolved = resolveUgsDesktopWindowOpen(
				deepLink,
				itemsRef.current ?? [],
				canOpenUnifiedAdmin
			);
			if (!resolved) {
				return;
			}
			handleOpenRef.current(resolved.item, {
				initialPayload: resolved.initialPayload,
			});
		},
		[canOpenUnifiedAdmin, itemsRef]
	);
}
