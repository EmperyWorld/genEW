/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Единые подписи тарифа и CTA установки для карточек каталога и детали App Store.
 *
 * Invariants:
 * - Логика совпадает с контрактом StoreAppResponse (billing_exempt, trial, EW price).
 *
 * Related:
 * - AppStoreCatalogCard.tsx, AppStoreCard.tsx
 */

import type { TFunction } from 'i18next';
import type { StoreAppResponse } from '../services/desktopApi';

export function storeAppBillingCaption(
	app: Pick<
		StoreAppResponse,
		'billing_exempt' | 'ew_monthly_price' | 'trial_duration_days'
	>,
	t: TFunction<'appStore'>
): string {
	if (app.billing_exempt === true) return t('billing.free');
	const price = app.ew_monthly_price ?? 0;
	const trial = app.trial_duration_days ?? 0;
	if (price <= 0 && trial <= 0) return t('billing.free');
	if (trial > 0) return t('billing.trialThen', { days: trial, price });
	return t('billing.monthly', { price });
}

export function storeAppInstallCtaLabel(
	app: Pick<
		StoreAppResponse,
		'billing_exempt' | 'ew_monthly_price' | 'trial_duration_days'
	>,
	t: TFunction<'appStore'>
): string {
	if (app.billing_exempt === true) return t('install.ctaFree');
	const price = app.ew_monthly_price ?? 0;
	const trial = app.trial_duration_days ?? 0;
	if (price <= 0 && trial <= 0) return t('install.ctaFree');
	if (trial > 0) return t('install.ctaTrial', { days: trial });
	return t('install.ctaPaid', { price });
}
