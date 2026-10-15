/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * First-run dismissible overlay teaching window snap (drag to edge + Win+Arrow).
 *
 * Invariants:
 * - Shown at most once until operator clears localStorage dismiss flag.
 * - Plain mount; opaque panel (no blur / Framer) for RDP-safe paint.
 *
 * Related:
 * - utils/desktopSnapTeachPrefs.ts, SnapPreview.tsx
 */

import { cn } from '@/utils/cn';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DESKTOP_Z_INDEX } from '../constants';
import {
	dismissDesktopSnapTeach,
	isDesktopSnapTeachDismissed,
} from '../utils/desktopSnapTeachPrefs';
import { DesktopAppButton } from './DesktopAppChrome';
import { DesktopShellFloatingPortal } from './DesktopShellFloatingPortal';

export interface DesktopSnapTeachOverlayProps {
	/** When true (window drag snap picker open), eligible to show teach overlay once. */
	snapPickerOpen: boolean;
}

export function DesktopSnapTeachOverlay({
	snapPickerOpen,
}: DesktopSnapTeachOverlayProps): React.JSX.Element | null {
	const { t } = useTranslation('desktopUi');
	const [visible, setVisible] = useState(false);
	const [dismissed, setDismissed] = useState(() =>
		isDesktopSnapTeachDismissed()
	);

	const winArrowLabel = useMemo(() => {
		if (typeof navigator === 'undefined') return 'Win+← / Win+→';
		return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
			? '⌘+← / ⌘+→'
			: 'Win+← / Win+→';
	}, []);

	useEffect(() => {
		if (dismissed || !snapPickerOpen) return;
		setVisible(true);
	}, [dismissed, snapPickerOpen]);

	const handleDismiss = useCallback((permanent: boolean) => {
		setVisible(false);
		if (permanent) {
			dismissDesktopSnapTeach();
			setDismissed(true);
		}
	}, []);

	if (dismissed || !visible) return null;

	return (
		<DesktopShellFloatingPortal>
			<div
				className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--desktop-taskbar-height,48px)+12px)] flex justify-center px-4"
				style={{ zIndex: DESKTOP_Z_INDEX.SNAP_PREVIEW + 2 }}
				role="dialog"
				aria-labelledby="desktop-snap-teach-title"
				aria-describedby="desktop-snap-teach-body"
			>
				<div
					className={cn(
						'pointer-events-auto max-w-md rounded-(--desktop-radius-lg) border border-[rgb(var(--desktop-accent-rgb)/0.35)]',
						'bg-[rgb(var(--desktop-bg-primary-rgb)/0.96)] px-4 py-3 shadow-lg'
					)}
				>
					<p
						id="desktop-snap-teach-title"
						className="text-sm font-semibold text-(--desktop-text-primary)"
					>
						{t('windowChrome.snapTeach.title')}
					</p>
					<p
						id="desktop-snap-teach-body"
						className="mt-1 text-xs leading-relaxed text-(--desktop-text-secondary)"
					>
						{t('windowChrome.snapTeach.body', { shortcut: winArrowLabel })}
					</p>
					<div className="mt-3 flex flex-wrap justify-end gap-2">
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => handleDismiss(false)}
						>
							{t('windowChrome.snapTeach.gotIt')}
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant="primary"
							size="sm"
							onClick={() => handleDismiss(true)}
						>
							{t('windowChrome.snapTeach.dontShowAgain')}
						</DesktopAppButton>
					</div>
				</div>
			</div>
		</DesktopShellFloatingPortal>
	);
}
