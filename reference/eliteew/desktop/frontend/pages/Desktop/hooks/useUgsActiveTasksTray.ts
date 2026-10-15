import { useAuth } from '@/contexts/AuthContext';
import { useUgsTaskTransitionNotifications } from '@/hooks/useUgsTaskTransitionNotifications';
import {
	UGS_DESKTOP_TRAY_TASKS_QUERY_KEY,
	ugsDesktopTraySummaryQueryOptions,
} from '@/services/api/ugsQueryOptions';
import { useQuery } from '@tanstack/react-query';

export { UGS_DESKTOP_TRAY_TASKS_QUERY_KEY };

const TRAY_POLL_ACTIVE_MS = 20_000;
const TRAY_POLL_ACTIVE_BACKGROUND_MS = 45_000;
/** Idle tray safety net (was 90s); active tasks keep the faster cadence above. */
const TRAY_POLL_IDLE_MS = 300_000;

/**
 * Лёгкий опрос UGS для области уведомлений: число «живых» задач без монтирования UGSHub.
 * При активных задачах поллит и в фоне вкладки (реже), чтобы тосты «готово» не ждали открытия UGS Hub.
 */
export function useUgsActiveTasksTray(): {
	activeCount: number;
	isFetching: boolean;
	isError: boolean;
	isSuccess: boolean;
} {
	const { user } = useAuth();
	const enabled = Boolean(user);

	const query = useQuery({
		...ugsDesktopTraySummaryQueryOptions(),
		enabled,
		refetchInterval: (q) => {
			const n = q.state.data?.active_count ?? 0;
			if (n > 0) {
				return document.visibilityState === 'visible'
					? TRAY_POLL_ACTIVE_MS
					: TRAY_POLL_ACTIVE_BACKGROUND_MS;
			}
			return TRAY_POLL_IDLE_MS;
		},
	});

	useUgsTaskTransitionNotifications(query.data?.recent_transitions, enabled);

	return {
		activeCount: query.data?.active_count ?? 0,
		isFetching: query.isFetching,
		isError: query.isError,
		isSuccess: query.isSuccess,
	};
}
