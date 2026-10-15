/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Compact taskbar hint while server maintenance gate is active on `#desktop`.
 *
 * Invariants:
 * - Shown only during draining/active/recovering maintenance phases on desktop route.
 * - Dismiss hides chip for session; Start menu can reopen via `clearMaintenanceRecoveryDismissed`.
 *
 * Related:
 * - `components/TaskbarRightToolbar.tsx`, `StartMenu.tsx`
 */

import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';
import * as React from 'react';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
	getCurrentMaintenanceStatus,
	subscribeMaintenanceStatus,
} from '@/services/maintenance/maintenanceState';
import { isDesktopShellRoute } from '@/utils/desktopShellRoute';
import { cn } from '@/utils/cn';
import { shouldDeferDesktopLoadingToMaintenance } from '../hooks/useDesktopMaintenanceAwareLoading';
import {
	DESKTOP_INTERACTIVE,
	DESKTOP_TYPOGRAPHY,
	STORAGE_KEYS,
} from '../constants';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

const dismissListeners = new Set<() => void>();

function readMaintenanceRecoveryDismissed(): boolean {
	if (typeof window === 'undefined') return false;
	try {
		return (
			window.sessionStorage.getItem(
				STORAGE_KEYS.MAINTENANCE_RECOVERY_DISMISSED
			) === '1'
		);
	} catch {
		return false;
	}
}

export function clearMaintenanceRecoveryDismissed(): void {
	try {
		window.sessionStorage.removeItem(
			STORAGE_KEYS.MAINTENANCE_RECOVERY_DISMISSED
		);
	} catch {
		// ignore
	}
	for (const listener of dismissListeners) listener();
}

export function isMaintenanceRecoveryDismissed(): boolean {
	return readMaintenanceRecoveryDismissed();
}

function subscribeMaintenanceRecoveryDismissed(
	onStoreChange: () => void
): () => void {
	dismissListeners.add(onStoreChange);
	return () => dismissListeners.delete(onStoreChange);
}

export { subscribeMaintenanceRecoveryDismissed };

export function DesktopTaskbarRecoveryChip(): React.JSX.Element | null {
	const { t } = useTranslation('desktopUi');
	const maintenanceStatus = useSyncExternalStore(
		subscribeMaintenanceStatus,
		getCurrentMaintenanceStatus,
		getCurrentMaintenanceStatus
	);
	const dismissed = useSyncExternalStore(
		subscribeMaintenanceRecoveryDismissed,
		readMaintenanceRecoveryDismissed,
		readMaintenanceRecoveryDismissed
	);

	if (
		!isDesktopShellRoute() ||
		!shouldDeferDesktopLoadingToMaintenance(maintenanceStatus) ||
		dismissed
	) {
		return null;
	}

	const dismiss = () => {
		try {
			window.sessionStorage.setItem(
				STORAGE_KEYS.MAINTENANCE_RECOVERY_DISMISSED,
				'1'
			);
		} catch {
			// ignore
		}
		for (const listener of dismissListeners) listener();
	};

	return (
		<span
			className="flex max-w-52 items-center gap-1"
			data-testid="desktop-taskbar-recovery-chip"
		>
			<DesktopChromeTooltip
				content={t('syncStatus.serverRecoveringTitle')}
				placement="top"
				offsetExtra={10}
			>
				<span
					className="flex max-w-44 items-center gap-1.5 truncate rounded-md border border-lime-200/20 bg-lime-300/10 px-2 py-1 text-lime-100/90"
					role="status"
					aria-live="polite"
				>
					<ArrowPathIcon
						className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
						aria-hidden
					/>
					<span className={`${DESKTOP_TYPOGRAPHY.captionInherit} truncate`}>
						{t('syncStatus.serverRecovering')}
					</span>
				</span>
			</DesktopChromeTooltip>
			<DesktopChromeTooltip
				content={t('taskbar.maintenanceRecoveryDismiss')}
				placement="top"
				offsetExtra={6}
			>
				<button
					type="button"
					onClick={dismiss}
					className={cn(
						'flex size-6 shrink-0 items-center justify-center rounded-md text-lime-100/80 fine-hover:bg-lime-300/15 fine-hover:text-lime-50',
						DESKTOP_INTERACTIVE.focusRing
					)}
					aria-label={t('taskbar.maintenanceRecoveryDismissAria')}
				>
					<XMarkIcon className="size-3.5" aria-hidden />
				</button>
			</DesktopChromeTooltip>
		</span>
	);
}
