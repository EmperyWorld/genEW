/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Lightweight Suspense fallback for desktop overlay modals (wallpaper, palette, …).
 *
 * Invariants:
 * - Backdrop + panel skeleton with ``role="status"`` / ``aria-busy``.
 *
 * Related:
 * - DesktopModalsLayer.tsx
 * - constants DESKTOP_OVERLAY
 */

import { useTranslation } from 'react-i18next';
import { DESKTOP_OVERLAY, DESKTOP_Z_INDEX } from '../constants';
import { getDesktopShellPanelClassName } from '../utils/desktopVisualSystem';
import { DesktopAppSkeleton } from './DesktopAppChrome';

export function DesktopModalSuspenseFallback(): React.JSX.Element {
	const { t } = useTranslation('desktopUi');
	return (
		<div
			className={`fixed inset-0 z-(--desktop-modal-suspense-z) flex items-center justify-center ${DESKTOP_OVERLAY.backdrop}`}
			style={
				{
					'--desktop-modal-suspense-z': DESKTOP_Z_INDEX.MODAL,
				} as React.CSSProperties
			}
			role="status"
			aria-busy="true"
			aria-label={t('workspace.modalLoadingAria', {
				defaultValue: t('workspace.loading'),
			})}
			data-testid="desktop-modal-suspense-fallback"
		>
			<div
				className={`${getDesktopShellPanelClassName('standard')} flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-3 p-5`}
			>
				<DesktopAppSkeleton className="h-8 w-2/3" />
				<DesktopAppSkeleton className="h-4 w-full" />
				<DesktopAppSkeleton className="h-4 w-5/6" />
				<DesktopAppSkeleton className="mt-2 h-32 w-full" />
			</div>
		</div>
	);
}
