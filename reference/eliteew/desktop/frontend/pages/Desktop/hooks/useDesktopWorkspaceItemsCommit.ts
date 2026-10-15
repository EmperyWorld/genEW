import { useCallback, useRef } from 'react';
import type { DesktopItem } from '../types/desktop.types';

/**
 * Keeps a ref to the latest desktop items and exposes a functional updater that delegates to `replaceItems`.
 */
export function useDesktopWorkspaceItemsCommit(
	items: DesktopItem[],
	replaceItems: (next: DesktopItem[]) => void
) {
	const itemsRef = useRef(items);
	itemsRef.current = items;
	const commitItems = useCallback(
		(updater: DesktopItem[] | ((prev: DesktopItem[]) => DesktopItem[])) => {
			const next =
				typeof updater === 'function' ? updater(itemsRef.current) : updater;
			replaceItems(next);
		},
		[replaceItems]
	);
	return { itemsRef, commitItems };
}
