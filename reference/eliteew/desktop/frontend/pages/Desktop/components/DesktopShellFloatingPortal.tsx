/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Body-level desktop portal for fixed shell overlays that must follow desktop
 * transform compensation and performance compositor preferences.
 *
 * Invariants:
 * - Portal surfaces inherit desktop theme and reduce-blur state from the active
 *   workspace shell; they do not create an independent visual policy.
 *
 * Related:
 * - hooks/useDesktopWorkspaceShellCss.ts
 * - documentation/product/desktop/DESKTOP-WINDOW-RUNTIME-PERFORMANCE.md
 * ---
 */

import * as React from 'react';
import { createPortal } from 'react-dom';

import { getDesktopPortalShellProps } from '../utils/desktopUi';
import { isDesktopLowGpuModeEnabled } from '../runtime/desktopLowGpuMode';

/**
 * Renders children into document.body with the same shell transform compensation
 * and theme wrapper as other desktop floating UI (context menus, modals).
 * Use for `position: fixed` overlays that must align with viewport coordinates
 * while the desktop shell uses `transform: scale(...)`.
 */
export function DesktopShellFloatingPortal({
	children,
}: {
	children: React.ReactNode;
}) {
	if (typeof document === 'undefined') {
		return children;
	}
	const { style, theme } = getDesktopPortalShellProps();
	const reduceBackdropBlur =
		isDesktopLowGpuModeEnabled() ||
		document
			.getElementById('desktop-main')
			?.getAttribute('data-desktop-reduce-backdrop-blur') === 'true';
	return createPortal(
		<div
			style={style}
			className={
				theme === 'dark'
					? 'dark desktop-shell-floating-portal'
					: 'desktop-shell-floating-portal'
			}
			data-desktop-reduce-backdrop-blur={
				reduceBackdropBlur ? 'true' : undefined
			}
			data-testid="desktop-shell-floating-portal"
		>
			{children}
		</div>,
		document.body
	);
}
