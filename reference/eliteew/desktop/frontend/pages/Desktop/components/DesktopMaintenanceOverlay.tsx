/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Inline maintenance/recovery overlay for `#desktop` — freezes interaction while keeping workspace chrome visible underneath.
 *
 * Invariants:
 * - Used instead of global MaintenanceProvider fullscreen overlay on desktop routes.
 * - Single panel (no duplicate top banner).
 *
 * Related:
 * - `contexts/MaintenanceContext.tsx`
 * - `DesktopWorkspaceContent.tsx`
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { EliteRecoveryScreen } from '@/components/ui/EliteRecoveryScreen';
import { ELITE_QUOTE_ROTATION_MS } from '@/components/ui/eliteQuotes';
import { requestMaintenanceRecoveryReload } from '@/utils/staleBundleReload';
import { DESKTOP_Z_INDEX } from '../constants';

export type DesktopMaintenanceOverlayProps = {
	windowId: string;
	title: string;
	message: string;
	statusLabel: string;
	footnote: string;
};

export function DesktopMaintenanceOverlay({
	windowId,
	title,
	message,
	statusLabel,
	footnote,
}: DesktopMaintenanceOverlayProps): React.JSX.Element {
	const { t } = useTranslation('desktopUi');

	return (
		<div
			className="fixed inset-0 pointer-events-auto"
			style={{ zIndex: DESKTOP_Z_INDEX.MAINTENANCE }}
			data-testid="desktop-maintenance-overlay"
			aria-hidden={false}
		>
			<div
				className="elite-recovery-backdrop absolute inset-0 opacity-85"
				aria-hidden
			/>
			<div className="relative flex min-h-full items-center justify-center p-5">
				<EliteRecoveryScreen
					fullScreen={false}
					title={title}
					description={message}
					statusLabel={statusLabel}
					footnote={footnote}
					quoteRotationIntervalMs={ELITE_QUOTE_ROTATION_MS}
					panelVariant="recovery"
					actionLabel={t('workspace.checkConnection')}
					actionPendingLabel={t('workspace.checkConnectionPending')}
					onAction={() => void requestMaintenanceRecoveryReload(windowId)}
					role="alert"
					ariaLive="polite"
				/>
			</div>
		</div>
	);
}
