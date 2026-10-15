/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Portal shell wrapper for Desktop folder window floating menus/modals (theme + CSS variables on document.body portals).
 *
 * Invariants:
 * - Preserves desktop dark/light theme class on portaled content.
 *
 * Related:
 * - DesktopFolderContextMenus.tsx; DesktopFolderWindow.tsx
 */

import type * as React from 'react';
import { getDesktopPortalShellProps } from '../../utils/desktopUi';

export function wrapFolderWindowPortalShell(
	children: React.ReactNode
): React.ReactElement {
	const { style: portalShellStyle, theme: portalTheme } =
		getDesktopPortalShellProps();
	return (
		<div
			style={portalShellStyle}
			className={portalTheme === 'dark' ? 'dark' : ''}
		>
			{children}
		</div>
	);
}
