/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * RDP-safe Suspense fallback for lazy Start Menu mode bodies (no Framer).
 *
 * Invariants:
 * - ``role="status"`` + ``aria-busy`` while the chunk loads.
 *
 * Related:
 * - ../StartMenu.tsx
 * - ../DesktopAppChrome.tsx (`DesktopAppSkeleton`)
 */

import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { DESKTOP_Z_INDEX } from '../../constants';
import { getDesktopShellPanelClassName } from '../../utils/desktopVisualSystem';
import { DesktopAppSkeleton } from '../DesktopAppChrome';

export function StartMenuSuspenseFallback(): JSX.Element {
	const { t } = useTranslation('desktopUi');
	return (
		<div
			className={`${getDesktopShellPanelClassName('standard')} pointer-events-none fixed bottom-[calc(var(--desktop-taskbar-height)+0.75rem)] left-3 z-(--desktop-start-menu-z) flex h-[min(36rem,calc(100dvh-var(--desktop-taskbar-height)-1.5rem))] w-[min(42rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-4`}
			style={
				{
					'--desktop-start-menu-z': DESKTOP_Z_INDEX.PANEL,
				} as React.CSSProperties
			}
			role="status"
			aria-busy="true"
			aria-label={t('startMenu.loadingAria', {
				defaultValue: t('workspace.openingDesktop'),
			})}
			data-testid="desktop-start-menu-suspense-fallback"
		>
			<DesktopAppSkeleton className="mb-3 h-10 w-full shrink-0" />
			<div className="mb-3 flex gap-2">
				<DesktopAppSkeleton className="h-8 w-28" />
				<DesktopAppSkeleton className="h-8 w-24" />
				<DesktopAppSkeleton className="h-8 w-16" />
			</div>
			<div className="grid flex-1 grid-cols-3 gap-2 content-start sm:grid-cols-4">
				{(
					[
						's1',
						's2',
						's3',
						's4',
						's5',
						's6',
						's7',
						's8',
						's9',
						's10',
						's11',
						's12',
					] as const
				).map((slot) => (
					<DesktopAppSkeleton key={slot} className="h-24 w-full" />
				))}
			</div>
		</div>
	);
}
