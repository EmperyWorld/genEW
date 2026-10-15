/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Parse Axios-style EWRP API errors and map HTTP status to user notify categories.
 *
 * Invariants:
 * - 402 / 503 handling matches `EwrpSlideEditorPanel` and create/retry flows.
 *
 * Related:
 * - `ewrpSlideEditorHelpers.ts`, `EWRPGeneratorMain.tsx`, `ewrpApi.ts`
 */

export type EwrpHttpErrorNotifyKind =
	| 'insufficient_energy'
	| 'service_unavailable'
	| 'generic';

export type EwrpHttpErrorNotifyPlan = {
	kind: EwrpHttpErrorNotifyKind;
	detail: string;
	statusCode?: number;
};

export function extractEwrpHttpStatus(err: unknown): number | undefined {
	if (typeof err !== 'object' || err === null) return undefined;
	const status = (err as { response?: { status?: number } }).response?.status;
	return typeof status === 'number' ? status : undefined;
}

export function extractEwrpApiErrorDetail(
	err: unknown,
	fallback: string
): string {
	if (typeof err !== 'object' || err === null) return fallback;
	const data = (err as { response?: { data?: { detail?: unknown } } }).response
		?.data;
	const detail = data?.detail;
	if (typeof detail === 'string') return detail;
	if (Array.isArray(detail) && detail.length > 0) {
		const first = detail[0];
		if (typeof first === 'object' && first !== null && 'msg' in first) {
			return String((first as { msg?: string }).msg ?? fallback);
		}
		return String(first);
	}
	return fallback;
}

/** Classify billing/catalog HTTP errors for toast title selection. */
export function resolveEwrpHttpErrorNotify(
	err: unknown,
	fallback: string
): EwrpHttpErrorNotifyPlan {
	const detail = extractEwrpApiErrorDetail(err, fallback);
	const statusCode = extractEwrpHttpStatus(err);
	if (statusCode === 402) {
		return { kind: 'insufficient_energy', detail, statusCode };
	}
	if (statusCode === 503) {
		return { kind: 'service_unavailable', detail, statusCode };
	}
	return { kind: 'generic', detail, statusCode };
}

export type EwrpHttpErrorNotifier = {
	error: (title: string, subtitle?: string) => void;
};

/** Show toast for EWRP API errors (402 energy, 503 catalog, generic detail). */
export function notifyEwrpHttpError(
	err: unknown,
	fallback: string,
	notifyApi: EwrpHttpErrorNotifier,
	t: (key: string) => string
): void {
	const plan = resolveEwrpHttpErrorNotify(err, fallback);
	if (plan.kind === 'insufficient_energy') {
		notifyApi.error(t('notify.insufficientEnergy'), plan.detail);
	} else if (plan.kind === 'service_unavailable') {
		notifyApi.error(t('notify.serviceTemporarilyUnavailable'), plan.detail);
	} else {
		notifyApi.error(plan.detail);
	}
}
