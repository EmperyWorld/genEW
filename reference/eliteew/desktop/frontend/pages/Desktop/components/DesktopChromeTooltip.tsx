/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Taskbar/shell tooltip bridge: TooltipV2 when styled tooltips are on, native `title` otherwise.
 *
 * Invariants:
 * - Respects Visual Studio `desktop_styled_tooltips` via `#desktop-main` data attribute.
 *
 * Related:
 * - `useDesktopStyledTooltipsEnabled.ts`, `TooltipV2.tsx`
 */

import { TooltipV2, type TooltipPlacement } from '@/components/ui/TooltipV2';
import {
	cloneElement,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from 'react';
import { useDesktopStyledTooltipsEnabled } from '../hooks/useDesktopStyledTooltipsEnabled';

export type DesktopChromeTooltipProps = {
	content: ReactNode;
	children: ReactElement;
	placement?: TooltipPlacement;
	offsetExtra?: number;
	disabled?: boolean;
	/** Растянуть trigger на ширину grid/flex-ячейки (см. TooltipV2.fullWidth). */
	fullWidth?: boolean;
};

export function DesktopChromeTooltip({
	content,
	children,
	placement = 'top',
	offsetExtra,
	disabled = false,
	fullWidth = false,
}: DesktopChromeTooltipProps): ReactElement {
	const styledEnabled = useDesktopStyledTooltipsEnabled();

	if (
		!styledEnabled ||
		disabled ||
		content == null ||
		content === '' ||
		!isValidElement(children)
	) {
		const nativeTitle =
			typeof content === 'string' || typeof content === 'number'
				? String(content)
				: undefined;
		return cloneElement(children, {
			title: nativeTitle ?? (children.props as { title?: string }).title,
		});
	}

	return (
		<TooltipV2
			content={content}
			placement={placement}
			offsetExtra={offsetExtra}
			fullWidth={fullWidth}
		>
			{children}
		</TooltipV2>
	);
}
