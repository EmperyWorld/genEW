/**
 * `onNavigate` for {@link DesktopAppPropsContext}: Content Manager, UGS deep links,
 * legacy page → window mapping, profile return key, fallback to shell routing.
 */

import { useCallback, type RefObject } from 'react';
import type { PageType } from '../../../hooks/useAppState';
import {
	DEFAULT_PAGE,
	normalizePageCandidate,
	syncLocationHashToPage,
} from '../../../utils/pageRouting';
import { PROFILE_RETURN_TO_SESSION_KEY } from '../../../constants/storageKeys';
import { DEFAULT_APPS } from '../constants';
import type { DesktopItem } from '../types/desktop.types';
import { resolveUgsDesktopDeepLink } from '../utils/ugsDesktopDeepLink';
import type { UGSDesktopDeepLink } from '../utils/ugsDesktopDeepLink';
import { PAGE_TO_APP_COMPONENT } from '../utils/desktopShellPageMap';
import type { OpenWindowOptions } from './useWindowManager';

export function useDesktopShellOnNavigate(params: {
	itemsRef: RefObject<DesktopItem[]>;
	openWindowRef: RefObject<
		(item: DesktopItem, options?: OpenWindowOptions) => void
	>;
	openUgsDesktopApp: (deepLink: UGSDesktopDeepLink) => void;
	setCurrentPage: (page: PageType) => void;
}): (page: PageType | string) => void {
	const { itemsRef, openWindowRef, openUgsDesktopApp, setCurrentPage } = params;

	return useCallback(
		(page: PageType | string) => {
			const target = String(page);
			if (target === 'unified-content' || target === 'content') {
				const cmItem =
					itemsRef.current?.find(
						(i) => i.appComponent === 'ContentManagerPro'
					) ?? DEFAULT_APPS.find((a) => a.appComponent === 'ContentManagerPro');
				if (cmItem) {
					openWindowRef.current(cmItem);
				}
				return;
			}
			const ugsDeepLink = resolveUgsDesktopDeepLink(target);
			if (ugsDeepLink) {
				openUgsDesktopApp(ugsDeepLink);
				return;
			}
			const appComponent = PAGE_TO_APP_COMPONENT[target];
			if (appComponent) {
				const item =
					itemsRef.current?.find((i) => i.appComponent === appComponent) ??
					DEFAULT_APPS.find((a) => a.appComponent === appComponent);
				if (item) {
					openWindowRef.current(item);
					return;
				}
			}
			if (target === 'user-profile') {
				try {
					sessionStorage.setItem(PROFILE_RETURN_TO_SESSION_KEY, 'desktop');
				} catch {
					/* ignore */
				}
			}
			const normalizedTarget = (normalizePageCandidate(target) ??
				DEFAULT_PAGE) as PageType;
			setCurrentPage(normalizedTarget);
			syncLocationHashToPage(normalizedTarget, target);
		},
		[itemsRef, openUgsDesktopApp, openWindowRef, setCurrentPage]
	);
}
