/**
 * Pure logic: which desktop window to open for a UGS deep link (hub vs studio, admin fallback).
 */

import { DEFAULT_APPS } from '../constants';
import type { DesktopItem } from '../types/desktop.types';
import type { WindowInitialPayload } from '../types/desktop.types';
import type { UGSDesktopDeepLink } from './ugsDesktopDeepLink';

export type UgsDesktopWindowOpen = {
	item: DesktopItem;
	initialPayload: WindowInitialPayload;
};

/**
 * Resolves hub vs UGS Studio window and payload. Returns null if no UGS app is available in defaults/items.
 */
export function resolveUgsDesktopWindowOpen(
	deepLink: UGSDesktopDeepLink,
	items: DesktopItem[],
	canOpenUnifiedAdmin: boolean
): UgsDesktopWindowOpen | null {
	const safeDeepLink =
		(deepLink.view === 'admin' || deepLink.view === 'dashboard') &&
		!canOpenUnifiedAdmin
			? { ...deepLink, view: 'hub' as const }
			: deepLink;

	const openHubOnly =
		safeDeepLink.view === 'hub' &&
		(safeDeepLink.workflowId == null || safeDeepLink.workflowId === '');

	const hubItem =
		items.find((item) => item.appComponent === 'UGSHubApp') ??
		DEFAULT_APPS.find((item) => item.appComponent === 'UGSHubApp');
	const studioItem =
		items.find((item) => item.appComponent === 'UGS') ??
		DEFAULT_APPS.find((item) => item.appComponent === 'UGS');

	const ugsItem = openHubOnly && hubItem ? hubItem : (studioItem ?? hubItem);
	if (!ugsItem) {
		return null;
	}

	return {
		item: ugsItem,
		initialPayload: {
			ugsView: safeDeepLink.view,
			ugsWorkflowId: safeDeepLink.workflowId ?? null,
		},
	};
}
