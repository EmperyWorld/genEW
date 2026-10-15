/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Tooltip-wrapped launcher result row for Quick Search keyboard/hover selection.
 *
 * Invariants:
 * - Tooltip placement is right-offset so it does not cover the taskbar strip.
 *
 * Related:
 * - `QuickSearchResultsList.tsx`
 */

import * as React from 'react';
import { m } from 'framer-motion';
import { DesktopChromeTooltip } from '../DesktopChromeTooltip';

type QuickSearchLauncherRowProps = React.ComponentProps<typeof m.button> & {
	tooltip: string;
};

export function QuickSearchLauncherRow({
	tooltip,
	children,
	...props
}: QuickSearchLauncherRowProps): React.JSX.Element {
	return (
		<DesktopChromeTooltip content={tooltip} placement="right" offsetExtra={4}>
			<m.button {...props}>{children}</m.button>
		</DesktopChromeTooltip>
	);
}
