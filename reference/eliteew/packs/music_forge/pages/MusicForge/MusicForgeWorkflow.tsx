/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Animated step timeline for MusicForge backend-owned run snapshots.
 *
 * Invariants:
 * - Renders only backend step titles/statuses; it does not infer hidden workflow stages.
 * - Terminal failures expose backend error payloads without raw stack traces.
 *
 * Related:
 * - src/pages/MusicForge/MusicForgeApp.tsx
 * - src/pages/MusicForge/musicForgeUiHelpers.ts
 */

import {
	ArrowPathIcon,
	CheckCircleIcon,
	ClockIcon,
	ExclamationTriangleIcon,
	SparklesIcon,
	XCircleIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { DesktopAppButton } from '@/pages/Desktop/components/DesktopAppChrome';
import type {
	MusicForgeRun,
	MusicForgeRunStatus,
	MusicForgeStep,
	MusicForgeStepStatus,
} from '@/services/musicForge/musicForgeApi';
import { cn } from '@/utils/cn';
import { resolveMusicForgeErrorMessage } from './musicForgeUiHelpers';

function stepTone(status: MusicForgeStepStatus): string {
	if (status === 'completed')
		return 'border-emerald-400/35 bg-emerald-500/10 text-emerald-50';
	if (status === 'failed')
		return 'border-rose-400/45 bg-rose-500/10 text-rose-50';
	if (status === 'cancelled')
		return 'border-amber-400/45 bg-amber-500/10 text-amber-50';
	if (status === 'running')
		return 'border-fuchsia-300/50 bg-fuchsia-500/15 text-fuchsia-50';
	return 'border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-secondary)';
}

function statusLabel(
	status: MusicForgeStepStatus,
	t: (key: string) => string
): string {
	if (status === 'completed')
		return t('musicForge.workflow.stepStatus.completed');
	if (status === 'running') return t('musicForge.workflow.stepStatus.running');
	if (status === 'failed') return t('musicForge.workflow.stepStatus.failed');
	if (status === 'cancelled')
		return t('musicForge.workflow.stepStatus.cancelled');
	if (status === 'skipped') return t('musicForge.workflow.stepStatus.skipped');
	return t('musicForge.workflow.stepStatus.pending');
}

function StepIcon({ status }: { status: MusicForgeStepStatus }) {
	if (status === 'completed') return <CheckCircleIcon className="size-5" />;
	if (status === 'failed')
		return <ExclamationTriangleIcon className="size-5" />;
	if (status === 'cancelled') return <XCircleIcon className="size-5" />;
	if (status === 'running')
		return (
			<SparklesIcon className="size-5 motion-reduce:animate-none animate-pulse" />
		);
	return <ClockIcon className="size-5" />;
}

function StepCard({
	step,
	isCurrent,
	stepPosition,
	stepTotal,
}: {
	step: MusicForgeStep;
	isCurrent: boolean;
	stepPosition: number;
	stepTotal: number;
}) {
	const { t } = useTranslation('desktopUi');
	const stepError = resolveMusicForgeErrorMessage(
		step.error_payload,
		t('musicForge.workflow.stepErrorFallback')
	);
	const showStepError = step.status === 'failed';

	return (
		<li
			className={cn(
				'relative overflow-hidden rounded-2xl border px-4 py-3 transition',
				stepTone(step.status),
				isCurrent && 'scale-[1.01] shadow-lg shadow-fuchsia-950/20'
			)}
			aria-current={isCurrent ? 'step' : undefined}
			aria-label={t('musicForge.workflow.stepAria', {
				position: stepPosition,
				total: stepTotal,
				title: step.title,
			})}
		>
			{isCurrent ? (
				<div className="pointer-events-none absolute inset-0 motion-reduce:hidden bg-[radial-gradient(circle_at_20%_0%,rgba(244,114,182,0.18),transparent_35%),radial-gradient(circle_at_100%_80%,rgba(251,191,36,0.12),transparent_30%)]" />
			) : null}
			<div className="relative flex items-start gap-3">
				<div className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-black/20">
					<StepIcon status={step.status} />
				</div>
				<div className="min-w-0 flex-1">
					<p
						className="text-sm font-semibold wrap-break-word"
						title={step.title}
					>
						{step.title}
					</p>
					<p className="text-xs uppercase tracking-[0.16em] opacity-75">
						{statusLabel(step.status, t)}
					</p>
					{showStepError ? (
						<p className="mt-2 text-xs leading-relaxed opacity-90">
							{stepError}
						</p>
					) : null}
					{step.status === 'failed' && step.step_kind ? (
						<details className="mt-2 text-xs opacity-80">
							<summary className="cursor-pointer">
								{t('musicForge.workflow.supportDetails')}
							</summary>
							<p className="mt-1 font-mono text-[11px]">{step.step_kind}</p>
						</details>
					) : null}
				</div>
			</div>
		</li>
	);
}

function TerminalRunBanner({
	status,
	message,
	onRetry,
	onNewSong,
	canRetry,
}: {
	status: Extract<MusicForgeRunStatus, 'failed' | 'cancelled'>;
	message: string;
	onRetry?: () => void;
	onNewSong?: () => void;
	canRetry: boolean;
}) {
	const { t } = useTranslation('desktopUi');
	const titleKey =
		status === 'failed'
			? 'musicForge.terminal.failedTitle'
			: 'musicForge.terminal.cancelledTitle';

	return (
		<div
			className={cn(
				'mb-4 rounded-2xl border px-4 py-3',
				status === 'failed'
					? 'border-rose-400/35 bg-rose-500/10 text-rose-50'
					: 'border-amber-400/35 bg-amber-500/10 text-amber-50'
			)}
			role="alert"
		>
			<p className="text-sm font-semibold">{t(titleKey)}</p>
			<p className="mt-1 text-sm leading-relaxed opacity-90">{message}</p>
			<div className="mt-3 flex flex-wrap gap-2">
				{canRetry && onRetry ? (
					<DesktopAppButton type="button" variant="accent" onClick={onRetry}>
						<ArrowPathIcon className="size-4" />
						{t('musicForge.actions.retryGeneration')}
					</DesktopAppButton>
				) : null}
				{onNewSong ? (
					<DesktopAppButton type="button" variant="neutral" onClick={onNewSong}>
						{t('musicForge.actions.newSong')}
					</DesktopAppButton>
				) : null}
			</div>
		</div>
	);
}

export type MusicForgeWorkflowProps = {
	run: MusicForgeRun | null;
	cancelPending?: boolean;
	monitorError?: string | null;
	onRetry?: () => void;
	onNewSong?: () => void;
	canRetry?: boolean;
};

export function MusicForgeWorkflow({
	run,
	cancelPending = false,
	monitorError = null,
	onRetry,
	onNewSong,
	canRetry = false,
}: MusicForgeWorkflowProps) {
	const { t } = useTranslation('desktopUi');
	const steps = run?.steps ?? [];
	const runActive = run?.status === 'queued' || run?.status === 'running';
	const indeterminate = runActive && (run?.progress_total ?? 0) <= 0;
	const pct =
		run && run.progress_total > 0
			? Math.min(
					100,
					Math.round((run.progress_current / run.progress_total) * 100)
				)
			: 0;
	const current =
		steps.find((step) => step.status === 'running') ??
		steps.find((step) => step.status === 'failed');
	const terminalStatus =
		run?.status === 'failed' || run?.status === 'cancelled' ? run.status : null;
	const terminalMessage = terminalStatus
		? resolveMusicForgeErrorMessage(
				run?.error_payload,
				t(
					terminalStatus === 'failed'
						? 'musicForge.terminal.failedFallback'
						: 'musicForge.terminal.cancelledFallback'
				)
			)
		: '';

	return (
		<section className="rounded-3xl border border-white/10 bg-black/20 p-4 shadow-xl">
			{monitorError ? (
				<div
					className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
					role="alert"
				>
					{monitorError}
				</div>
			) : null}
			{terminalStatus ? (
				<TerminalRunBanner
					status={terminalStatus}
					message={terminalMessage}
					onRetry={onRetry}
					onNewSong={onNewSong}
					canRetry={canRetry}
				/>
			) : null}
			{cancelPending ? (
				<p className="mb-3 text-sm text-amber-100/90" role="status">
					{t('musicForge.workflow.cancelling')}
				</p>
			) : null}
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="text-xs uppercase tracking-[0.2em] text-amber-200/75">
						{t('musicForge.workflow.sectionLabel')}
					</p>
					<h3 className="text-lg font-semibold text-white wrap-break-word">
						{indeterminate
							? t('musicForge.workflow.preparing')
							: current
								? t('musicForge.workflow.currentStep', { title: current.title })
								: t('musicForge.workflow.awaitingStart')}
					</h3>
				</div>
				<div
					className="min-w-24 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-right text-sm font-semibold text-amber-100"
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={indeterminate ? undefined : pct}
					aria-busy={indeterminate || undefined}
					aria-label={
						indeterminate
							? t('musicForge.workflow.preparing')
							: t('musicForge.workflow.progressPercent', { pct })
					}
				>
					{indeterminate ? '…' : `${pct}%`}
				</div>
			</div>
			<div className="mb-4 h-2 overflow-hidden rounded-full bg-white/10">
				{indeterminate ? (
					<div className="h-full w-1/3 rounded-full bg-linear-to-r from-fuchsia-400 via-amber-300 to-emerald-300 motion-reduce:animate-none animate-pulse" />
				) : (
					<div
						className="h-full rounded-full bg-linear-to-r from-fuchsia-400 via-amber-300 to-emerald-300 transition-all"
						style={{ width: `${pct}%` }}
					/>
				)}
			</div>
			<ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
				{steps.length > 0 ? (
					steps.map((step, index) => (
						<StepCard
							key={`${step.step_index}-${step.step_kind}`}
							step={step}
							isCurrent={current?.step_kind === step.step_kind}
							stepPosition={index + 1}
							stepTotal={steps.length}
						/>
					))
				) : (
					<li className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-(--desktop-text-secondary)">
						{t('musicForge.workflow.emptySteps')}
					</li>
				)}
			</ol>
		</section>
	);
}
