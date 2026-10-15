/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Live drop-zone overlay for folder window list body — upload vs library move vs nested shortcut move.
 *
 * Invariants:
 * - Rendered only while parent marks drop active; copy key comes from {@link resolveFolderDropOverlayCopyKey}.
 *
 * Related:
 * - folderWindowDropUtils.ts · DesktopFolderListBodyPanel.tsx
 */

import {
	ArrowDownTrayIcon,
	ArrowUpTrayIcon,
	FolderArrowDownIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { DESKTOP_TYPOGRAPHY } from '../../constants';
import {
	resolveFolderDropOverlayCopyKey,
	type FolderDropPayloadKind,
} from './folderWindowDropUtils';

export interface DesktopFolderDropOverlayProps {
	active: boolean;
	kind: FolderDropPayloadKind;
	reduceMotion?: boolean | null;
}

function DropOverlayIcon({ kind }: { kind: FolderDropPayloadKind }) {
	const className = 'h-8 w-8 shrink-0 text-[rgb(var(--desktop-accent-rgb))]';
	if (kind === 'upload') {
		return <ArrowUpTrayIcon className={className} aria-hidden="true" />;
	}
	if (kind === 'nested-move') {
		return <FolderArrowDownIcon className={className} aria-hidden="true" />;
	}
	return <ArrowDownTrayIcon className={className} aria-hidden="true" />;
}

export function DesktopFolderDropOverlay({
	active,
	kind,
	reduceMotion,
}: DesktopFolderDropOverlayProps) {
	const { t } = useTranslation('desktopUi');
	if (!active || !kind) return null;

	const copyKey = resolveFolderDropOverlayCopyKey(kind);
	if (!copyKey) return null;

	return (
		<div
			className={cn(
				'pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-(--desktop-radius-lg)',
				'border border-dashed border-[rgb(var(--desktop-accent-rgb)/0.55)]',
				'bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb)/0.16)_100%,transparent)]',
				'backdrop-blur-[2px]',
				reduceMotion !== true &&
					'motion-safe:animate-[pulse_1.4s_ease-in-out_infinite]'
			)}
			role="status"
			aria-live="polite"
			aria-atomic="true"
		>
			<div className="flex max-w-sm flex-col items-center gap-2 px-4 text-center">
				<DropOverlayIcon kind={kind} />
				<p
					className={`${DESKTOP_TYPOGRAPHY.subtitle} text-balance text-(--desktop-text-primary)`}
				>
					{t(copyKey)}
				</p>
			</div>
		</div>
	);
}
