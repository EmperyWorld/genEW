/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Conditional GET for desktop routes that return ETag + 304.
 * Delegates to shared {@link conditionalJsonGet} with a `desktop:` key namespace.
 *
 * Invariants:
 * - Cache keys are prefixed with `desktop:` to avoid cross-domain collisions.
 *
 * Related:
 * - `services/api/conditionalJsonGet.ts`, `pages/Desktop/services/desktopApi.ts`
 */

import type { AxiosRequestConfig } from 'axios';
import { logCacheInvalidation } from '../../../services/api/cacheInvalidationLogger';
import {
	conditionalJsonGet,
	getConditionalJsonEtag,
	invalidateConditionalJsonKey,
	invalidateConditionalJsonKeysByPrefix,
	updateConditionalJsonCache,
} from '../../../services/api/conditionalJsonGet';

const PREFIX = 'desktop:' as const;

export type DesktopConditionalCacheKey = 'config' | 'shell-state' | 'installed';

export function invalidateDesktopConditionalCache(
	key: DesktopConditionalCacheKey | 'all'
): void {
	logCacheInvalidation('invalidateDesktopConditionalCache', { key });
	if (key === 'all') {
		invalidateConditionalJsonKeysByPrefix(PREFIX);
		return;
	}
	invalidateConditionalJsonKey(`${PREFIX}${key}`);
}

export function getDesktopConditionalCacheEtag(
	key: DesktopConditionalCacheKey
): string | null {
	return getConditionalJsonEtag(`${PREFIX}${key}`);
}

export function updateDesktopConditionalCache(
	key: DesktopConditionalCacheKey,
	body: unknown,
	etag: string | null
): void {
	updateConditionalJsonCache(`${PREFIX}${key}`, body, etag);
}

/**
 * GET JSON with optional If-None-Match; on 304 returns the cached body from the last 200.
 */
export async function desktopConditionalJsonGet<T>(
	cacheKey: DesktopConditionalCacheKey,
	url: string,
	options?: AxiosRequestConfig
): Promise<T> {
	return conditionalJsonGet<T>(`${PREFIX}${cacheKey}`, url, options);
}
