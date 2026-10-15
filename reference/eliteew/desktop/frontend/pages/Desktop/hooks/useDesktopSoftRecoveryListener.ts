/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Soft recovery for `#desktop` after maintenance — refresh storage without hard tab reload.
 *
 * Invariants:
 * - Listens to `DESKTOP_SOFT_RECOVERY_EVENT` from `requestMaintenanceReturn`.
 * - Clears reload hold only after `/api/health` + maintenance API confirm recovery.
 *
 * Related:
 * - `utils/staleBundleReload.ts`
 * - `services/maintenance/reloadCircuitBreaker.ts`
 */

import { useEffect } from 'react';
import { performDesktopSoftRecovery } from '@/services/maintenance/performDesktopSoftRecovery';
import { DESKTOP_SOFT_RECOVERY_EVENT } from '@/utils/staleBundleReload';

export function useDesktopSoftRecoveryListener(
	refreshStorage: () => void | Promise<void>
): void {
	useEffect(() => {
		const onSoftRecovery = (): void => {
			void performDesktopSoftRecovery(refreshStorage);
		};

		window.addEventListener(DESKTOP_SOFT_RECOVERY_EVENT, onSoftRecovery);
		return () => {
			window.removeEventListener(DESKTOP_SOFT_RECOVERY_EVENT, onSoftRecovery);
		};
	}, [refreshStorage]);
}
