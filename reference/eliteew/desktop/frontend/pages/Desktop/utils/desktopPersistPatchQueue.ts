/**
 * FIFO queue for desktop config / shell_state PATCH when offline or after network errors.
 * Persists to localStorage; isolated per auth subject; no silent drop (flush or manual retry).
 */

import { log } from '@/utils/logger';

const QUEUE_STORAGE_KEY = 'eliteew-desktop-persist-patch-queue-v1';
const MAX_OPS = 48;

export type PersistPatchQueueOp =
	| {
			kind: 'config';
			payload: Record<string, unknown>;
	  }
	| {
			kind: 'shell';
			payload: Record<string, unknown>;
	  };

export type PersistPatchQueueEnvelope = {
	version: 1;
	subject: string;
	ops: PersistPatchQueueOp[];
};

type Listener = () => void;
type PersistPatchQueueCounts = {
	config: number;
	shell: number;
	total: number;
};

const listeners = new Set<Listener>();
let lastCountsSnapshot: {
	subject: string | null;
	counts: PersistPatchQueueCounts;
} = {
	subject: null,
	counts: { config: 0, shell: 0, total: 0 },
};

function notify() {
	for (const fn of listeners) {
		try {
			fn();
		} catch {
			// ignore
		}
	}
}

export function subscribeDesktopPersistPatchQueue(
	listener: Listener
): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function normalizeEnvelope(raw: unknown): PersistPatchQueueEnvelope | null {
	if (raw == null || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	if (
		o.version !== 1 ||
		typeof o.subject !== 'string' ||
		!Array.isArray(o.ops)
	) {
		return null;
	}
	return {
		version: 1,
		subject: o.subject,
		ops: o.ops as PersistPatchQueueOp[],
	};
}

function loadRaw(): PersistPatchQueueEnvelope | null {
	try {
		const s = localStorage.getItem(QUEUE_STORAGE_KEY);
		if (!s) return null;
		return normalizeEnvelope(JSON.parse(s) as unknown);
	} catch {
		return null;
	}
}

function save(env: PersistPatchQueueEnvelope) {
	try {
		localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(env));
		notify();
	} catch (e) {
		log.warn(
			'Desktop',
			'Persist patch queue save failed',
			e instanceof Error ? e : undefined
		);
	}
}

/** Remove stored queue (logout / subject switch / tests). */
export function clearDesktopPersistPatchQueue(): void {
	try {
		localStorage.removeItem(QUEUE_STORAGE_KEY);
		notify();
	} catch {
		// ignore
	}
}

function ensureEnvelope(subject: string): PersistPatchQueueEnvelope {
	const cur = loadRaw();
	if (!cur || cur.subject !== subject) {
		return { version: 1, subject, ops: [] };
	}
	return cur;
}

function stableCountsSnapshot(
	subject: string | null,
	counts: PersistPatchQueueCounts
): PersistPatchQueueCounts {
	const prev = lastCountsSnapshot;
	if (
		prev.subject === subject &&
		prev.counts.config === counts.config &&
		prev.counts.shell === counts.shell &&
		prev.counts.total === counts.total
	) {
		return prev.counts;
	}

	lastCountsSnapshot = { subject, counts };
	return counts;
}

export function enqueueDesktopPersistConfigPatch(
	subject: string,
	payload: Record<string, unknown>
): void {
	const keys = Object.keys(payload);
	if (keys.length === 0) return;
	let env = ensureEnvelope(subject);
	if (env.subject !== subject) {
		env = { version: 1, subject, ops: [] };
	}
	env.ops.push({ kind: 'config', payload: { ...payload } });
	if (env.ops.length > MAX_OPS) {
		const drop = env.ops.length - MAX_OPS;
		env.ops.splice(0, drop);
		log.warn(
			'Desktop',
			`Persist patch queue trimmed ${drop} oldest ops (max ${MAX_OPS})`
		);
	}
	save(env);
}

export function enqueueDesktopPersistShellPatch(
	subject: string,
	patch: Record<string, unknown>
): void {
	const keys = Object.keys(patch);
	if (keys.length === 0) return;
	let env = ensureEnvelope(subject);
	if (env.subject !== subject) {
		env = { version: 1, subject, ops: [] };
	}
	try {
		env.ops.push({
			kind: 'shell',
			payload: JSON.parse(JSON.stringify(patch)) as Record<string, unknown>,
		});
	} catch {
		log.warn(
			'Desktop',
			'enqueueDesktopPersistShellPatch: failed to clone patch'
		);
		return;
	}
	if (env.ops.length > MAX_OPS) {
		const drop = env.ops.length - MAX_OPS;
		env.ops.splice(0, drop);
		log.warn(
			'Desktop',
			`Persist patch queue trimmed ${drop} oldest ops (max ${MAX_OPS})`
		);
	}
	save(env);
}

export function getDesktopPersistPatchQueueCounts(subject: string | null): {
	config: number;
	shell: number;
	total: number;
} {
	if (!subject) {
		return stableCountsSnapshot(null, { config: 0, shell: 0, total: 0 });
	}
	const env = loadRaw();
	if (!env || env.subject !== subject) {
		return stableCountsSnapshot(subject, { config: 0, shell: 0, total: 0 });
	}
	let config = 0;
	let shell = 0;
	for (const op of env.ops) {
		if (op.kind === 'config') config += 1;
		else shell += 1;
	}
	return stableCountsSnapshot(subject, {
		config,
		shell,
		total: env.ops.length,
	});
}

export type FlushDesktopPersistPatchQueueParams = {
	subject: string;
	patchConfig: (payload: Record<string, unknown>) => Promise<void>;
	patchShell: (payload: Record<string, unknown>) => Promise<void>;
};

/**
 * Apply queued ops in order. Stops on first failure; remaining ops stay queued.
 * @returns true if queue drained (or was empty)
 */
export async function flushDesktopPersistPatchQueue(
	params: FlushDesktopPersistPatchQueueParams
): Promise<{ ok: boolean; error?: string }> {
	const env = loadRaw();
	if (!env || env.ops.length === 0 || env.subject !== params.subject) {
		return { ok: true };
	}

	const remaining: PersistPatchQueueOp[] = [...env.ops];
	let error: string | undefined;

	while (remaining.length > 0) {
		const next = remaining[0];
		try {
			if (next.kind === 'config') {
				await params.patchConfig(next.payload);
			} else {
				await params.patchShell(next.payload);
			}
			remaining.shift();
			save({ ...env, ops: remaining });
		} catch (err) {
			error =
				err instanceof Error ? err.message : 'desktop persist flush failed';
			save({ ...env, ops: remaining });
			return { ok: false, error };
		}
	}

	clearDesktopPersistPatchQueue();
	return { ok: true };
}
