/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared load-stall guard for EWA companion fetches — mirrors desktop `LOAD_STALL_MS` (12s).
 *
 * Invariants:
 * - Clears stall timer when the wrapped promise settles (success or failure).
 * - Rejects with {@link EwaCompanionLoadTimeoutError} (message `Request Timeout`).
 *
 * Related:
 * - src/features/ewa/EwaDesktopApp.tsx
 * - src/pages/Desktop/hooks/useDesktopStorage.ts
 */

/** Align with desktop workspace bootstrap stall window. */
export const EWA_COMPANION_LOAD_STALL_MS = 12_000;

export const EWA_COMPANION_LOAD_TIMEOUT_MESSAGE = 'Request Timeout';

export class EwaCompanionLoadTimeoutError extends Error {
	constructor(message: string = EWA_COMPANION_LOAD_TIMEOUT_MESSAGE) {
		super(message);
		this.name = 'EwaCompanionLoadTimeoutError';
	}
}

export function isEwaCompanionLoadTimeoutError(
	error: unknown
): error is EwaCompanionLoadTimeoutError {
	return (
		error instanceof EwaCompanionLoadTimeoutError ||
		(error instanceof Error &&
			error.message === EWA_COMPANION_LOAD_TIMEOUT_MESSAGE)
	);
}

/**
 * Race `promise` against a stall timer; reject when the timer fires first.
 */
export function withEwaCompanionLoadStall<T>(
	promise: Promise<T>,
	stallMs: number = EWA_COMPANION_LOAD_STALL_MS
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = globalThis.setTimeout(() => {
			reject(new EwaCompanionLoadTimeoutError());
		}, stallMs);

		void promise
			.then((value) => {
				globalThis.clearTimeout(timer);
				resolve(value);
			})
			.catch((error: unknown) => {
				globalThis.clearTimeout(timer);
				reject(error);
			});
	});
}
