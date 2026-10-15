import { cn } from '@/utils/cn';
import { useTranslation } from 'react-i18next';
import {
	ewrpPipelineActiveStepIndex,
	ewrpPipelineFailedStepIndex,
	ewrpPipelineMode,
} from './ewrpPipelineStatusStep';
import { sw } from './EwrpGeneratorChunks';
import {
	ArrowPathIcon,
	CheckIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';

type StepKey = 'queue' | 'content' | 'images' | 'pdf';

const STEP_KEYS: StepKey[] = ['queue', 'content', 'images', 'pdf'];

type EwrpPipelineStepsProps = {
	status: string;
	progress: number;
	className?: string;
};

export function EwrpPipelineSteps({
	status,
	progress,
	className,
}: EwrpPipelineStepsProps) {
	const { t } = useTranslation('ewrp');
	const mode = ewrpPipelineMode(status);
	const active = ewrpPipelineActiveStepIndex(status);
	const failedAt =
		mode === 'failed' ? ewrpPipelineFailedStepIndex(progress) : null;

	const labels: Record<StepKey, string> = {
		queue: t('form.pipelineStepQueue'),
		content: t('form.pipelineStepContent'),
		images: t('form.pipelineStepImages'),
		pdf: t('form.pipelineStepPdf'),
	};

	const ariaSummary =
		mode === 'completed'
			? t('form.pipelineDone')
			: mode === 'failed'
				? t('form.pipelineFailed')
				: mode === 'idle'
					? ''
					: labels[STEP_KEYS[active]];

	const segmentBeforeNextIsDone = (segIndex: number) => {
		if (mode === 'completed') return true;
		if (mode === 'failed' && failedAt !== null) return segIndex < failedAt;
		if (mode === 'running') return segIndex < active;
		return false;
	};

	if (mode === 'idle') return null;

	return (
		<fieldset
			className={cn('min-w-0 border-0 p-0', className)}
			aria-label={t('form.pipelineAria')}
		>
			<legend className="sr-only">{t('form.pipelineLegend')}</legend>
			<p className="sr-only">{ariaSummary}</p>
			<ol className="flex min-w-0 items-stretch gap-0">
				{STEP_KEYS.map((key, i) => {
					const isLast = i === STEP_KEYS.length - 1;
					let state: 'pending' | 'current' | 'done' | 'error' = 'pending';
					if (mode === 'completed') {
						state = 'done';
					} else if (mode === 'failed' && failedAt !== null) {
						if (i < failedAt) state = 'done';
						else if (i === failedAt) state = 'error';
						else state = 'pending';
					} else if (mode === 'running') {
						if (i < active) state = 'done';
						else if (i === active) state = 'current';
						else state = 'pending';
					}

					return (
						<li
							key={key}
							className="flex min-w-0 flex-1 items-center"
							aria-current={state === 'current' ? 'step' : undefined}
						>
							<div className="flex min-w-0 flex-1 flex-col items-center gap-1">
								<div
									className={cn(
										'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums transition-colors',
										state === 'done' &&
											'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
										state === 'current' &&
											'border-[rgb(var(--desktop-accent-rgb)/0.55)] bg-[rgb(var(--desktop-accent-rgb)/0.14)] text-[rgb(var(--desktop-accent-rgb)/0.95)] ring-2 ring-[rgb(var(--desktop-accent-rgb)/0.22)]',
										state === 'error' &&
											'border-red-500/55 bg-red-500/12 text-red-700 dark:text-red-300',
										state === 'pending' &&
											'border-(--desktop-border-subtle)/70 bg-(--desktop-surface-soft)/40 text-(--desktop-text-dim)'
									)}
								>
									{state === 'done' ? (
										<CheckIcon
											className="h-3.5 w-3.5"
											strokeWidth={sw}
											aria-hidden
										/>
									) : state === 'error' ? (
										<XMarkIcon
											className="h-3.5 w-3.5"
											strokeWidth={sw}
											aria-hidden
										/>
									) : state === 'current' ? (
										<ArrowPathIcon
											className="h-3.5 w-3.5 animate-spin"
											strokeWidth={sw}
											aria-hidden
										/>
									) : (
										<span aria-hidden>{i + 1}</span>
									)}
								</div>
								<span
									className={cn(
										'max-w-22 text-center text-[9px] font-medium leading-tight sm:max-w-none sm:text-[10px]',
										state === 'current' &&
											'text-[rgb(var(--desktop-accent-rgb)/0.95)]',
										state === 'error' && 'text-red-700 dark:text-red-300',
										(state === 'pending' || state === 'done') &&
											'text-(--desktop-text-dim)'
									)}
								>
									{labels[key]}
								</span>
							</div>
							{!isLast ? (
								<div
									className={cn(
										'mx-0.5 h-px min-w-[6px] flex-1 self-start mt-[13px] sm:mx-1',
										segmentBeforeNextIsDone(i)
											? 'bg-emerald-500/35'
											: 'bg-(--desktop-border-subtle)/60'
									)}
									aria-hidden
								/>
							) : null}
						</li>
					);
				})}
			</ol>
		</fieldset>
	);
}
