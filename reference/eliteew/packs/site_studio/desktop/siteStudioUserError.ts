import type { TFunction } from 'i18next';
import { APIError } from '@/services/api/client';
import { SiteStudioImageFetchError } from './api';

/**
 * User-facing message for Site Studio / proxy failures. Prefer over raw API `detail`
 * for 409/502/503 so internal wording does not leak to the UI.
 */
export function getSiteStudioUserFacingMessage(
	error: unknown,
	t: TFunction<'siteStudio'>
): string | null {
	if (error instanceof SiteStudioImageFetchError) {
		return t('errors.imageFetchFailed', { status: error.httpStatus });
	}
	if (error instanceof APIError) {
		if (error.statusCode === 409) {
			return t('errors.runtimeNotReady');
		}
		if (error.statusCode === 502 || error.statusCode === 503) {
			return t('errors.proxyUnavailable');
		}
		if (error.statusCode === 504) {
			return t('errors.gatewayTimeout');
		}
	}
	return null;
}
