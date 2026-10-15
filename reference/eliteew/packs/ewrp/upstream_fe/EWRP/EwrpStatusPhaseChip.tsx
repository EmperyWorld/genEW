/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared EWRP status phase chip — history rows, status column, tab badge, mini status bar.
 *
 * Invariants:
 * - Visual semantics match `ewrpHistoryStatusIndicator`; tab badge is icon-only with caller-provided sr-only label.
 *
 * Related:
 * - `ewrpStatusPhaseIndicator.tsx`, `EWRPGeneratorMain.tsx`, `EwrpGeneratorChunks.tsx`
 */

import { cn } from '@/utils/cn';
import {
	ewrpHistoryStatusIndicator,
	ewrpStatusLabel,
} from './ewrpStatusPhaseIndicator';

export type EwrpStatusPhaseChipSize = 'sm' | 'md' | 'tab';

export type EwrpStatusPhaseChipProps = {
	status: string;
	updatedAt?: string | null;
	size?: EwrpStatusPhaseChipSize;
	className?: string;
	title?: string;
	iconOnly?: boolean;
};

const SIZE_CLASS: Record<EwrpStatusPhaseChipSize, string> = {
	sm: 'inline-flex min-h-6 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums',
	md: 'inline-flex min-h-7 items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-medium tabular-nums',
	tab: 'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[9px] font-semibold',
};

/** Renders the canonical EWRP job phase chip for list/status surfaces. */
export function EwrpStatusPhaseChip(props: EwrpStatusPhaseChipProps) {
	const {
		status,
		updatedAt,
		size = 'md',
		className,
		title,
		iconOnly = false,
	} = props;
	const indicator = ewrpHistoryStatusIndicator(status, updatedAt);
	const chipTitle = title ?? indicator.label;

	if (iconOnly) {
		return (
			<span
				className={cn(SIZE_CLASS.tab, indicator.className, className)}
				title={chipTitle}
				aria-hidden
			>
				{indicator.icon}
			</span>
		);
	}

	return (
		<span
			className={cn(SIZE_CLASS[size], indicator.className, className)}
			title={title ?? (size === 'sm' ? ewrpStatusLabel(status) : undefined)}
		>
			{indicator.icon}
			{indicator.label}
		</span>
	);
}
