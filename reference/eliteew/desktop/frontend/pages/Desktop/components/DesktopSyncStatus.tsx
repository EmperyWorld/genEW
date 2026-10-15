/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Unobtrusive sync status chip for Desktop persistence (offline / syncing / error / tab conflict).
 *
 * Invariants:
 * - Hidden when idle unless `hideWhenIdle` is false; idle still exposes `data-desktop-welcome-guide="sync-status"` anchor for welcome tour spotlight.
 *
 * Related:
 * - `DesktopChromeTooltip.tsx`, `DesktopTaskbarRecoveryChip.tsx`
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import {
	ArrowPathIcon,
	CheckCircleIcon,
	CloudIcon,
	ExclamationCircleIcon,
	NumberedListIcon,
} from '@heroicons/react/24/outline';

import {
	DESKTOP_INTERACTIVE,
	DESKTOP_TYPOGRAPHY,
	DESKTOP_Z_INDEX,
} from '../constants';
import {
	notifyStaleShellManualRecoverStarted,
	scheduleStaleShellRecoverOutcomeCheck,
	useStaleShellAutoRecoverUiState,
} from '../hooks/useDesktopStaleShellStateAutoRecover';
import { useDesktopShellSyncIdleIconPref } from '../hooks/useDesktopShellSyncIdleIconPref';
import { useDesktopSyncSavedPulse } from '../hooks/useDesktopSyncSavedPulse';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

type ShellStatePipelinePhase =
	| 'idle'
	| 'debouncing'
	| 'flushing'
	| 'conflict'
	| 'recovering';

export type SyncStatus =
	| 'idle'
	| 'offline'
	| 'syncing'
	| 'shell_debouncing'
	| 'error'
	| 'stale_shell_conflict'
	| 'tab_conflict'
	| 'persist_queue';

export interface DesktopSyncStatusProps {
	isOnline: boolean;
	isSyncing: boolean;
	error: string | null;
	/** Optional: do not show when idle (default true) */
	hideWhenIdle?: boolean;
	/** Another tab changed desktop data; show warning and offer refresh */
	tabConflictDetected?: boolean;
	/** Server data changed elsewhere; user should refresh before retrying save. */
	staleShellStateConflict?: boolean;
	/** Canonical shell_state mutation pipeline phase for honest sync chip copy. */
	shellStatePipelinePhase?: ShellStatePipelinePhase;
	onRefresh?: () => void | Promise<void>;
	onDismissConflict?: () => void;
	onRecoverStaleShellState?: () => void | Promise<void>;
	/** Retry sync when in error state (e.g. syncToServer) */
	onRetry?: () => void | Promise<void>;
	/** Queued PATCH ops waiting for server (online). */
	pendingQueuedPatches?: number;
	/** Retry flush of persist queue (same as background auto-flush). */
	onPersistQueueRetry?: () => undefined | Promise<unknown>;
}

export function DesktopSyncStatus({
	isOnline,
	isSyncing,
	error,
	hideWhenIdle = true,
	tabConflictDetected = false,
	staleShellStateConflict = false,
	shellStatePipelinePhase = 'idle',
	onRefresh,
	onDismissConflict,
	onRecoverStaleShellState,
	onRetry,
	pendingQueuedPatches = 0,
	onPersistQueueRetry,
}: DesktopSyncStatusProps) {
	const { t } = useTranslation('desktopUi');
	const staleShellAutoRecoverPhase = useStaleShellAutoRecoverUiState();
	const showSavedPulse = useDesktopSyncSavedPulse(isSyncing);
	const { showIdleSyncIcon } = useDesktopShellSyncIdleIconPref();
	const staleShellConflictRef = React.useRef(staleShellStateConflict);
	staleShellConflictRef.current = staleShellStateConflict;

	const handleRecoverStaleShellState = React.useCallback(() => {
		const recover = onRecoverStaleShellState ?? onRefresh;
		if (!recover) return;
		notifyStaleShellManualRecoverStarted();
		void Promise.resolve(recover()).finally(() => {
			scheduleStaleShellRecoverOutcomeCheck(
				() => staleShellConflictRef.current
			);
		});
	}, [onRecoverStaleShellState, onRefresh]);

	const queued = Math.max(0, Math.floor(pendingQueuedPatches));
	const pipelinePhase = shellStatePipelinePhase;
	const shellConflictActive =
		staleShellStateConflict || pipelinePhase === 'conflict';
	const pipelineBusy =
		pipelinePhase === 'debouncing' ||
		pipelinePhase === 'flushing' ||
		pipelinePhase === 'recovering';

	const showPersistQueue =
		isOnline &&
		!tabConflictDetected &&
		!shellConflictActive &&
		!error &&
		!isSyncing &&
		!pipelineBusy &&
		queued > 0;

	const status: SyncStatus = shellConflictActive
		? 'stale_shell_conflict'
		: tabConflictDetected
			? 'tab_conflict'
			: error
				? 'error'
				: !isOnline
					? 'offline'
					: pipelinePhase === 'debouncing'
						? 'shell_debouncing'
						: pipelinePhase === 'flushing' || pipelinePhase === 'recovering'
							? 'syncing'
							: isSyncing
								? 'syncing'
								: showPersistQueue
									? 'persist_queue'
									: 'idle';

	const showIdleSaved =
		status === 'idle' && (showSavedPulse || showIdleSyncIcon);

	if (status === 'idle' && hideWhenIdle && !showIdleSaved) return null;

	const content =
		status === 'idle' && showIdleSaved ? (
			<DesktopChromeTooltip
				content={
					showSavedPulse
						? t('syncStatus.savedTitle')
						: t('syncStatus.idleSavedTitle')
				}
				placement="top"
				offsetExtra={8}
			>
				<span
					className={cn(
						'flex items-center gap-1.5',
						showSavedPulse
							? 'text-emerald-400/90 motion-safe:animate-pulse motion-reduce:animate-none'
							: 'text-(--desktop-text-muted)'
					)}
				>
					{showSavedPulse ? (
						<CheckCircleIcon className="w-3.5 h-3.5" aria-hidden />
					) : (
						<CloudIcon className="w-3.5 h-3.5" aria-hidden />
					)}
					<span className={DESKTOP_TYPOGRAPHY.captionInherit}>
						{showSavedPulse ? t('syncStatus.saved') : t('syncStatus.idleSaved')}
					</span>
				</span>
			</DesktopChromeTooltip>
		) : status === 'offline' ? (
			<DesktopChromeTooltip
				content={t('syncStatus.ariaOffline')}
				placement="top"
				offsetExtra={8}
			>
				<span className="flex items-center gap-1.5 text-amber-400/90">
					<CloudIcon className="w-3.5 h-3.5" aria-hidden />
					<span className={DESKTOP_TYPOGRAPHY.captionInherit}>
						{t('syncStatus.offline')}
					</span>
				</span>
			</DesktopChromeTooltip>
		) : status === 'syncing' ? (
			<DesktopChromeTooltip
				content={
					pipelinePhase === 'flushing'
						? t('syncStatus.shellFlushing')
						: pipelinePhase === 'recovering'
							? t('syncStatus.shellRecovering')
							: t('syncStatus.ariaSyncing')
				}
				placement="top"
				offsetExtra={8}
			>
				<span className="flex items-center gap-1.5 text-(--desktop-text-muted)">
					<ArrowPathIcon
						className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none"
						aria-hidden
					/>
					<span className={DESKTOP_TYPOGRAPHY.captionInherit}>
						{pipelinePhase === 'flushing'
							? t('syncStatus.shellFlushing')
							: pipelinePhase === 'recovering'
								? t('syncStatus.shellRecovering')
								: t('syncStatus.syncing')}
					</span>
				</span>
			</DesktopChromeTooltip>
		) : status === 'shell_debouncing' ? (
			<DesktopChromeTooltip
				content={t('syncStatus.shellDebouncingTitle')}
				placement="top"
				offsetExtra={8}
			>
				<span className="flex items-center gap-1.5 text-(--desktop-text-muted)">
					<CloudIcon className="w-3.5 h-3.5" aria-hidden />
					<span className={DESKTOP_TYPOGRAPHY.captionInherit}>
						{t('syncStatus.shellDebouncing')}
					</span>
				</span>
			</DesktopChromeTooltip>
		) : status === 'persist_queue' ? (
			<span className="flex items-center gap-2 flex-wrap">
				<DesktopChromeTooltip
					content={t('syncStatus.persistQueuedTitle', { count: queued })}
					placement="top"
					offsetExtra={8}
				>
					<span className="flex items-center gap-1.5 text-amber-400/90">
						<NumberedListIcon className="w-3.5 h-3.5" aria-hidden />
						<span className={DESKTOP_TYPOGRAPHY.captionInherit}>
							{t('syncStatus.persistQueued', { count: queued })}
						</span>
					</span>
				</DesktopChromeTooltip>
				{onPersistQueueRetry && (
					<DesktopChromeTooltip
						content={t('syncStatus.flushQueue')}
						placement="top"
						offsetExtra={4}
					>
						<button
							type="button"
							onClick={() => void onPersistQueueRetry()}
							className={cn(
								'flex items-center gap-1 rounded px-1 py-0.5 text-(--desktop-text-secondary) hover:text-(--desktop-text-primary)',
								DESKTOP_TYPOGRAPHY.captionInherit,
								DESKTOP_INTERACTIVE.focusRing
							)}
						>
							<ArrowPathIcon className="w-3 h-3" />
							{t('syncStatus.flushQueue')}
						</button>
					</DesktopChromeTooltip>
				)}
			</span>
		) : status === 'stale_shell_conflict' ? (
			<span className="flex items-center gap-2 flex-wrap">
				<DesktopChromeTooltip
					content={
						staleShellAutoRecoverPhase === 'attempting'
							? t('syncStatus.ariaSyncing')
							: t('syncStatus.ariaStaleShellConflict')
					}
					placement="top"
					offsetExtra={8}
				>
					<span
						className={cn(
							'flex items-center gap-1.5',
							staleShellAutoRecoverPhase === 'failed'
								? 'text-red-400/90'
								: staleShellAutoRecoverPhase === 'attempting'
									? 'text-(--desktop-text-muted)'
									: 'text-amber-400/90'
						)}
					>
						{staleShellAutoRecoverPhase === 'attempting' ? (
							<ArrowPathIcon
								className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none"
								aria-hidden
							/>
						) : (
							<ExclamationCircleIcon className="w-3.5 h-3.5" aria-hidden />
						)}
						<span
							className={cn(
								DESKTOP_TYPOGRAPHY.captionInherit,
								'truncate max-w-[min(22rem,calc(100vw-5rem))]'
							)}
						>
							{staleShellAutoRecoverPhase === 'attempting'
								? t('syncStatus.syncing')
								: t('syncStatus.staleShellConflict')}
						</span>
					</span>
				</DesktopChromeTooltip>
				{(onRecoverStaleShellState || onRefresh) &&
					staleShellAutoRecoverPhase !== 'attempting' && (
						<DesktopChromeTooltip
							content={
								staleShellAutoRecoverPhase === 'failed'
									? t('syncStatus.retry')
									: t('syncStatus.refreshState')
							}
							placement="top"
							offsetExtra={4}
						>
							<button
								type="button"
								onClick={handleRecoverStaleShellState}
								className={cn(
									'flex items-center gap-1 rounded px-1 py-0.5 text-(--desktop-text-secondary) hover:text-(--desktop-text-primary)',
									DESKTOP_TYPOGRAPHY.captionInherit,
									DESKTOP_INTERACTIVE.focusRing
								)}
							>
								<ArrowPathIcon className="w-3 h-3" />
								{staleShellAutoRecoverPhase === 'failed'
									? t('syncStatus.retry')
									: t('syncStatus.refreshState')}
							</button>
						</DesktopChromeTooltip>
					)}
			</span>
		) : status === 'error' ? (
			<span className="flex items-center gap-2 flex-wrap">
				<DesktopChromeTooltip
					content={t('syncStatus.errorDetail')}
					placement="top"
					offsetExtra={8}
				>
					<span className="flex items-center gap-1.5 text-red-400/90">
						<ExclamationCircleIcon className="w-3.5 h-3.5" aria-hidden />
						<span
							className={cn(
								DESKTOP_TYPOGRAPHY.captionInherit,
								'truncate max-w-[min(22rem,calc(100vw-5rem))]'
							)}
						>
							{t('syncStatus.error')}
						</span>
					</span>
				</DesktopChromeTooltip>
				{(onRetry || onRefresh) && (
					<DesktopChromeTooltip
						content={t('syncStatus.retry')}
						placement="top"
						offsetExtra={4}
					>
						<button
							type="button"
							onClick={() => void (onRetry ? onRetry() : onRefresh?.())}
							className={cn(
								'flex items-center gap-1 rounded px-1 py-0.5 text-(--desktop-text-secondary) hover:text-(--desktop-text-primary)',
								DESKTOP_TYPOGRAPHY.captionInherit,
								DESKTOP_INTERACTIVE.focusRing
							)}
						>
							<ArrowPathIcon className="w-3 h-3" />
							{t('syncStatus.retry')}
						</button>
					</DesktopChromeTooltip>
				)}
			</span>
		) : status === 'tab_conflict' ? (
			<span className="flex items-center gap-2 flex-wrap">
				<DesktopChromeTooltip
					content={t('syncStatus.ariaTabConflict')}
					placement="top"
					offsetExtra={8}
				>
					<span className="flex items-center gap-1.5 text-amber-400/90">
						<ExclamationCircleIcon className="w-3.5 h-3.5" aria-hidden />
						<span className={DESKTOP_TYPOGRAPHY.captionInherit}>
							{t('syncStatus.tabConflict')}
						</span>
					</span>
				</DesktopChromeTooltip>
				{onRefresh && (
					<DesktopChromeTooltip
						content={t('syncStatus.refresh')}
						placement="top"
						offsetExtra={4}
					>
						<button
							type="button"
							onClick={() => {
								void onRefresh();
								onDismissConflict?.();
							}}
							className={cn(
								'flex items-center gap-1 rounded px-1 py-0.5 text-(--desktop-text-secondary) hover:text-(--desktop-text-primary)',
								DESKTOP_TYPOGRAPHY.captionInherit,
								DESKTOP_INTERACTIVE.focusRing
							)}
						>
							<ArrowPathIcon className="w-3 h-3" />
							{t('syncStatus.refresh')}
						</button>
					</DesktopChromeTooltip>
				)}
				{onDismissConflict && !onRefresh && (
					<DesktopChromeTooltip
						content={t('syncStatus.dismiss')}
						placement="top"
						offsetExtra={4}
					>
						<button
							type="button"
							onClick={onDismissConflict}
							className={cn(
								'rounded px-1 py-0.5 text-(--desktop-text-muted) hover:text-(--desktop-text-primary)',
								DESKTOP_TYPOGRAPHY.captionInherit,
								DESKTOP_INTERACTIVE.focusRing
							)}
						>
							{t('syncStatus.dismiss')}
						</button>
					</DesktopChromeTooltip>
				)}
			</span>
		) : null;

	if (!content) {
		return (
			<div
				data-desktop-welcome-guide="sync-status"
				className="pointer-events-none fixed bottom-14 left-4 h-10 w-56 opacity-0"
				style={{ zIndex: DESKTOP_Z_INDEX.SHELL_CANVAS_CHROME }}
				aria-hidden
			/>
		);
	}

	return (
		<div
			data-desktop-welcome-guide="sync-status"
			className="fixed bottom-14 left-4 max-w-[min(100vw-2rem,320px)] rounded-xl border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-panel-strong)_94%,var(--desktop-menu-tint)_6%)] px-3 py-2 text-(--desktop-text-primary) shadow-lg shadow-black/20 ring-1 ring-(--desktop-border-subtle)/60"
			style={{ zIndex: DESKTOP_Z_INDEX.SHELL_CANVAS_CHROME }}
			role="status"
			aria-live="polite"
			aria-label={
				status === 'idle' && showIdleSaved
					? showSavedPulse
						? t('syncStatus.ariaSaved')
						: t('syncStatus.ariaIdleSaved')
					: status === 'offline'
						? t('syncStatus.ariaOffline')
						: status === 'syncing'
							? pipelinePhase === 'flushing'
								? t('syncStatus.ariaShellFlushing')
								: pipelinePhase === 'recovering'
									? t('syncStatus.ariaShellRecovering')
									: t('syncStatus.ariaSyncing')
							: status === 'shell_debouncing'
								? t('syncStatus.ariaShellDebouncing')
								: status === 'persist_queue'
									? t('syncStatus.ariaPersistQueue', { count: queued })
									: status === 'error'
										? t('syncStatus.ariaError')
										: status === 'stale_shell_conflict'
											? staleShellAutoRecoverPhase === 'attempting'
												? t('syncStatus.ariaSyncing')
												: t('syncStatus.ariaStaleShellConflict')
											: status === 'tab_conflict'
												? t('syncStatus.ariaTabConflict')
												: undefined
			}
		>
			{content}
		</div>
	);
}

DesktopSyncStatus.displayName = 'DesktopSyncStatus';
