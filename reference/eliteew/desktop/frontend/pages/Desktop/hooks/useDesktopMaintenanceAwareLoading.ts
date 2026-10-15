/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Bridges global maintenance/recovery store with desktop storage loading UI (variant + defer to overlay).
 *
 * Invariants:
 * - Gate/recovering phases defer desktop loading shell to MaintenanceProvider overlay.
 * - Stalled or active maintenance uses recovery preloader variant, not boot fake progress.
 *
 * Related:
 * - `hooks/useDesktopWorkspaceChromeState.ts`
 * - `services/maintenance/maintenanceState.ts`
 */

import { useEffect, useMemo, useState } from 'react';
import type { ElitePreloaderProgressVariant } from '@/components/ui/ElitePreloaderProgressQuote';
import {
	getCurrentMaintenanceStatus,
	isMaintenanceGatePhase,
	subscribeMaintenanceStatus,
	type MaintenanceStatus,
	type MaintenanceWindow,
} from '@/services/maintenance/maintenanceState';

export function shouldDeferDesktopLoadingToMaintenance(
	status: MaintenanceStatus
): boolean {
	const window = status.window;
	if (!status.active || !window?.active) {
		return false;
	}
	return isMaintenanceGatePhase(status) || window.phase === 'recovering';
}

function formatMaintenanceStatusLabel(window: MaintenanceWindow): string {
	const end = window.expected_ends_at
		? new Date(window.expected_ends_at)
		: null;
	if (end && !Number.isNaN(end.getTime())) {
		const endTime = new Intl.DateTimeFormat('ru-RU', {
			hour: '2-digit',
			minute: '2-digit',
		}).format(end);
		return `Ориентир восстановления: ${endTime}`;
	}
	return `Следующая проверка связи через ${window.retry_after_seconds} с`;
}

export function useDesktopMaintenanceAwareLoading(params: {
	isLoadingStalled: boolean;
}): {
	maintenanceStatus: MaintenanceStatus;
	deferLoadingShellToMaintenance: boolean;
	preloaderVariant: ElitePreloaderProgressVariant;
	isServerRecoveryContext: boolean;
	maintenanceTitle: string | null;
	desktopMaintenanceOverlay: {
		windowId: string;
		title: string;
		message: string;
		statusLabel: string;
	} | null;
} {
	const { isLoadingStalled } = params;
	const [maintenanceStatus, setMaintenanceStatus] = useState<MaintenanceStatus>(
		() => getCurrentMaintenanceStatus()
	);

	useEffect(() => subscribeMaintenanceStatus(setMaintenanceStatus), []);

	return useMemo(() => {
		const maintenanceActive = Boolean(
			maintenanceStatus.active && maintenanceStatus.window?.active
		);
		const isServerRecoveryContext = maintenanceActive || isLoadingStalled;
		const preloaderVariant: ElitePreloaderProgressVariant =
			isServerRecoveryContext ? 'recovery' : 'boot';

		return {
			maintenanceStatus,
			deferLoadingShellToMaintenance:
				shouldDeferDesktopLoadingToMaintenance(maintenanceStatus),
			preloaderVariant,
			isServerRecoveryContext,
			maintenanceTitle: maintenanceActive
				? (maintenanceStatus.window?.title?.trim() ?? null)
				: null,
			desktopMaintenanceOverlay:
				maintenanceActive &&
				maintenanceStatus.window &&
				shouldDeferDesktopLoadingToMaintenance(maintenanceStatus)
					? {
							windowId: maintenanceStatus.window.id,
							title: maintenanceStatus.window.title,
							message: maintenanceStatus.window.message,
							statusLabel: formatMaintenanceStatusLabel(
								maintenanceStatus.window
							),
						}
					: null,
		};
	}, [isLoadingStalled, maintenanceStatus]);
}
