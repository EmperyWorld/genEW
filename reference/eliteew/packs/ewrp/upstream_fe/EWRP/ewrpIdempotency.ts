/**
 * Client idempotency key for POST /ewrp (matches server policy via `Idempotency-Key`).
 */
export function createEwrpIdempotencyKey(): string {
	if (
		typeof crypto !== 'undefined' &&
		typeof crypto.randomUUID === 'function'
	) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
