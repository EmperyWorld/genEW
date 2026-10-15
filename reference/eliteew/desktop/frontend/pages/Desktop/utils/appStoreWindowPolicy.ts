/**
 * Единая логика «сколько окон может открыть приложение из витрины»
 * (см. API allow_multiple_windows / max_window_instances).
 */
export function getAppStoreWindowInstanceCap(app: {
	allow_multiple_windows?: boolean;
	max_window_instances?: number | null;
}): { maxInstances: number; allowsMultipleInstances: boolean } {
	const maxInstances = Math.max(1, Number(app.max_window_instances) || 1);
	const allowsMultipleInstances =
		app.allow_multiple_windows === true && maxInstances > 1;
	return { maxInstances, allowsMultipleInstances };
}
