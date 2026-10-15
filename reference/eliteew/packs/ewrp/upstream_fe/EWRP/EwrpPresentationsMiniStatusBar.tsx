/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Sticky mini status bar on EWRP presentations tab while editing slides below the status panel.
 *
 * Invariants:
 * - Action-oriented copy only; no hotkey hints in visible UI.
 * - Save/cancel mirror footer editor actions and respect rebuild busy state.
 * - Scroll-to-status and scroll-to-editor CTAs are mutually gated by viewport anchors.
 * - Below `639px` the bar stacks: headline/chips row, then actions (save first).
 *
 * Related:
 * - `ewrpMiniStatusCompactLayout.ts`, `EwrpPresentationsScrollButton.tsx`, `EWRPGeneratorMain.tsx`
 */

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/utils/cn';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EwrpPresentationsScrollButton } from './EwrpPresentationsScrollButton';
import { EwrpStatusPhaseChip } from './EwrpStatusPhaseChip';
import {
	EWRP_MINI_STATUS_COMPACT_MQ,
	ewrpMiniStatusBarActionOrder,
	type EwrpMiniStatusBarAction,
} from './ewrpMiniStatusCompactLayout';
import { ewrpMiniStatusEditorActionsEnabled } from './ewrpMiniStatusEditorActions';
import { ewrpMiniStatusProgressVisible } from './ewrpMiniStatusProgressVisible';

const sw = 1.75;

export type EwrpPresentationsMiniStatusBarProps = {
	className?: string;
	headline: string;
	status: string;
	statusUpdatedAt?: string | null;
	progressPercent?: number;
	draftIsDirty?: boolean;
	saving?: boolean;
	slideRebuildInProgress?: boolean;
	onSave?: () => void;
	onCancel?: () => void;
	onScrollToStatus: () => void;
	onScrollToEditor?: () => void;
	secondaryBtnClass: string;
	primaryBtnClass: string;
};

/** Sticky task context while the slide editor is scrolled away from the status panel. */
export function EwrpPresentationsMiniStatusBar(
	props: EwrpPresentationsMiniStatusBarProps
) {
	const { t } = useTranslation('ewrp');
	const isCompact = useMediaQuery(EWRP_MINI_STATUS_COMPACT_MQ);
	const {
		className,
		headline,
		status,
		statusUpdatedAt,
		progressPercent = 0,
		draftIsDirty = false,
		saving = false,
		slideRebuildInProgress = false,
		onSave,
		onCancel,
		onScrollToStatus,
		onScrollToEditor,
		secondaryBtnClass,
		primaryBtnClass,
	} = props;
	const showProgress = ewrpMiniStatusProgressVisible(status);
	const editorActions = ewrpMiniStatusEditorActionsEnabled({
		draftIsDirty,
		saving,
		slideRebuildInProgress,
	});
	const showSave = Boolean(onSave);
	const showCancel = Boolean(onCancel);
	const showScrollEditor = Boolean(onScrollToEditor);

	const actionOrder = useMemo(
		() =>
			ewrpMiniStatusBarActionOrder({
				showSave,
				showCancel,
				showScrollEditor,
				compact: isCompact,
			}),
		[showSave, showCancel, showScrollEditor, isCompact]
	);

	const renderAction = (action: EwrpMiniStatusBarAction) => {
		switch (action) {
			case 'cancel':
				return onCancel ? (
					<button
						key="cancel"
						type="button"
						onClick={onCancel}
						disabled={!editorActions.cancel}
						className={cn(
							secondaryBtnClass,
							'text-[10px] sm:text-[11px]',
							!editorActions.cancel && 'opacity-50'
						)}
						title={t('form.editorMiniStatusCancelTitle')}
					>
						{t('form.cancel')}
					</button>
				) : null;
			case 'save':
				return showSave && onSave ? (
					<button
						key="save"
						type="button"
						onClick={onSave}
						disabled={!editorActions.save}
						aria-busy={saving || undefined}
						className={cn(
							primaryBtnClass,
							'inline-flex w-auto gap-1 px-2.5 py-1.5 text-[10px] sm:text-[11px]',
							!editorActions.save && 'opacity-50'
						)}
						title={
							draftIsDirty
								? t('form.editorMiniStatusSaveTitle')
								: t('form.editorSaveNoChangesTitle')
						}
					>
						{saving ? (
							<ArrowPathIcon
								className="h-3 w-3 shrink-0 animate-spin"
								strokeWidth={sw}
								aria-hidden
							/>
						) : null}
						{saving
							? t('form.savePdfRunning')
							: isCompact
								? t('form.editorMiniStatusSaveShort')
								: t('form.savePdfIdle')}
					</button>
				) : null;
			case 'scrollEditor':
				return onScrollToEditor ? (
					<EwrpPresentationsScrollButton
						key="scrollEditor"
						variant="editor"
						onClick={onScrollToEditor}
						buttonClassName={cn(
							secondaryBtnClass,
							'text-[10px] sm:text-[11px]'
						)}
					/>
				) : null;
			case 'scrollStatus':
				return (
					<EwrpPresentationsScrollButton
						key="scrollStatus"
						variant="status"
						onClick={onScrollToStatus}
						buttonClassName={cn(
							secondaryBtnClass,
							'text-[10px] sm:text-[11px]'
						)}
					/>
				);
			default:
				return null;
		}
	};

	return (
		<section
			className={cn(
				'sticky top-0 z-30 -mx-1 mb-3 flex shrink-0 flex-col gap-2 rounded-xl border border-(--desktop-border-subtle)/70 border-l-[3px] border-l-[rgb(var(--desktop-accent-rgb)/0.38)] bg-(--desktop-surface-panel)/95 px-3 py-2 shadow-(--desktop-shadow-soft) ring-1 ring-inset ring-white/[0.05] backdrop-blur-md sm:flex-row sm:flex-wrap sm:items-center',
				className
			)}
			aria-label={t('form.editorMiniStatusAria')}
			aria-busy={saving || slideRebuildInProgress || undefined}
		>
			<div className="flex min-w-0 flex-1 items-center gap-1.5">
				<p className="min-w-0 flex-1 truncate text-xs font-medium text-(--desktop-text-primary)">
					{headline}
				</p>
				<div className="flex shrink-0 flex-wrap items-center gap-1">
					<EwrpStatusPhaseChip
						status={status}
						updatedAt={statusUpdatedAt}
						size="sm"
					/>
					{showProgress ? (
						<span
							role="progressbar"
							aria-valuenow={progressPercent}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-label={t('form.progressAria', { n: progressPercent })}
							className="inline-flex min-h-6 items-center rounded-full border border-[rgb(var(--desktop-accent-rgb)/0.35)] bg-[rgb(var(--desktop-accent-rgb)/0.1)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-(--desktop-text-secondary)"
							title={t('form.editorMiniStatusProgressTitle', {
								n: progressPercent,
							})}
						>
							{progressPercent}%
						</span>
					) : null}
					{draftIsDirty ? (
						<span
							className={cn(
								'inline-flex items-center rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100/95',
								isCompact && 'max-w-[4.5rem] truncate'
							)}
							title={t('form.editorMiniStatusDirtyTitle')}
						>
							{isCompact
								? t('form.editorMiniStatusDirtyShort')
								: t('form.editorMiniStatusDirty')}
						</span>
					) : null}
				</div>
			</div>
			<div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:shrink-0">
				{actionOrder.map((action) => renderAction(action))}
			</div>
		</section>
	);
}
