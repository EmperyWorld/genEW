/**
 * One-shot: after redirect from legacy full-page route, open queued app or store UGS deep link in session.
 * Must run before {@link useDesktopUgsDeepLinkEffects} so `storeUgsDesktopDeepLink` runs first.
 */

import { useEffect, useRef } from 'react';
import type { DesktopItem } from '../types/desktop.types';
import {
	canDisplayDesktopItem,
	findDesktopAppItemByComponent,
	resolveDesktopAppItem,
} from '../utils/desktopAppRegistry';
import { consumePendingDesktopOpen } from '../utils/pendingDesktopOpen';
import { storeUgsDesktopDeepLink } from '../utils/ugsDesktopDeepLink';
import type { OpenWindowOptions } from './useWindowManager';

export function useLegacyPendingDesktopOpenEffect(params: {
	items: DesktopItem[];
	installedApps: DesktopItem[];
	installedAppIds: ReadonlySet<string>;
	handleOpenWindow: (item: DesktopItem, options?: OpenWindowOptions) => void;
}): void {
	const { items, installedApps, installedAppIds, handleOpenWindow } = params;
	const consumedRef = useRef(false);

	useEffect(() => {
		if (consumedRef.current) {
			return;
		}
		const pending = consumePendingDesktopOpen();
		if (!pending) {
			return;
		}
		consumedRef.current = true;
		if (pending.kind === 'ugs') {
			storeUgsDesktopDeepLink(pending.rawTarget);
			return;
		}
		const item = findDesktopAppItemByComponent(items, pending.appComponent);
		if (!item) {
			return;
		}
		const resolved = resolveDesktopAppItem(item, installedApps);
		if (!canDisplayDesktopItem(resolved, installedAppIds)) {
			return;
		}
		handleOpenWindow(resolved);
	}, [handleOpenWindow, installedAppIds, installedApps, items]);
}
