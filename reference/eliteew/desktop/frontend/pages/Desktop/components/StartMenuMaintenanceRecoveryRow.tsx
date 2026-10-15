/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Start Menu row to reopen the dismissed server-maintenance recovery chip (plan 01 P1-5).
 *
 * Invariants:
 * - Shown only when maintenance gate is active and the taskbar chip was dismissed this session.
 *
 * Related:
 * - `DesktopTaskbarRecoveryChip.tsx`, `StartMenu.tsx`
 */

import { ArrowPathIcon } from '@heroicons/react/24/outline';
import * as React from 'react';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
	getCurrentMaintenanceStatus,
	subscribeMaintenanceStatus,
} from '@/services/maintenance/maintenanceState';
import { cn } from '@/utils/cn';
import { isDesktopShellRoute } from '@/utils/desktopShellRoute';
import { DESKTOP_INTERACTIVE, DESKTOP_TYPOGRAPHY } from '../constants';
import { shouldDeferDesktopLoadingToMaintenance } from '../hooks/useDesktopMaintenanceAwareLoading';
import {
	clearMaintenanceRecoveryDismissed,
	isMaintenanceRecoveryDismissed,
	subscribeMaintenanceRecoveryDismissed,
} from './DesktopTaskbarRecoveryChip';

export function StartMenuMaintenanceRecoveryRow(): React.JSX.Element | null {
	const { t } = useTranslation('desktopUi');
	const maintenanceStatus = useSyncExternalStore(
		subscribeMaintenanceStatus,
		getCurrentMaintenanceStatus,
		getCurrentMaintenanceStatus
	);
	const dismissed = useSyncExternalStore(
		subscribeMaintenanceRecoveryDismissed,
		isMaintenanceRecoveryDismissed,
		isMaintenanceRecoveryDismissed
	);

	if (
		!isDesktopShellRoute() ||
		!shouldDeferDesktopLoadingToMaintenance(maintenanceStatus) ||
		!dismissed
	) {
		return null;
	}

	return (
		<div className="border-t border-(--desktop-border-subtle) px-3 py-2">
			<button
				type="button"
				onClick={() => clearMaintenanceRecoveryDismissed()}
				className={cn(
					'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-(--desktop-text-secondary) fine-hover:bg-(--desktop-surface-soft-hover) fine-hover:text-(--desktop-text-primary)',
					DESKTOP_INTERACTIVE.focusRing
				)}
			>
				<ArrowPathIcon
					className="size-4 shrink-0 text-lime-300/90"
					aria-hidden
				/>
				<span className={DESKTOP_TYPOGRAPHY.small}>
					{t('taskbar.maintenanceRecoveryRestore')}
				</span>
			</button>
			<p
				className={cn(
					DESKTOP_TYPOGRAPHY.meta,
					'mt-1 px-3 text-(--desktop-text-muted)'
				)}
			>
				{t('taskbar.maintenanceRecoveryRestoreHint')}
			</p>
		</div>
	);
}
