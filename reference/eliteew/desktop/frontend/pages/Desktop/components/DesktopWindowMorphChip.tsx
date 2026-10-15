/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared layoutId target for window icon morph between title bar and taskbar.
 *
 * Invariants:
 * - Disabled when prefers-reduced-motion; falls back to static wrapper.
 *
 * Related:
 * - desktopShellMotion.ts, WindowTitleBar.tsx, TaskbarPinnedAndWindowsStrip.tsx
 */

import { m } from 'framer-motion';
import type { ReactNode } from 'react';
import { useDesktopShellMotionPrefs } from '../context/DesktopShellMotionPrefsContext';
import {
	desktopShellLayoutTransition,
	desktopWindowMorphLayoutId,
} from '../utils/desktopShellMotion';

export type DesktopWindowMorphChipProps = {
	windowId: string;
	active: boolean;
	className?: string;
	children: ReactNode;
};

export function DesktopWindowMorphChip({
	windowId,
	active,
	className,
	children,
}: DesktopWindowMorphChipProps) {
	const { reduceMotion, morphEnabled, speed } = useDesktopShellMotionPrefs();

	if (!active || reduceMotion || !morphEnabled) {
		return <span className={className}>{children}</span>;
	}

	return (
		<m.span
			layoutId={desktopWindowMorphLayoutId(windowId)}
			className={className}
			transition={desktopShellLayoutTransition(reduceMotion, speed)}
		>
			{children}
		</m.span>
	);
}
