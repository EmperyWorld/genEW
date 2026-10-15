/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Text with line-clamp and measured «Ещё» toggle; full text tooltip when collapsed overflow.
 *
 * Invariants:
 * - Toggle appears only when DOM measurement shows hidden tail.
 *
 * Related:
 * - AppStoreCatalogCard.tsx · DesktopChromeTooltip.tsx
 */
import { cn } from '@/utils/cn';
import {
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
	type ReactElement,
} from 'react';
import { DESKTOP_TYPOGRAPHY } from '../constants';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

type LineClampLines = 3 | 5;

const DEFAULT_TOGGLE_CLASS = cn(
	'mt-1.5',
	DESKTOP_TYPOGRAPHY.shellDescriptionToggle
);

export function DescriptionClampOverflow({
	text,
	lineClamp,
	className,
	paragraphClassName,
	toggleClassName = DEFAULT_TOGGLE_CLASS,
	moreLabel,
	lessLabel,
	stopPropagationOnToggle = false,
}: {
	text: string;
	lineClamp: LineClampLines;
	className?: string;
	paragraphClassName?: string;
	toggleClassName?: string;
	moreLabel: string;
	lessLabel: string;
	/** Для карточек магазина: не всплывать к клику по карточке */
	stopPropagationOnToggle?: boolean;
}): ReactElement {
	const ref = useRef<HTMLParagraphElement>(null);
	const [expanded, setExpanded] = useState(false);
	const [overflowsCollapsed, setOverflowsCollapsed] = useState(false);

	const measure = useCallback(() => {
		const el = ref.current;
		if (!el) return;
		if (expanded) return;
		const tol = 2;
		setOverflowsCollapsed(el.scrollHeight > el.clientHeight + tol);
	}, [expanded]);

	useLayoutEffect(() => {
		setExpanded(false);
		setOverflowsCollapsed(false);
	}, []);

	useLayoutEffect(() => {
		measure();
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(() => measure());
		ro.observe(el);
		return () => ro.disconnect();
	}, [measure]);

	useLayoutEffect(() => {
		if (!expanded) measure();
	}, [expanded, measure]);

	const lineClampClass =
		lineClamp === 3 ? 'line-clamp-3' : lineClamp === 5 ? 'line-clamp-5' : '';

	const showToggle = overflowsCollapsed || expanded;

	const paragraph = (
		<p
			ref={ref}
			className={cn(paragraphClassName, !expanded && lineClampClass)}
		>
			{text}
		</p>
	);

	return (
		<div className={className}>
			{!expanded && overflowsCollapsed ? (
				<DesktopChromeTooltip content={text} placement="top" offsetExtra={4}>
					{paragraph}
				</DesktopChromeTooltip>
			) : (
				paragraph
			)}
			{showToggle ? (
				<button
					type="button"
					className={toggleClassName}
					onClick={(e) => {
						if (stopPropagationOnToggle) e.stopPropagation();
						setExpanded((x) => !x);
					}}
				>
					{expanded ? lessLabel : moreLabel}
				</button>
			) : null}
		</div>
	);
}
