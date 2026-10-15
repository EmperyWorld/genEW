/**
 * Consumes UGS deep link from session (or legacy page id), opens the window, normalizes shell route to #/desktop.
 * Subscribes to {@link UGS_DESKTOP_DEEPLINK_EVENT} when {@link storeUgsDesktopDeepLink} dispatches after redirect.
 */

import { useEffect } from 'react';
import type { PageType } from '../../../hooks/useAppState';
import { syncLocationHashToPage } from '../../../utils/pageRouting';
import {
	consumeUgsDesktopDeepLink,
	resolveUgsDesktopDeepLink,
	UGS_DESKTOP_DEEPLINK_EVENT,
	type UGSDesktopDeepLink,
} from '../utils/ugsDesktopDeepLink';

export function useDesktopUgsDeepLinkEffects(params: {
	openUgsDesktopApp: (deepLink: UGSDesktopDeepLink) => void;
	currentPage: string;
	setCurrentPage: (page: PageType) => void;
}): void {
	const { openUgsDesktopApp, currentPage, setCurrentPage } = params;

	useEffect(() => {
		const pendingUgsDeepLink =
			consumeUgsDesktopDeepLink() ?? resolveUgsDesktopDeepLink(currentPage);

		if (!pendingUgsDeepLink) {
			return;
		}

		openUgsDesktopApp(pendingUgsDeepLink);

		if (currentPage !== 'desktop') {
			setCurrentPage('desktop');
		}

		syncLocationHashToPage('desktop');
	}, [currentPage, openUgsDesktopApp, setCurrentPage]);

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		const handlePendingUgsDeepLink = (): void => {
			const pendingUgsDeepLink = consumeUgsDesktopDeepLink();
			if (!pendingUgsDeepLink) {
				return;
			}

			openUgsDesktopApp(pendingUgsDeepLink);

			if (currentPage !== 'desktop') {
				setCurrentPage('desktop');
			}

			syncLocationHashToPage('desktop');
		};

		window.addEventListener(
			UGS_DESKTOP_DEEPLINK_EVENT,
			handlePendingUgsDeepLink
		);
		return () => {
			window.removeEventListener(
				UGS_DESKTOP_DEEPLINK_EVENT,
				handlePendingUgsDeepLink
			);
		};
	}, [currentPage, openUgsDesktopApp, setCurrentPage]);
}
