/**
 * Opens apps from URL query on workspace mount: `?doc=` (DocEditor), `?ewdesk_news=` (EWDesk), marketing cabinet deep links.
 */

import { useEffect, useRef } from 'react';
import {
	hasMarketingCabinetDeepLink,
	parseMarketingCabinetDeepLinkState,
	stripMarketingCabinetParamsFromCurrentUrl,
} from '../../MarketingCabinet/hooks/useMarketingCabinetNavigation';
import { DEFAULT_APPS } from '../constants';
import type { DesktopItem } from '../types/desktop.types';
import type { WindowState } from '../types/desktop.types';
import {
	canDisplayDesktopItem,
	resolveDesktopAppItem,
} from '../utils/desktopAppRegistry';
import { canResolveInstalledDesktopApps } from '../utils/desktopOpenPayloads';
import type { OpenWindowOptions } from './useWindowManager';

export function useDesktopUrlLaunchEffects(params: {
	items: DesktopItem[];
	windows: WindowState[];
	installedApps: DesktopItem[];
	installedAppsLoading: boolean;
	storeApps: unknown;
	installedAppIds: ReadonlySet<string>;
	handleOpenWindow: (item: DesktopItem, options?: OpenWindowOptions) => void;
}): void {
	const {
		items,
		windows,
		installedApps,
		installedAppsLoading,
		storeApps,
		installedAppIds,
		handleOpenWindow,
	} = params;

	const hasHandledDocParamRef = useRef(false);
	useEffect(() => {
		if (hasHandledDocParamRef.current) return;
		const searchParams = new URLSearchParams(window.location.search);
		const documentId = searchParams.get('doc')?.trim();
		if (!documentId) return;
		hasHandledDocParamRef.current = true;
		const docEditorItem =
			items.find((i) => i.appComponent === 'DocEditor') ??
			DEFAULT_APPS.find((a) => a.appComponent === 'DocEditor');
		if (docEditorItem) {
			handleOpenWindow(docEditorItem, { initialPayload: { documentId } });
		}
		const cleanUrl = window.location.pathname + (window.location.hash || '');
		if (window.history.replaceState) {
			window.history.replaceState(null, '', cleanUrl);
		}
	}, [handleOpenWindow, items]);

	const hasHandledEwDeskNewsRef = useRef(false);
	useEffect(() => {
		if (hasHandledEwDeskNewsRef.current) return;
		const searchParams = new URLSearchParams(window.location.search);
		const newsId = searchParams.get('ewdesk_news')?.trim();
		if (!newsId) return;

		const ewDeskItem =
			items.find((i) => i.appComponent === 'EWDeskApp') ??
			DEFAULT_APPS.find((a) => a.appComponent === 'EWDeskApp');
		if (!ewDeskItem) {
			return;
		}

		const resolved = resolveDesktopAppItem(ewDeskItem, installedApps);
		if (!canDisplayDesktopItem(resolved, installedAppIds)) {
			return;
		}

		hasHandledEwDeskNewsRef.current = true;
		handleOpenWindow(ewDeskItem, {
			initialPayload: { ewDeskNewsId: newsId },
		});
		const cleanUrl = window.location.pathname + (window.location.hash || '');
		if (window.history.replaceState) {
			window.history.replaceState(null, '', cleanUrl);
		}
	}, [handleOpenWindow, installedAppIds, installedApps, items]);

	const hasHandledMarketingDeepLinkRef = useRef(false);
	useEffect(() => {
		if (hasHandledMarketingDeepLinkRef.current) return;
		if (!canResolveInstalledDesktopApps(installedAppsLoading, storeApps))
			return;
		const hasMarketingDeepLink = hasMarketingCabinetDeepLink(
			window.location.search
		);
		if (!hasMarketingDeepLink) return;

		const marketingWindowOpen = windows.some(
			(windowState) => windowState.appComponent === 'MarketingCabinet'
		);
		if (marketingWindowOpen) {
			hasHandledMarketingDeepLinkRef.current = true;
			queueMicrotask(() => stripMarketingCabinetParamsFromCurrentUrl());
			return;
		}

		const marketingCabinetItem =
			items.find((item) => item.appComponent === 'MarketingCabinet') ??
			DEFAULT_APPS.find((item) => item.appComponent === 'MarketingCabinet');
		if (!marketingCabinetItem) {
			hasHandledMarketingDeepLinkRef.current = true;
			return;
		}

		const resolved = resolveDesktopAppItem(marketingCabinetItem, installedApps);
		if (!canDisplayDesktopItem(resolved, installedAppIds)) {
			return;
		}

		const deepLinkState = parseMarketingCabinetDeepLinkState(
			window.location.search
		);
		if (!deepLinkState) {
			return;
		}

		hasHandledMarketingDeepLinkRef.current = true;
		handleOpenWindow(marketingCabinetItem, {
			initialPayload: { marketingCabinetDeepLink: deepLinkState },
		});
		stripMarketingCabinetParamsFromCurrentUrl();
	}, [
		handleOpenWindow,
		installedAppIds,
		installedApps,
		installedAppsLoading,
		items,
		storeApps,
		windows,
	]);
}
