/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Wave B bridge: auto-flush desktop widget outbox when online; expose syncError
 * without clearing outbox on mid-request abort / HTTP 500.
 *
 * Invariants:
 * - Flush only when subject + online; reuse Idempotency-Key via outbox envelope.
 * - On failure set widgetOutboxFlushFailed; keep queue intact.
 * - Auto-flush once per online subject session (mirror persist queue).
 *
 * Related:
 * - utils/desktopWidgetOutboxQueue.ts
 * - services/desktopApi.ts (`syncDesktopWidgets`)
 */

import * as React from 'react';
import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { syncDesktopWidgets } from '../services/desktopApi';
import {
	flushDesktopWidgetOutbox,
	getDesktopWidgetOutboxCount,
	subscribeDesktopWidgetOutbox,
} from '../utils/desktopWidgetOutboxQueue';

export function useDesktopWidgetOutboxFlush(params: {
	persistSubjectKey: string | null;
	isOnline: boolean;
}) {
	const { persistSubjectKey, isOnline } = params;
	const queryClient = useQueryClient();
	const [widgetOutboxFlushFailed, setWidgetOutboxFlushFailed] = React.useState<
		string | null
	>(null);
	const [widgetOutboxFlushing, setWidgetOutboxFlushing] = React.useState(false);
	const autoFlushedSubjectRef = React.useRef<string | null>(null);

	const widgetOutboxPendingCount = useSyncExternalStore(
		subscribeDesktopWidgetOutbox,
		() => getDesktopWidgetOutboxCount(persistSubjectKey),
		() => getDesktopWidgetOutboxCount(null)
	);

	const flushWidgetOutbox = React.useCallback(async (): Promise<boolean> => {
		if (!persistSubjectKey || !isOnline) return false;
		setWidgetOutboxFlushing(true);
		try {
			const { ok, error, syncError } = await flushDesktopWidgetOutbox({
				subject: persistSubjectKey,
				syncBatch: async ({ ops, idempotencyKey }) => {
					await syncDesktopWidgets(
						{
							ops: ops.map((op) => ({
								op_id: op.op_id,
								kind: op.kind,
								client_id: op.client_id ?? null,
								server_id: op.server_id ?? null,
								ts: op.ts,
								payload: op.payload,
							})),
						},
						idempotencyKey
					);
				},
			});
			if (!ok) {
				setWidgetOutboxFlushFailed(error ?? 'widget-sync failed');
				return false;
			}
			setWidgetOutboxFlushFailed(null);
			void queryClient.invalidateQueries({
				queryKey: ['desktop', 'widget-notes'],
			});
			void queryClient.invalidateQueries({
				queryKey: ['desktop', 'widget-todos'],
			});
			void queryClient.invalidateQueries({
				queryKey: ['desktop', 'dashboard-favorites'],
			});
			return !syncError;
		} finally {
			setWidgetOutboxFlushing(false);
		}
	}, [isOnline, persistSubjectKey, queryClient]);

	const flushWidgetOutboxRef = React.useRef(flushWidgetOutbox);
	flushWidgetOutboxRef.current = flushWidgetOutbox;

	React.useEffect(() => {
		if (!isOnline) {
			autoFlushedSubjectRef.current = null;
			return;
		}
		if (!persistSubjectKey) return;
		if (autoFlushedSubjectRef.current === persistSubjectKey) return;
		autoFlushedSubjectRef.current = persistSubjectKey;
		void flushWidgetOutboxRef.current();
	}, [isOnline, persistSubjectKey]);

	return {
		widgetOutboxPendingCount,
		widgetOutboxFlushFailed,
		widgetOutboxFlushing,
		flushWidgetOutbox,
	};
}
