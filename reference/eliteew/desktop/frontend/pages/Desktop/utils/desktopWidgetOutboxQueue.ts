/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Wave B subject-scoped localStorage outbox for desktop widget mutations.
 * Flush posts one transactional `POST /desktop/widget-sync` with a stable
 * Idempotency-Key retained across network drops / 5xx until 2xx clears the queue.
 *
 * Invariants:
 * - Clear ops + inflight key only after successful 2xx sync (or idempotent replay 2xx).
 * - Mid-request abort / 500 keeps outbox intact and reuses the same Idempotency-Key.
 * - Cap at MAX_OPS; oldest trimmed with warn log.
 *
 * Related:
 * - utils/desktopPersistPatchQueue.ts (pattern mirror)
 * - services/desktopApi.ts (`syncDesktopWidgets`)
 * - documentation/product/desktop/DESKTOP-STATE-PERSISTENCE.md
 */

import { log } from '@/utils/logger';

export const DESKTOP_WIDGET_OUTBOX_STORAGE_KEY =
	'eliteew-desktop-widget-outbox-v1' as const;

const MAX_OPS = 200;

export type WidgetOutboxOpKind =
	| 'note_create'
	| 'note_update'
	| 'note_delete'
	| 'todo_create'
	| 'todo_update'
	| 'todo_delete'
	| 'favorite_create'
	| 'favorite_delete'
	| 'favorite_reorder';

export type WidgetOutboxOp = {
	op_id: string;
	kind: WidgetOutboxOpKind;
	client_id?: string | null;
	server_id?: string | null;
	/** ISO timestamp for LWW */
	ts: string;
	payload: Record<string, unknown>;
};

export type WidgetOutboxEnvelope = {
	version: 1;
	subject: string;
	ops: WidgetOutboxOp[];
	/**
	 * Stable key for the current flush attempt. Set on first flush start;
	 * cleared only with the queue after 2xx. Network drop mid-request reuses it.
	 */
	inflightIdempotencyKey: string | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let lastCountSnapshot: { subject: string | null; total: number } = {
	subject: null,
	total: 0,
};

function notify() {
	for (const fn of listeners) {
		try {
			fn();
		} catch {
			// ignore listener errors
		}
	}
}

export function subscribeDesktopWidgetOutbox(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function normalizeEnvelope(raw: unknown): WidgetOutboxEnvelope | null {
	if (raw == null || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	if (
		o.version !== 1 ||
		typeof o.subject !== 'string' ||
		!Array.isArray(o.ops)
	) {
		return null;
	}
	const key =
		typeof o.inflightIdempotencyKey === 'string'
			? o.inflightIdempotencyKey
			: null;
	return {
		version: 1,
		subject: o.subject,
		ops: o.ops as WidgetOutboxOp[],
		inflightIdempotencyKey: key,
	};
}

function loadRaw(): WidgetOutboxEnvelope | null {
	try {
		const s = localStorage.getItem(DESKTOP_WIDGET_OUTBOX_STORAGE_KEY);
		if (!s) return null;
		return normalizeEnvelope(JSON.parse(s) as unknown);
	} catch {
		return null;
	}
}

function save(env: WidgetOutboxEnvelope) {
	try {
		localStorage.setItem(
			DESKTOP_WIDGET_OUTBOX_STORAGE_KEY,
			JSON.stringify(env)
		);
		notify();
	} catch (e) {
		log.warn(
			'Desktop',
			'Widget outbox save failed',
			e instanceof Error ? e : undefined
		);
	}
}

export function clearDesktopWidgetOutbox(): void {
	try {
		localStorage.removeItem(DESKTOP_WIDGET_OUTBOX_STORAGE_KEY);
		notify();
	} catch {
		// ignore
	}
}

function ensureEnvelope(subject: string): WidgetOutboxEnvelope {
	const cur = loadRaw();
	if (!cur || cur.subject !== subject) {
		return {
			version: 1,
			subject,
			ops: [],
			inflightIdempotencyKey: null,
		};
	}
	return cur;
}

function newOpId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `wop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function newIdempotencyKey(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `widem-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function enqueueDesktopWidgetOutboxOp(
	subject: string,
	op: Omit<WidgetOutboxOp, 'op_id' | 'ts'> & {
		op_id?: string;
		ts?: string;
	}
): WidgetOutboxOp {
	let env = ensureEnvelope(subject);
	if (env.subject !== subject) {
		env = {
			version: 1,
			subject,
			ops: [],
			inflightIdempotencyKey: null,
		};
	}
	const full: WidgetOutboxOp = {
		op_id: op.op_id ?? newOpId(),
		kind: op.kind,
		client_id: op.client_id ?? null,
		server_id: op.server_id ?? null,
		ts: op.ts ?? new Date().toISOString(),
		payload: { ...op.payload },
	};
	env.ops.push(full);
	if (env.ops.length > MAX_OPS) {
		const drop = env.ops.length - MAX_OPS;
		env.ops.splice(0, drop);
		log.warn(
			'Desktop',
			`Widget outbox trimmed ${drop} oldest ops (max ${MAX_OPS})`
		);
	}
	save(env);
	return full;
}

export function getDesktopWidgetOutboxCount(subject: string | null): number {
	if (!subject) {
		if (lastCountSnapshot.subject === null && lastCountSnapshot.total === 0) {
			return 0;
		}
		lastCountSnapshot = { subject: null, total: 0 };
		return 0;
	}
	const env = loadRaw();
	const total = env && env.subject === subject ? env.ops.length : 0;
	if (
		lastCountSnapshot.subject === subject &&
		lastCountSnapshot.total === total
	) {
		return lastCountSnapshot.total;
	}
	lastCountSnapshot = { subject, total };
	return total;
}

export function peekDesktopWidgetOutbox(
	subject: string
): WidgetOutboxEnvelope | null {
	const env = loadRaw();
	if (!env || env.subject !== subject) return null;
	return env;
}

export type FlushDesktopWidgetOutboxParams = {
	subject: string;
	/**
	 * POST widget-sync. Must throw on non-2xx / network abort.
	 * Caller must NOT clear outbox on throw.
	 */
	syncBatch: (args: {
		ops: WidgetOutboxOp[];
		idempotencyKey: string;
	}) => Promise<unknown>;
};

/**
 * Flush entire outbox as one transactional sync.
 * On failure: keeps ops + inflight Idempotency-Key (network drop / 500 safe).
 * On success: clears queue.
 */
export async function flushDesktopWidgetOutbox(
	params: FlushDesktopWidgetOutboxParams
): Promise<{ ok: boolean; error?: string; syncError: boolean }> {
	const env = loadRaw();
	if (!env || env.ops.length === 0 || env.subject !== params.subject) {
		return { ok: true, syncError: false };
	}

	const idempotencyKey =
		env.inflightIdempotencyKey && env.inflightIdempotencyKey.length >= 8
			? env.inflightIdempotencyKey
			: newIdempotencyKey();

	if (env.inflightIdempotencyKey !== idempotencyKey) {
		save({ ...env, inflightIdempotencyKey: idempotencyKey });
	}

	try {
		await params.syncBatch({
			ops: [...env.ops],
			idempotencyKey,
		});
	} catch (err) {
		const error =
			err instanceof Error ? err.message : 'widget outbox flush failed';
		// Keep ops + key — UI must show syncError; retry reuses Idempotency-Key.
		return { ok: false, error, syncError: true };
	}

	clearDesktopWidgetOutbox();
	return { ok: true, syncError: false };
}
