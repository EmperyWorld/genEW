/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Auto-rehydrate desktop shell_state after pipeline `conflict` phase and expose UI phase
 * (attempting / failed) for DesktopSyncStatus without silent retry loops.
 *
 * Invariants:
 * - One auto-recovery attempt per conflict episode; pipeline phase transitions do not retrigger recover.
 * - Failed auto-recover stays visible until conflict clears or the user retries.
 *
 * Related:
 * - desktopShellStateMutationPipeline.ts, DesktopSyncStatus.tsx
 * - documentation/product/desktop/DESKTOP-STATE-PERSISTENCE.md
 * ---
 */

import * as React from 'react';
import {
	getShellStatePipelineSnapshot,
	resolveShellStateConflict,
	subscribeShellStatePipeline,
} from '../utils/desktopShellStateMutationPipeline';

const STALE_SHELL_AUTO_RECOVER_DELAY_MS = 120;
const STALE_SHELL_RECOVER_OUTCOME_CHECK_MS = 32;
const PIPELINE_CONFLICT_FAILED_SIGNATURE = 'pipeline:conflict';

export type StaleShellAutoRecoverPhase = 'idle' | 'attempting' | 'failed';

type StaleShellAutoRecoverSnapshot = {
	phase: StaleShellAutoRecoverPhase;
	lastFailedSignature: string | null;
};

let autoRecoverSnapshot: StaleShellAutoRecoverSnapshot = {
	phase: 'idle',
	lastFailedSignature: null,
};

const autoRecoverListeners = new Set<() => void>();

function emitAutoRecoverSnapshot(): void {
	for (const listener of autoRecoverListeners) {
		listener();
	}
}

function setAutoRecoverSnapshot(
	patch: Partial<StaleShellAutoRecoverSnapshot>
): void {
	autoRecoverSnapshot = { ...autoRecoverSnapshot, ...patch };
	emitAutoRecoverSnapshot();
}

function setAutoRecoverPhase(
	phase: StaleShellAutoRecoverPhase,
	lastFailedSignature: string | null = autoRecoverSnapshot.lastFailedSignature
): void {
	if (
		autoRecoverSnapshot.phase === phase &&
		autoRecoverSnapshot.lastFailedSignature === lastFailedSignature
	) {
		return;
	}
	setAutoRecoverSnapshot({ phase, lastFailedSignature });
}

export function subscribeStaleShellAutoRecover(
	listener: () => void
): () => void {
	autoRecoverListeners.add(listener);
	return () => {
		autoRecoverListeners.delete(listener);
	};
}

export function getStaleShellAutoRecoverSnapshot(): StaleShellAutoRecoverSnapshot {
	return autoRecoverSnapshot;
}

/** Client-session telemetry for diagnostics export surfaces. */
export function getStaleShellAutoRecoverDiagnostics(): {
	phase: StaleShellAutoRecoverPhase;
	lastFailedSignature: string | null;
} {
	const { phase, lastFailedSignature } = autoRecoverSnapshot;
	return { phase, lastFailedSignature };
}

export function useStaleShellAutoRecoverUiState(): StaleShellAutoRecoverPhase {
	return React.useSyncExternalStore(
		subscribeStaleShellAutoRecover,
		() => getStaleShellAutoRecoverSnapshot().phase,
		() => getStaleShellAutoRecoverSnapshot().phase
	);
}

export function notifyStaleShellManualRecoverStarted(): void {
	setAutoRecoverPhase('attempting');
}

export function scheduleStaleShellRecoverOutcomeCheck(
	isConflictActive: () => boolean,
	failedSignature: string | null = null
): void {
	window.setTimeout(() => {
		if (isConflictActive()) {
			setAutoRecoverPhase('failed', failedSignature);
			return;
		}
		setAutoRecoverPhase('idle', null);
	}, STALE_SHELL_RECOVER_OUTCOME_CHECK_MS);
}

/** Test-only reset for module-level auto-recover UI snapshot. */
export function resetStaleShellAutoRecoverUiForTests(): void {
	autoRecoverSnapshot = { phase: 'idle', lastFailedSignature: null };
	emitAutoRecoverSnapshot();
}

/** Test-only phase setter for DesktopSyncStatus regression tests. */
export function setStaleShellAutoRecoverPhaseForTests(
	phase: StaleShellAutoRecoverPhase,
	lastFailedSignature: string | null = null
): void {
	setAutoRecoverSnapshot({ phase, lastFailedSignature });
}

/**
 * Listens to shell-state mutation pipeline `conflict` phase and performs one bounded
 * auto-recover (reload GET + pipeline resume) per conflict episode.
 */
export function useDesktopStaleShellStateAutoRecover(): void {
	const conflictAttemptedRef = React.useRef(false);
	const recoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
		null
	);

	React.useEffect(() => {
		const clearRecoverTimeout = () => {
			if (recoverTimeoutRef.current != null) {
				window.clearTimeout(recoverTimeoutRef.current);
				recoverTimeoutRef.current = null;
			}
		};

		const unsubscribe = subscribeShellStatePipeline((snapshot) => {
			if (snapshot.phase === 'idle') {
				clearRecoverTimeout();
				conflictAttemptedRef.current = false;
				setAutoRecoverPhase('idle', null);
				return;
			}

			if (snapshot.phase !== 'conflict') {
				clearRecoverTimeout();
				return;
			}

			if (conflictAttemptedRef.current) return;
			conflictAttemptedRef.current = true;

			clearRecoverTimeout();
			recoverTimeoutRef.current = window.setTimeout(() => {
				recoverTimeoutRef.current = null;
				setAutoRecoverPhase('attempting', null);
				void (async () => {
					try {
						await resolveShellStateConflict();
					} catch {
						// Outcome is resolved after pipeline phase settles.
					} finally {
						scheduleStaleShellRecoverOutcomeCheck(
							() => getShellStatePipelineSnapshot().phase === 'conflict',
							PIPELINE_CONFLICT_FAILED_SIGNATURE
						);
					}
				})();
			}, STALE_SHELL_AUTO_RECOVER_DELAY_MS);
		});

		return () => {
			unsubscribe();
			clearRecoverTimeout();
		};
	}, []);
}
