/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Truncated folder/file labels and move-menu rows with DesktopChromeTooltip bridge.
 *
 * Invariants:
 * - Respects Visual Studio styled tooltips via DesktopChromeTooltip fallback to native title.
 *
 * Related:
 * - DesktopFolderWindow.tsx · DesktopFolderNestedItems.tsx · DesktopChromeTooltip.tsx
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { DesktopAppMenuItem } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

export function DesktopFolderTruncatedLabel({
	name,
	className,
	placement = 'top',
	offsetExtra = 4,
}: {
	name: string;
	className: string;
	placement?: 'top' | 'right' | 'bottom' | 'left';
	offsetExtra?: number;
}) {
	return (
		<DesktopChromeTooltip
			content={name}
			placement={placement}
			offsetExtra={offsetExtra}
		>
			<span className={className}>{name}</span>
		</DesktopChromeTooltip>
	);
}

type DesktopFolderMoveTargetMenuItemProps = {
	folderName: string;
	icon: ReactNode;
	onClick: () => void;
} & Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>;

export function DesktopFolderMoveTargetMenuItem({
	folderName,
	icon,
	onClick,
	type = 'button',
}: DesktopFolderMoveTargetMenuItemProps) {
	return (
		<DesktopChromeTooltip
			content={folderName}
			placement="right"
			offsetExtra={4}
		>
			<DesktopAppMenuItem type={type} icon={icon} onClick={onClick}>
				{folderName}
			</DesktopAppMenuItem>
		</DesktopChromeTooltip>
	);
}
