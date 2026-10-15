/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Contract tests for Image Studio API helpers (idempotency key, 402 mapping).
 *
 * Invariants:
 * - newIdempotencyKey returns UUID-shaped string when crypto.randomUUID exists.
 * - mapApiError maps 402 detail.code insufficient_credits for i18n.
 *
 * Related:
 * - imageStudioApi.ts
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { mapApiError, newIdempotencyKey } from '../imageStudioApi';

describe('imageStudioApi', () => {
	describe('newIdempotencyKey', () => {
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it('returns a UUID when crypto.randomUUID is available', () => {
			const uuid = '550e8400-e29b-41d4-a716-446655440000';
			vi.stubGlobal('crypto', {
				randomUUID: () => uuid,
			});
			expect(newIdempotencyKey()).toBe(uuid);
		});

		it('falls back to a non-empty unique-ish string without randomUUID', () => {
			vi.stubGlobal('crypto', {});
			const key = newIdempotencyKey();
			expect(typeof key).toBe('string');
			expect(key.length).toBeGreaterThan(8);
			expect(key).toMatch(/^\d+-/);
		});
	});

	describe('mapApiError', () => {
		it('maps 402 structured detail.code to insufficient_credits', () => {
			const mapped = mapApiError({
				response: {
					status: 402,
					data: {
						detail: {
							code: 'insufficient_credits',
							message: 'Insufficient credits: need 5',
						},
					},
				},
			});
			expect(mapped.status).toBe(402);
			expect(mapped.code).toBe('insufficient_credits');
			expect(mapped.message).toContain('Insufficient credits');
		});

		it('maps bare 402 to insufficient_credits code', () => {
			const mapped = mapApiError({
				response: {
					status: 402,
					data: { detail: 'insufficient_credits' },
				},
				message: 'Request failed',
			});
			expect(mapped.code).toBe('insufficient_credits');
		});

		it('maps 413 to payload_too_large', () => {
			const mapped = mapApiError({
				response: { status: 413, data: {} },
			});
			expect(mapped.code).toBe('payload_too_large');
		});
	});
});
