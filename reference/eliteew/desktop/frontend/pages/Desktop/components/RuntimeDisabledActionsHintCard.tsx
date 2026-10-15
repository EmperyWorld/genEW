/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Reusable Desktop card for runtime action disabled reasons in operator-facing panels.
 * Shows an explicit text list under control buttons for touch/keyboard users.
 *
 * Invariants:
 * - Renders nothing when `hints` is empty.
 * - Uses Desktop soft surface styling for consistent control-area visuals.
 * - Can expose `aria-live` announcements when reasons change.
 * - Raw per-action list is optional and hidden by default.
 * - Detail toggle can persist in sessionStorage when storage key is provided.
 * - Toggle button exposes `aria-expanded` + `aria-controls` for details region.
 * - Toggle callback payload contains only aggregate counts (no content strings).
 * - Disabled reasons render as semantic lists (`ul/li`) for screen-reader navigation.
 * - Details region keeps a stable DOM id and toggles via `hidden` for reliable `aria-controls`.
 * - Hint rows visually separate action label from reason text for quicker scanning.
 * - Grouped action labels are rendered as compact chips for faster scanability.
 * - Summary/detail hints render as bordered rows for denser visual parsing.
 * - Long summary/detail lists switch to internal scroll with helper hints.
 * - Scrollable lists show edge fade masks as extra visual overflow cues.
 * - Fade-mask intensity can be tuned (`soft` / `strong`) for dense operator modes.
 * - Row density is configurable (`comfortable` / `compact`) for panel-tight layouts.
 * - Scroll threshold is configurable for different panel density presets.
 * - Scrollable details list shows a compact sticky subheader for context retention.
 * - Toggle announces expanded/collapsed state via sr-only live region.
 * - Sticky details subheader gains subtle depth while list is scrolled.
 * - Header count semantics are available to screen readers via formatter callbacks.
 *
 * Related:
 * - `pages/Kirs/KirsPage.tsx`
 * - `features/site-studio/desktop/components/SiteStudioRuntimePanel.tsx`
 * - `DesktopChromeTooltip.tsx`
 */
import * as React from 'react';
import { DesktopAppButton, DesktopAppSurface } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { cn } from '@/utils/cn';

interface RuntimeDisabledActionsHintCardProps {
	title: string;
	hints: string[];
	announceChanges?: boolean;
	showRawToggle?: boolean;
	groupedCountLabel?: string;
	hiddenCountLabel?: string;
	detailsCountLabel?: string;
	summaryScrollHintLabel?: string;
	detailsScrollHintLabel?: string;
	overflowTopHintLabel?: string;
	overflowBottomHintLabel?: string;
	overflowFadeStrength?: 'soft' | 'strong';
	rowDensity?: 'compact' | 'comfortable';
	scrollThreshold?: number;
	groupedCountSrFormatter?: (count: number) => string;
	hiddenCountSrFormatter?: (count: number) => string;
	toggleExpandedSrLabel?: string;
	toggleCollapsedSrLabel?: string;
	rawListTitle?: string;
	toggleShowRawLabel?: string;
	toggleHideRawLabel?: string;
	toggleStateStorageKey?: string;
	onToggleRawHints?: (payload: {
		isExpanded: boolean;
		rawCount: number;
		collapsedCount: number;
		hiddenCount: number;
	}) => void;
	className?: string;
}

function getRuntimeHintsSessionStorage(): Storage | null {
	if (typeof window === 'undefined') {
		return null;
	}
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

export function loadRuntimeHintsExpandedPreference(
	storageKey: string | null | undefined
): boolean {
	if (!storageKey) {
		return false;
	}
	const storage = getRuntimeHintsSessionStorage();
	if (!storage) {
		return false;
	}
	return storage.getItem(storageKey) === '1';
}

export function saveRuntimeHintsExpandedPreference(
	storageKey: string | null | undefined,
	isExpanded: boolean
): void {
	if (!storageKey) {
		return;
	}
	const storage = getRuntimeHintsSessionStorage();
	if (!storage) {
		return;
	}
	if (isExpanded) {
		storage.setItem(storageKey, '1');
		return;
	}
	storage.removeItem(storageKey);
}

function parseHintEntry(rawHint: string): {
	action: string | null;
	reason: string;
} {
	const hint = rawHint.trim();
	if (!hint) {
		return { action: null, reason: '' };
	}
	const separatorIndex = hint.indexOf(':');
	if (separatorIndex <= 0) {
		return { action: null, reason: hint };
	}
	const action = hint.slice(0, separatorIndex).trim();
	const reason = hint.slice(separatorIndex + 1).trim();
	if (!action || !reason) {
		return { action: null, reason: hint };
	}
	return { action, reason };
}

function formatToggleAnnouncement(label: string, count: number): string {
	const rowWord = count === 1 ? 'row' : 'rows';
	return label
		.replaceAll('{{count}}', String(count))
		.replaceAll('{{rowWord}}', rowWord);
}

function defaultGroupedCountSrFormatter(count: number): string {
	return count === 1 ? '1 grouped reason' : `${count} grouped reasons`;
}

function defaultHiddenCountSrFormatter(count: number): string {
	return count === 1 ? '1 hidden detail' : `${count} hidden details`;
}

function renderHintContent(hint: string): React.ReactNode {
	const { action, reason } = parseHintEntry(hint);
	if (!action) {
		return reason;
	}
	const actionParts = action
		.split('/')
		.map((part) => part.trim())
		.filter(Boolean);
	if (!actionParts.length) {
		return reason;
	}
	const seen = new Map<string, number>();
	const actionPartEntries = actionParts.map((part) => {
		const occurrence = (seen.get(part) ?? 0) + 1;
		seen.set(part, occurrence);
		return {
			key: `${part}::${occurrence}`,
			value: part,
		};
	});
	return (
		<>
			<span className="inline-flex flex-wrap items-center gap-1 align-middle">
				{actionPartEntries.map((entry, index) => (
					<React.Fragment key={entry.key}>
						{index > 0 ? (
							<span className="text-(--desktop-text-muted)">/</span>
						) : null}
						<span className="rounded-md border border-(--desktop-border-subtle) bg-(--desktop-surface-soft-hover) px-1.5 py-0.5 text-[11px] font-medium leading-none text-(--desktop-text-primary)">
							{entry.value}
						</span>
					</React.Fragment>
				))}
				<span className="text-(--desktop-text-muted)">:</span>
			</span>
			<span className="ml-1">{reason}</span>
		</>
	);
}

export function collapseRuntimeDisabledHints(hints: string[]): string[] {
	const grouped = new Map<
		string,
		{ reason: string; actions: string[]; hasActionPrefix: boolean }
	>();

	for (const rawHint of hints) {
		const { action, reason } = parseHintEntry(rawHint);
		if (!reason) {
			continue;
		}
		const existing =
			grouped.get(reason) ??
			(() => {
				const created = {
					reason,
					actions: [] as string[],
					hasActionPrefix: false,
				};
				grouped.set(reason, created);
				return created;
			})();

		if (action) {
			existing.hasActionPrefix = true;
			if (!existing.actions.includes(action)) {
				existing.actions.push(action);
			}
		}
	}

	return Array.from(grouped.values()).map((entry) => {
		if (!entry.hasActionPrefix || !entry.actions.length) {
			return entry.reason;
		}
		return `${entry.actions.join(' / ')}: ${entry.reason}`;
	});
}

export const RuntimeDisabledActionsHintCard: React.FC<
	RuntimeDisabledActionsHintCardProps
> = ({
	title,
	hints,
	announceChanges = false,
	showRawToggle = false,
	groupedCountLabel = 'Reasons',
	hiddenCountLabel = 'Hidden',
	detailsCountLabel = 'Rows',
	summaryScrollHintLabel = 'Scroll to view all reasons',
	detailsScrollHintLabel = 'Scroll to view all details',
	overflowTopHintLabel = 'More above',
	overflowBottomHintLabel = 'More below',
	overflowFadeStrength = 'soft',
	rowDensity = 'comfortable',
	scrollThreshold = 4,
	groupedCountSrFormatter = defaultGroupedCountSrFormatter,
	hiddenCountSrFormatter = defaultHiddenCountSrFormatter,
	toggleExpandedSrLabel = 'Detailed list expanded ({{count}} {{rowWord}})',
	toggleCollapsedSrLabel = 'Detailed list collapsed ({{count}} {{rowWord}})',
	rawListTitle = 'Per-action details',
	toggleShowRawLabel = 'Show detailed list',
	toggleHideRawLabel = 'Hide detailed list',
	toggleStateStorageKey,
	onToggleRawHints,
	className,
}) => {
	const collapsedHints = React.useMemo(
		() => collapseRuntimeDisabledHints(hints),
		[hints]
	);
	const rawDetailsRegionId = React.useId();
	const summaryListLabelId = React.useId();
	const rawListLabelId = React.useId();
	const rawHintEntries = React.useMemo(() => {
		const seen = new Map<string, number>();
		return hints.map((hint) => {
			const occurrence = (seen.get(hint) ?? 0) + 1;
			seen.set(hint, occurrence);
			return {
				key: `${hint}::${occurrence}`,
				value: hint,
			};
		});
	}, [hints]);
	const canShowRawHintsToggle =
		showRawToggle && hints.length > 1 && hints.length !== collapsedHints.length;
	const hiddenRawHintsCount = Math.max(
		rawHintEntries.length - collapsedHints.length,
		0
	);
	const resolvedScrollThreshold = Math.max(1, Math.floor(scrollThreshold));
	const summaryNeedsScroll = collapsedHints.length > resolvedScrollThreshold;
	const detailsNeedsScroll = rawHintEntries.length > resolvedScrollThreshold;
	const groupedCountSrText = groupedCountSrFormatter(collapsedHints.length);
	const hiddenCountSrText =
		canShowRawHintsToggle && hiddenRawHintsCount > 0
			? hiddenCountSrFormatter(hiddenRawHintsCount)
			: null;
	const listSpacingClass =
		rowDensity === 'compact' ? 'space-y-1' : 'space-y-1.5';
	const rowPaddingClass =
		rowDensity === 'compact' ? 'px-2 py-1' : 'px-2 py-1.5';
	const summaryListRef = React.useRef<HTMLUListElement | null>(null);
	const detailsListRef = React.useRef<HTMLUListElement | null>(null);
	const [summaryOverflow, setSummaryOverflow] = React.useState({
		hasTop: false,
		hasBottom: false,
	});
	const [detailsOverflow, setDetailsOverflow] = React.useState({
		hasTop: false,
		hasBottom: false,
	});
	const [toggleStateAnnouncement, setToggleStateAnnouncement] =
		React.useState('');
	const [showRawHints, setShowRawHints] = React.useState(() =>
		loadRuntimeHintsExpandedPreference(toggleStateStorageKey)
	);

	const resolveScrollOverflow = React.useCallback(
		(
			element: HTMLElement | null,
			assumeBottomWhenUnknown: boolean
		): { hasTop: boolean; hasBottom: boolean } => {
			if (!element) {
				return {
					hasTop: false,
					hasBottom: assumeBottomWhenUnknown,
				};
			}
			const scrollTop = Math.max(0, element.scrollTop ?? 0);
			const clientHeight = element.clientHeight ?? 0;
			const scrollHeight = element.scrollHeight ?? 0;
			const hasTop = scrollTop > 1;
			if (clientHeight <= 0 || scrollHeight <= 0) {
				return {
					hasTop,
					hasBottom: assumeBottomWhenUnknown && !hasTop,
				};
			}
			return {
				hasTop,
				hasBottom: scrollTop + clientHeight < scrollHeight - 1,
			};
		},
		[]
	);

	React.useEffect(() => {
		if (!canShowRawHintsToggle && showRawHints) {
			setShowRawHints(false);
		}
	}, [canShowRawHintsToggle, showRawHints]);

	React.useEffect(() => {
		saveRuntimeHintsExpandedPreference(
			toggleStateStorageKey,
			canShowRawHintsToggle ? showRawHints : false
		);
	}, [canShowRawHintsToggle, showRawHints, toggleStateStorageKey]);

	React.useEffect(() => {
		if (!summaryNeedsScroll) {
			setSummaryOverflow({ hasTop: false, hasBottom: false });
			return;
		}
		setSummaryOverflow(resolveScrollOverflow(summaryListRef.current, true));
	}, [resolveScrollOverflow, summaryNeedsScroll]);

	React.useEffect(() => {
		if (!showRawHints || !detailsNeedsScroll) {
			setDetailsOverflow({ hasTop: false, hasBottom: false });
			return;
		}
		setDetailsOverflow(resolveScrollOverflow(detailsListRef.current, true));
	}, [detailsNeedsScroll, resolveScrollOverflow, showRawHints]);

	const handleToggleRawHints = React.useCallback(() => {
		setShowRawHints((previous) => {
			const isExpanded = !previous;
			setToggleStateAnnouncement(
				formatToggleAnnouncement(
					isExpanded ? toggleExpandedSrLabel : toggleCollapsedSrLabel,
					rawHintEntries.length
				)
			);
			onToggleRawHints?.({
				isExpanded,
				rawCount: rawHintEntries.length,
				collapsedCount: collapsedHints.length,
				hiddenCount: hiddenRawHintsCount,
			});
			return isExpanded;
		});
	}, [
		collapsedHints.length,
		hiddenRawHintsCount,
		onToggleRawHints,
		rawHintEntries.length,
		toggleCollapsedSrLabel,
		toggleExpandedSrLabel,
	]);

	if (!collapsedHints.length) {
		return null;
	}

	return (
		<DesktopAppSurface
			variant="soft"
			padding="sm"
			className={cn('space-y-2', className)}
		>
			<div className="flex items-start justify-between gap-3">
				<div
					id={summaryListLabelId}
					className="text-xs uppercase tracking-[0.18em] text-(--desktop-text-dim)"
				>
					{title}
				</div>
				<div className="flex items-center gap-1" aria-hidden="true">
					<span
						className="rounded-full border border-(--desktop-border-subtle) bg-(--desktop-surface-soft-hover) px-2 py-0.5 text-[10px] font-semibold text-(--desktop-text-muted)"
						data-testid="runtime-disabled-grouped-count"
					>
						{groupedCountLabel} {collapsedHints.length}
					</span>
					{canShowRawHintsToggle && hiddenRawHintsCount > 0 ? (
						<span
							className="rounded-full border border-(--desktop-border-subtle) bg-(--desktop-surface-soft-hover) px-2 py-0.5 text-[10px] font-semibold text-(--desktop-text-muted)"
							data-testid="runtime-disabled-hidden-count"
						>
							{hiddenCountLabel} +{hiddenRawHintsCount}
						</span>
					) : null}
				</div>
			</div>
			<span className="sr-only" data-testid="runtime-disabled-counts-sr">
				{hiddenCountSrText
					? `${groupedCountSrText}. ${hiddenCountSrText}.`
					: groupedCountSrText}
			</span>
			<div className="relative">
				<ul
					ref={summaryListRef}
					className={cn(
						'list-none text-xs leading-relaxed text-(--desktop-text-secondary)',
						listSpacingClass,
						summaryNeedsScroll && 'max-h-44 overflow-y-auto pr-1'
					)}
					aria-live={announceChanges ? 'polite' : undefined}
					aria-atomic={announceChanges ? 'true' : undefined}
					aria-labelledby={summaryListLabelId}
					data-testid="runtime-disabled-summary-list"
					tabIndex={summaryNeedsScroll ? 0 : undefined}
					onScroll={
						summaryNeedsScroll
							? (event) =>
									setSummaryOverflow(
										resolveScrollOverflow(event.currentTarget, true)
									)
							: undefined
					}
				>
					{collapsedHints.map((hint) => (
						<li
							key={hint}
							className={cn(
								'wrap-break-word rounded-md border border-(--desktop-border-subtle) bg-(--desktop-surface)',
								rowPaddingClass
							)}
						>
							{renderHintContent(hint)}
						</li>
					))}
				</ul>
				{summaryNeedsScroll ? (
					<>
						<div
							className={cn(
								'pointer-events-none absolute inset-x-0 top-0 z-10 rounded-t-md transition-opacity',
								overflowFadeStrength === 'strong' ? 'h-6' : 'h-4',
								!summaryOverflow.hasTop && 'opacity-0'
							)}
							style={{
								backgroundImage:
									'linear-gradient(to bottom, var(--desktop-surface-soft), transparent)',
							}}
							aria-hidden="true"
							data-testid="runtime-disabled-summary-fade-top"
						/>
						<div
							className={cn(
								'pointer-events-none absolute inset-x-0 bottom-0 z-10 rounded-b-md transition-opacity',
								overflowFadeStrength === 'strong' ? 'h-6' : 'h-4',
								!summaryOverflow.hasBottom && 'opacity-0'
							)}
							style={{
								backgroundImage:
									'linear-gradient(to top, var(--desktop-surface-soft), transparent)',
							}}
							aria-hidden="true"
							data-testid="runtime-disabled-summary-fade-bottom"
						/>
					</>
				) : null}
			</div>
			{summaryNeedsScroll ? (
				<div className="flex items-center justify-between gap-2 text-[11px] text-(--desktop-text-muted)">
					<span
						className={cn(
							'transition-opacity',
							!summaryOverflow.hasTop && 'opacity-0'
						)}
						data-testid="runtime-disabled-summary-overflow-top"
					>
						{overflowTopHintLabel}
					</span>
					<span data-testid="runtime-disabled-summary-scroll-hint">
						{summaryScrollHintLabel}
					</span>
					<span
						className={cn(
							'transition-opacity',
							!summaryOverflow.hasBottom && 'opacity-0'
						)}
						data-testid="runtime-disabled-summary-overflow-bottom"
					>
						{overflowBottomHintLabel}
					</span>
				</div>
			) : null}
			{canShowRawHintsToggle ? (
				<div className="space-y-2">
					<span
						className="sr-only"
						aria-live="polite"
						aria-atomic="true"
						data-testid="runtime-disabled-toggle-announcement"
					>
						{toggleStateAnnouncement}
					</span>
					<DesktopChromeTooltip
						content={
							showRawHints
								? toggleHideRawLabel
								: hiddenRawHintsCount > 0
									? `${toggleShowRawLabel} (${hiddenRawHintsCount})`
									: toggleShowRawLabel
						}
						placement="top"
						offsetExtra={4}
					>
						<DesktopAppButton
							type="button"
							size="sm"
							variant="ghost"
							onClick={handleToggleRawHints}
							aria-expanded={showRawHints}
							aria-controls={rawDetailsRegionId}
						>
							{showRawHints
								? toggleHideRawLabel
								: hiddenRawHintsCount > 0
									? `${toggleShowRawLabel} (${hiddenRawHintsCount})`
									: toggleShowRawLabel}
						</DesktopAppButton>
					</DesktopChromeTooltip>
					<section
						id={rawDetailsRegionId}
						aria-label={rawListTitle}
						className={cn(
							'space-y-1 rounded-md border border-(--desktop-border-subtle) bg-(--desktop-surface-soft-hover) p-2',
							!showRawHints && 'hidden'
						)}
						hidden={!showRawHints}
						aria-hidden={!showRawHints}
					>
						<div className="flex items-center justify-between gap-2">
							<div
								id={rawListLabelId}
								className="text-[11px] uppercase tracking-[0.14em] text-(--desktop-text-dim)"
							>
								{rawListTitle}
							</div>
							<span
								className="rounded-full border border-(--desktop-border-subtle) bg-(--desktop-surface) px-2 py-0.5 text-[10px] font-semibold text-(--desktop-text-muted)"
								aria-hidden="true"
								data-testid="runtime-disabled-details-count"
							>
								{detailsCountLabel} {rawHintEntries.length}
							</span>
						</div>
						<div className="relative">
							{detailsNeedsScroll ? (
								<div
									className="pointer-events-none absolute inset-x-0 top-0 z-20 px-1"
									aria-hidden="true"
									data-testid="runtime-disabled-details-sticky-subheader"
								>
									<div
										className={cn(
											'inline-flex items-center gap-2 rounded-md border border-(--desktop-border-subtle) bg-(--desktop-surface) px-2 py-0.5 text-[10px] font-medium text-(--desktop-text-muted) transition-shadow',
											detailsOverflow.hasTop ? 'shadow-sm' : 'shadow-none'
										)}
										data-testid="runtime-disabled-details-sticky-subheader-chip"
									>
										<span>{rawListTitle}</span>
										<span className="text-(--desktop-text-dim)">
											{detailsCountLabel} {rawHintEntries.length}
										</span>
									</div>
								</div>
							) : null}
							<ul
								ref={detailsListRef}
								className={cn(
									'list-none text-xs leading-relaxed text-(--desktop-text-secondary)',
									listSpacingClass,
									detailsNeedsScroll && 'max-h-44 overflow-y-auto pr-1 pt-6'
								)}
								aria-labelledby={rawListLabelId}
								data-testid="runtime-disabled-details-list"
								tabIndex={detailsNeedsScroll ? 0 : undefined}
								onScroll={
									detailsNeedsScroll
										? (event) =>
												setDetailsOverflow(
													resolveScrollOverflow(event.currentTarget, true)
												)
										: undefined
								}
							>
								{rawHintEntries.map((entry) => (
									<li
										key={entry.key}
										className={cn(
											'wrap-break-word rounded-md border border-(--desktop-border-subtle) bg-(--desktop-surface)',
											rowPaddingClass
										)}
									>
										{renderHintContent(entry.value)}
									</li>
								))}
							</ul>
							{detailsNeedsScroll ? (
								<>
									<div
										className={cn(
											'pointer-events-none absolute inset-x-0 top-0 z-10 rounded-t-md transition-opacity',
											overflowFadeStrength === 'strong' ? 'h-6' : 'h-4',
											!detailsOverflow.hasTop && 'opacity-0'
										)}
										style={{
											backgroundImage:
												'linear-gradient(to bottom, var(--desktop-surface-soft-hover), transparent)',
										}}
										aria-hidden="true"
										data-testid="runtime-disabled-details-fade-top"
									/>
									<div
										className={cn(
											'pointer-events-none absolute inset-x-0 bottom-0 z-10 rounded-b-md transition-opacity',
											overflowFadeStrength === 'strong' ? 'h-6' : 'h-4',
											!detailsOverflow.hasBottom && 'opacity-0'
										)}
										style={{
											backgroundImage:
												'linear-gradient(to top, var(--desktop-surface-soft-hover), transparent)',
										}}
										aria-hidden="true"
										data-testid="runtime-disabled-details-fade-bottom"
									/>
								</>
							) : null}
						</div>
						{detailsNeedsScroll ? (
							<div className="flex items-center justify-between gap-2 text-[11px] text-(--desktop-text-muted)">
								<span
									className={cn(
										'transition-opacity',
										!detailsOverflow.hasTop && 'opacity-0'
									)}
									data-testid="runtime-disabled-details-overflow-top"
								>
									{overflowTopHintLabel}
								</span>
								<span data-testid="runtime-disabled-details-scroll-hint">
									{detailsScrollHintLabel}
								</span>
								<span
									className={cn(
										'transition-opacity',
										!detailsOverflow.hasBottom && 'opacity-0'
									)}
									data-testid="runtime-disabled-details-overflow-bottom"
								>
									{overflowBottomHintLabel}
								</span>
							</div>
						) : null}
					</section>
				</div>
			) : null}
		</DesktopAppSurface>
	);
};

export default RuntimeDisabledActionsHintCard;
