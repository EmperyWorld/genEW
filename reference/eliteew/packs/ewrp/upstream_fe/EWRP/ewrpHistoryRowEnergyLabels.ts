/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Pure energy/action labels for EWRP history rows (retry vs duplicate ⚡ lines).
 *
 * Invariants:
 * - Must stay aligned with `ewrpHistoryRowCapabilities` and `ewrpRetryPresentation`.
 *
 * Related:
 * - `EwrpHistoryRow`, `ewrpClientJobPolicy.ts`
 */

import type { EwrpJobListItem } from '../../services/ewrpApi';
import { ewrpHistoryRowCapabilities } from './ewrpClientJobPolicy';
import {
	ewrpJobSlideEnergyCredits,
	ewrpRetryButtonTitle,
	ewrpRetryEnergyDetail,
	type EwrpRetryEnergyI18n,
} from './ewrpRetryPresentation';

export type EwrpHistoryRowEnergyI18n = EwrpRetryEnergyI18n & {
	duplicateEnergyBilled: (params: { total: number }) => string;
	duplicateTitleWithEnergy: (params: { total: number }) => string;
};

export type EwrpHistoryRowEnergyLabels = {
	showRetry: boolean;
	showDuplicate: boolean;
	retryTitle: string | null;
	retryEnergyLine: string | null;
	duplicateTitle: string | null;
	duplicateEnergyLine: string | null;
};

export function buildEwrpHistoryRowEnergyLabels(
	row: Pick<EwrpJobListItem, 'status' | 'num_slides' | 'updated_at'>,
	i18n: EwrpHistoryRowEnergyI18n,
	nowMs: number = Date.now()
): EwrpHistoryRowEnergyLabels {
	const { canRetry, canDuplicate } = ewrpHistoryRowCapabilities(
		row.status,
		row.updated_at,
		nowMs
	);
	const slideCredits = ewrpJobSlideEnergyCredits(row.num_slides);
	return {
		showRetry: canRetry,
		showDuplicate: canDuplicate,
		retryTitle: canRetry
			? ewrpRetryButtonTitle(row.status, row.num_slides, i18n)
			: null,
		retryEnergyLine: canRetry
			? ewrpRetryEnergyDetail(row.status, row.num_slides, i18n)
			: null,
		duplicateTitle: canDuplicate
			? i18n.duplicateTitleWithEnergy({ total: slideCredits })
			: null,
		duplicateEnergyLine: canDuplicate
			? i18n.duplicateEnergyBilled({ total: slideCredits })
			: null,
	};
}
