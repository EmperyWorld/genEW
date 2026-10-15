/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Map App Store install/uninstall API failures to localized user copy (no raw backend English).
 *
 * Invariants:
 * - Never surface raw `err.message` for APIError; use `appStore.error.*` keys.
 *
 * Related:
 * - useAppStoreInstallFlow.ts, AppStoreCatalogCard.tsx, services/api/client.ts (402/403/409)
 */

import type { TFunction } from 'i18next';
import { APIError } from '@/services/api/client';

export function appStoreInstallErrorMessage(
	err: unknown,
	t: TFunction<'appStore'>
): string {
	if (err instanceof APIError) {
		switch (err.statusCode) {
			case 409:
				return t('error.maintenanceInstall');
			case 402:
				return t('error.insufficientEw');
			case 403:
				return t('error.accessDenied');
			case 404:
				return t('error.appNotFound');
			case 410:
				return t('error.appDeprecated');
			case 401:
				return t('error.authRequired');
			case 408:
				return t('error.network');
			case 0:
				return t('error.network');
			default:
				if (err.statusCode !== undefined && err.statusCode >= 500) {
					return t('error.serverError');
				}
				break;
		}
	}
	return t('error.installFailed');
}
