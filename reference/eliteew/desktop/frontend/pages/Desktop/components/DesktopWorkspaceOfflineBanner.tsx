/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Canvas-level offline banner — honest global state when desktop persistence is local-only.
 *
 * Invariants:
 * - Shown only when `navigator.onLine` is false; complements `DesktopSyncStatus` chip.
 * - Copy comes from `desktopUi.workspace.offlineBanner*`.
 *
 * Related:
 * - `DesktopWorkspaceCanvas.tsx`, `DesktopSyncStatus.tsx`
 */

import * as React from 'react';
import { CloudIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { DESKTOP_Z_INDEX } from '../constants';
import {
	DesktopAppButton,
	DesktopProductStatusBanner,
} from './DesktopAppChrome';

export type DesktopWorkspaceOfflineBannerProps = {
	onRetry?: () => void;
};

export function DesktopWorkspaceOfflineBanner({
	onRetry,
}: DesktopWorkspaceOfflineBannerProps): React.JSX.Element {
	const { t } = useTranslation('desktopUi');

	return (
		<div
			className="pointer-events-none absolute inset-x-0 top-0 z-(--desktop-offline-banner-z) px-4 pt-3"
			style={
				{
					'--desktop-offline-banner-z': DESKTOP_Z_INDEX.TOAST,
				} as React.CSSProperties
			}
		>
			<DesktopProductStatusBanner
				className="pointer-events-auto rounded-(--desktop-radius-lg) shadow-lg"
				tone="warning"
				title={
					<span className="inline-flex items-center gap-2">
						<CloudIcon className="size-4 shrink-0" aria-hidden />
						{t('workspace.offlineBannerTitle')}
					</span>
				}
				description={t('workspace.offlineBannerBody')}
				actions={
					onRetry ? (
						<DesktopAppButton
							type="button"
							variant="neutral"
							size="sm"
							onClick={onRetry}
						>
							{t('workspace.offlineBannerRetry')}
						</DesktopAppButton>
					) : undefined
				}
				data-testid="desktop-offline-banner"
			/>
		</div>
	);
}
