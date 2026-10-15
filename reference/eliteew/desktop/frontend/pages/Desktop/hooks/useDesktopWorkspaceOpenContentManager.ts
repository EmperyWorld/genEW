/**
 * Open Content Manager from desktop shell (items snapshot or DEFAULT_APPS fallback).
 */

import type { MutableRefObject } from 'react';
import { useCallback } from 'react';
import { DEFAULT_APPS } from '../constants';
import type { DesktopItem, WindowInitialPayload } from '../types/desktop.types';

export function useDesktopWorkspaceOpenContentManager(params: {
	itemsRef: MutableRefObject<DesktopItem[] | null | undefined>;
	handleOpenWindow: (
		item: DesktopItem,
		options?: { initialPayload?: Partial<WindowInitialPayload> }
	) => void;
}): {
	openContentManager: (payload?: Partial<WindowInitialPayload>) => void;
} {
	const { itemsRef, handleOpenWindow } = params;

	const openContentManager = useCallback(
		(payload?: Partial<WindowInitialPayload>) => {
			const cmItem =
				itemsRef.current?.find((i) => i.appComponent === 'ContentManagerPro') ??
				DEFAULT_APPS.find((a) => a.appComponent === 'ContentManagerPro');
			if (cmItem) {
				handleOpenWindow(cmItem, { initialPayload: payload });
			}
		},
		[handleOpenWindow, itemsRef]
	);

	return { openContentManager };
}
