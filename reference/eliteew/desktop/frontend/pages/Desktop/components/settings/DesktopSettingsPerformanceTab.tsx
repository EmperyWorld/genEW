/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Performance tab content for Desktop Settings Center (metrics + comfort toggles).
 *
 * Invariants:
 * - Live telemetry props are optional; tab renders static blocks when metrics are absent.
 *
 * Related:
 * - `DesktopSettingsPanel.tsx`, `DesktopSettingsFormCard.tsx`
 */

import type { FC } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { DESKTOP_TYPOGRAPHY } from '../../constants';
import type { DesktopWindowStyle } from '@/types/profile';
import { buildDesktopSettingsFieldElementId } from '../../utils/desktopSettingsFieldElementIds';
import type { ShellPerformanceActionSample } from '../../hooks/usePerformanceOptimizer';
import { SettingsFormCard } from './DesktopSettingsFormCard';
import { DesktopSettingsMotionSection } from './DesktopSettingsMotionSection';
import {
	DESKTOP_INACTIVE_WINDOW_SOFT_BLUR_CHANGE_EVENT,
	isDesktopInactiveWindowSoftBlurEnabled,
	setDesktopInactiveWindowSoftBlurEnabled,
} from '../../runtime/desktopInactiveWindowBlur';
import {
	collectDesktopInactiveWindowSoftBlurPerfSample,
	serializeDesktopInactiveWindowSoftBlurPerfSampleForShare,
	type DesktopInactiveWindowSoftBlurPerfSample,
} from '../../runtime/desktopInactiveWindowSoftBlurPerf';
import { safeCopyToClipboard } from '@/utils/clipboard';
import { isDesktopLowGpuModeEnabled } from '../../runtime/desktopLowGpuMode';
import {
	DESKTOP_REALTIME_PERF_MODE_CHANGE_EVENT,
	ensureDesktopRealtimePerfConsoleInstalled,
	isDesktopRealtimePerfMode,
	setDesktopRealtimePerfMode,
} from '@/services/communication/desktopRealtimePerfTelemetry';
import { computeInactiveBlurSmoothnessVerdict } from './desktopInactiveBlurSmoothnessVerdict';

const LONG_TASK_WARN_MS = 50;
const LONG_TASK_CRITICAL_MS = 100;

export interface PerformanceSummary {
	metrics: {
		fps: number;
		renderTime: number;
		memoryUsage: number;
		windowCount?: number;
		activeAdapters?: number;
		suspendedAdapters?: number;
		pausedEffects?: number;
		backgroundInvalidationsPerMin?: number;
		longTaskSupported?: boolean;
		longTaskCount?: number;
		lastLongTaskMs?: number | null;
		lastAction?: ShellPerformanceActionSample | null;
		actionSampleCount?: number;
	};
	isHighPerformanceMode: boolean;
	preferAggressiveBackgroundSuspend?: boolean;
	recommendations?: string[];
	setPreferAggressiveBackgroundSuspend?: (value: boolean) => void;
	animationsEnabled?: boolean;
	onAnimationsEnabledChange?: (value: boolean) => void | Promise<void>;
	reduceBackdropBlurEnabled?: boolean;
	onReduceBackdropBlurChange?: (value: boolean) => void | Promise<void>;
}

export type DesktopSettingsPerformanceTabShell = {
	windowStyle: DesktopWindowStyle;
	checkboxClass: string;
	statTileClass: string;
};

export interface DesktopSettingsPerformanceTabProps {
	performance: PerformanceSummary;
	shell: DesktopSettingsPerformanceTabShell;
	onOpenShellMotionSettings?: () => void;
}

interface PerformanceStatProps {
	tileClassName: string;
	label: string;
	value: string;
	hint: string;
}

const PerformanceStat: FC<PerformanceStatProps> = ({
	tileClassName,
	label,
	value,
	hint,
}) => (
	<div className={tileClassName}>
		<div className={cn(DESKTOP_TYPOGRAPHY.caption, 'uppercase tracking-wider')}>
			{label}
		</div>
		<div className="text-sm font-semibold text-(--desktop-text-primary)">
			{value}
		</div>
		<p
			className={cn(
				DESKTOP_TYPOGRAPHY.captionInherit,
				'text-(--desktop-text-dim)'
			)}
		>
			{hint}
		</p>
	</div>
);

export const DesktopSettingsPerformanceTab: FC<
	DesktopSettingsPerformanceTabProps
> = ({ performance, shell, onOpenShellMotionSettings }) => {
	const { t } = useTranslation('desktopUi');
	const {
		metrics,
		isHighPerformanceMode,
		preferAggressiveBackgroundSuspend,
		recommendations,
		setPreferAggressiveBackgroundSuspend,
		animationsEnabled,
		onAnimationsEnabledChange,
		reduceBackdropBlurEnabled,
		onReduceBackdropBlurChange,
	} = performance;
	const lowGpuMode = useMemo(() => isDesktopLowGpuModeEnabled(), []);
	const [realtimePerfMode, setRealtimePerfMode] = useState(() => {
		ensureDesktopRealtimePerfConsoleInstalled();
		return isDesktopRealtimePerfMode();
	});
	const [inactiveSoftBlurEnabled, setInactiveSoftBlurEnabled] = useState(() =>
		isDesktopInactiveWindowSoftBlurEnabled()
	);
	const [softBlurSample, setSoftBlurSample] =
		useState<DesktopInactiveWindowSoftBlurPerfSample | null>(null);
	const [softBlurSampleRunning, setSoftBlurSampleRunning] = useState(false);
	const [softBlurSampleCopied, setSoftBlurSampleCopied] = useState(false);
	const [showDetailedMetrics, setShowDetailedMetrics] = useState(false);

	useEffect(() => {
		const sync = () => {
			setInactiveSoftBlurEnabled(isDesktopInactiveWindowSoftBlurEnabled());
		};
		window.addEventListener(
			DESKTOP_INACTIVE_WINDOW_SOFT_BLUR_CHANGE_EVENT,
			sync
		);
		return () => {
			window.removeEventListener(
				DESKTOP_INACTIVE_WINDOW_SOFT_BLUR_CHANGE_EVENT,
				sync
			);
		};
	}, []);

	useEffect(() => {
		const sync = () => {
			setRealtimePerfMode(isDesktopRealtimePerfMode());
		};
		window.addEventListener(DESKTOP_REALTIME_PERF_MODE_CHANGE_EVENT, sync);
		return () => {
			window.removeEventListener(DESKTOP_REALTIME_PERF_MODE_CHANGE_EVENT, sync);
		};
	}, []);

	const runInactiveSoftBlurSample = useCallback(async () => {
		if (lowGpuMode || softBlurSampleRunning) return;
		setSoftBlurSampleRunning(true);
		setSoftBlurSample(null);
		setSoftBlurSampleCopied(false);
		try {
			const sample = await collectDesktopInactiveWindowSoftBlurPerfSample({
				sampleMs: 8000,
			});
			setSoftBlurSample(sample);
		} finally {
			setSoftBlurSampleRunning(false);
		}
	}, [lowGpuMode, softBlurSampleRunning]);

	const copyInactiveSoftBlurSample = useCallback(async () => {
		if (!softBlurSample) return;
		const ok = await safeCopyToClipboard(
			serializeDesktopInactiveWindowSoftBlurPerfSampleForShare(softBlurSample)
		);
		if (ok) {
			setSoftBlurSampleCopied(true);
			window.setTimeout(() => setSoftBlurSampleCopied(false), 2000);
		}
	}, [softBlurSample]);

	const lastLongTaskMs = Math.round(metrics.lastLongTaskMs ?? 0);
	const longTaskStatus = metrics.longTaskSupported
		? lastLongTaskMs > LONG_TASK_CRITICAL_MS
			? t('settingsPanel.perfLongTaskStatusCritical')
			: lastLongTaskMs > LONG_TASK_WARN_MS
				? t('settingsPanel.perfLongTaskStatusWarning')
				: t('settingsPanel.perfLongTaskStatusHealthy')
		: t('settingsPanel.perfLongTaskStatusUnavailable');
	const lastLongTaskValue = metrics.longTaskSupported
		? `${lastLongTaskMs} ${t('settingsPanel.perfMsUnit')} · ${longTaskStatus}`
		: t('settingsPanel.perfUnavailable');
	const lastLongTaskHint = metrics.longTaskSupported
		? t('settingsPanel.perfStatLongTaskMeasuredHint', {
				count: metrics.longTaskCount ?? 0,
				warnMs: LONG_TASK_WARN_MS,
				criticalMs: LONG_TASK_CRITICAL_MS,
			})
		: t('settingsPanel.perfStatLongTaskUnavailableHint');
	const lastActionValue = metrics.lastAction
		? `${t(`settingsPanel.perfAction.${metrics.lastAction.name}`)} · ${Math.round(metrics.lastAction.durationMs)} ${t('settingsPanel.perfMsUnit')}`
		: t('settingsPanel.perfActionNone');

	const softBlurVerdict = softBlurSample
		? computeInactiveBlurSmoothnessVerdict({
				fps: softBlurSample.fps,
				p95FrameMs: softBlurSample.p95FrameMs,
				longTaskCount: softBlurSample.longTaskCount,
			})
		: null;

	const comfortMotionControlsAvailable =
		onAnimationsEnabledChange &&
		onReduceBackdropBlurChange &&
		animationsEnabled !== undefined &&
		reduceBackdropBlurEnabled !== undefined;

	return (
		<section
			aria-labelledby="performance-heading"
			className="space-y-5"
			data-testid="desktop-settings-performance-tab"
		>
			<h3 id="performance-heading" className="sr-only">
				{t('settingsPanel.sectionPerformanceTitle')}
			</h3>

			<DesktopSettingsMotionSection>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId(
						'local_session',
						'performance_telemetry'
					)}
					title={t('settingsPanel.cardMetricsTitle')}
					windowStyle={shell.windowStyle}
				>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						<PerformanceStat
							tileClassName={shell.statTileClass}
							label={t('settingsPanel.perfStatFps')}
							value={metrics.fps.toString()}
							hint={t('settingsPanel.perfStatFpsHint')}
						/>
						<PerformanceStat
							tileClassName={shell.statTileClass}
							label={t('settingsPanel.perfStatWindows')}
							value={(metrics.windowCount ?? 0).toString()}
							hint={t('settingsPanel.perfStatWindowsHint')}
						/>
						<PerformanceStat
							tileClassName={shell.statTileClass}
							label={t('settingsPanel.perfStatMemory')}
							value={`${metrics.memoryUsage} ${t('performance.metricMemoryUnit')}`}
							hint={t('settingsPanel.perfStatMemoryHint')}
						/>
					</div>
					<button
						type="button"
						className={cn(
							'mt-3 text-sm font-medium text-[rgb(var(--desktop-accent-rgb))] underline-offset-2 hover:underline',
							DESKTOP_TYPOGRAPHY.captionInherit
						)}
						onClick={() => setShowDetailedMetrics((prev) => !prev)}
						aria-expanded={showDetailedMetrics}
					>
						{showDetailedMetrics
							? t('settingsPanel.perfHideDetailedDiagnostics')
							: t('settingsPanel.perfShowDetailedDiagnostics')}
					</button>
					{showDetailedMetrics ? (
						<div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
							<PerformanceStat
								tileClassName={shell.statTileClass}
								label={t('settingsPanel.perfStatRender')}
								value={`${Math.round(metrics.renderTime)} ${t('settingsPanel.perfMsUnit')}`}
								hint={t('settingsPanel.perfStatRenderHint')}
							/>
							<PerformanceStat
								tileClassName={shell.statTileClass}
								label={t('settingsPanel.perfStatActiveAdapters')}
								value={(metrics.activeAdapters ?? 0).toString()}
								hint={t('settingsPanel.perfStatActiveAdaptersHint')}
							/>
							<PerformanceStat
								tileClassName={shell.statTileClass}
								label={t('settingsPanel.perfStatSuspended')}
								value={(metrics.suspendedAdapters ?? 0).toString()}
								hint={t('settingsPanel.perfStatSuspendedHint')}
							/>
							<PerformanceStat
								tileClassName={shell.statTileClass}
								label={t('settingsPanel.perfStatPausedEffects')}
								value={(metrics.pausedEffects ?? 0).toString()}
								hint={t('settingsPanel.perfStatPausedEffectsHint')}
							/>
							<PerformanceStat
								tileClassName={shell.statTileClass}
								label={t('settingsPanel.perfStatInvalidations')}
								value={t('settingsPanel.perfPerMin', {
									count: metrics.backgroundInvalidationsPerMin ?? 0,
								})}
								hint={t('settingsPanel.perfStatInvalidationsHint')}
							/>
							<PerformanceStat
								tileClassName={shell.statTileClass}
								label={t('settingsPanel.perfStatLongTask')}
								value={lastLongTaskValue}
								hint={lastLongTaskHint}
							/>
							<PerformanceStat
								tileClassName={shell.statTileClass}
								label={t('settingsPanel.perfStatLastAction')}
								value={lastActionValue}
								hint={t('settingsPanel.perfStatLastActionHint', {
									count: metrics.actionSampleCount ?? 0,
								})}
							/>
						</div>
					) : null}
				</SettingsFormCard>
			</DesktopSettingsMotionSection>

			<DesktopSettingsMotionSection delaySec={0.04}>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId(
						'profile_ui',
						'animations_enabled'
					)}
					title={t('settingsPanel.cardSmoothnessEffectsTitle')}
					windowStyle={shell.windowStyle}
				>
					<div className="space-y-4">
						<div>
							<p className="text-xs text-(--desktop-text-secondary)">
								{t('settingsPanel.perfCurrentMode')}{' '}
								<span className="font-medium">
									{isHighPerformanceMode
										? t('settingsPanel.perfModeHigh')
										: t('settingsPanel.perfModeStandard')}
								</span>
							</p>
							<label className="mt-2 inline-flex items-center gap-2 text-sm text-(--desktop-text-secondary) cursor-pointer">
								<input
									type="checkbox"
									className={shell.checkboxClass}
									checked={Boolean(preferAggressiveBackgroundSuspend)}
									onChange={(event) => {
										setPreferAggressiveBackgroundSuspend?.(
											event.target.checked
										);
									}}
								/>
								{t('settingsPanel.perfAggressiveBg')}
							</label>
							<p
								className={cn(
									DESKTOP_TYPOGRAPHY.captionInherit,
									'mt-1 text-(--desktop-text-dim)'
								)}
							>
								{t('settingsPanel.perfAggressiveBgHint')}
							</p>
							<label className="mt-4 inline-flex items-start gap-2 text-sm text-(--desktop-text-secondary) cursor-pointer">
								<input
									type="checkbox"
									className={cn(shell.checkboxClass, 'mt-0.5 shrink-0')}
									checked={realtimePerfMode}
									onChange={(event) => {
										setDesktopRealtimePerfMode(event.target.checked);
										setRealtimePerfMode(event.target.checked);
									}}
								/>
								<span className="min-w-0">
									<span className="font-medium text-(--desktop-text-primary)">
										{t('settingsPanel.perfRealtimeMarksLabel')}
									</span>
									<span
										className={cn(
											'mt-0.5 block leading-relaxed',
											DESKTOP_TYPOGRAPHY.meta,
											'text-(--desktop-text-dim)'
										)}
									>
										{t('settingsPanel.perfRealtimeMarksHint')}
									</span>
								</span>
							</label>
						</div>

						{comfortMotionControlsAvailable ? (
							<div className="flex flex-col gap-3 border-t border-(--desktop-border-subtle) pt-4">
								<label className="flex cursor-pointer items-start gap-2.5 text-sm text-(--desktop-text-secondary)">
									<input
										type="checkbox"
										className={cn(shell.checkboxClass, 'mt-0.5 shrink-0')}
										checked={Boolean(animationsEnabled)}
										onChange={(event) => {
											void onAnimationsEnabledChange?.(event.target.checked);
										}}
									/>
									<span className="min-w-0">
										<span className="font-medium text-(--desktop-text-primary)">
											{t('settingsPanel.performanceAnimationsLabel')}
										</span>
										<span
											className={cn(
												'mt-0.5 block leading-relaxed',
												DESKTOP_TYPOGRAPHY.meta,
												'text-(--desktop-text-dim)'
											)}
										>
											{t('settingsPanel.performanceAnimationsHint')}
										</span>
									</span>
								</label>
								<label
									id={buildDesktopSettingsFieldElementId(
										'profile_ui',
										'desktop_reduce_backdrop_blur'
									)}
									className="flex cursor-pointer items-start gap-2.5 text-sm text-(--desktop-text-secondary) scroll-mt-20"
								>
									<input
										type="checkbox"
										className={cn(shell.checkboxClass, 'mt-0.5 shrink-0')}
										checked={Boolean(reduceBackdropBlurEnabled)}
										onChange={(event) => {
											void onReduceBackdropBlurChange?.(event.target.checked);
										}}
									/>
									<span className="min-w-0">
										<span className="font-medium text-(--desktop-text-primary)">
											{t('settingsPanel.performanceBackdropBlurLabel')}
										</span>
										<span
											className={cn(
												'mt-0.5 block leading-relaxed',
												DESKTOP_TYPOGRAPHY.meta,
												'text-(--desktop-text-dim)'
											)}
										>
											{t('settingsPanel.performanceBackdropBlurHint')}
										</span>
									</span>
								</label>
								<p
									className={cn(
										DESKTOP_TYPOGRAPHY.meta,
										'text-(--desktop-text-dim)'
									)}
								>
									{t('settingsPanel.performanceInactiveSoftBlurScopeHint')}
								</p>
								{onOpenShellMotionSettings ? (
									<div className="rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2.5">
										<p
											className={cn(
												DESKTOP_TYPOGRAPHY.meta,
												'text-(--desktop-text-dim)'
											)}
										>
											{t('settingsPanel.performanceShellMotionHint')}
										</p>
										<button
											type="button"
											onClick={onOpenShellMotionSettings}
											className={cn(
												'mt-2 text-sm font-medium text-[rgb(var(--desktop-accent-rgb))] underline-offset-2 hover:underline',
												DESKTOP_TYPOGRAPHY.captionInherit
											)}
										>
											{t('settingsPanel.performanceShellMotionLink')}
										</button>
									</div>
								) : null}
							</div>
						) : null}
					</div>
				</SettingsFormCard>
			</DesktopSettingsMotionSection>

			<DesktopSettingsMotionSection delaySec={0.1}>
				<SettingsFormCard
					id={buildDesktopSettingsFieldElementId(
						'local_session',
						'inactive_window_soft_blur_experiment'
					)}
					title={t('settingsPanel.performanceInactiveSoftBlurTitle')}
					windowStyle={shell.windowStyle}
					titleAdornment={
						<span className="rounded-md border border-amber-400/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100/90">
							{t('settingsPanel.performanceInactiveSoftBlurExperimentalBadge')}
						</span>
					}
				>
					<div className="flex flex-col gap-3">
						<p
							className={cn(
								DESKTOP_TYPOGRAPHY.meta,
								'text-(--desktop-text-dim)'
							)}
						>
							{t('settingsPanel.performanceInactiveSoftBlurDoesNotSync')}
						</p>
						<label className="flex cursor-pointer items-start gap-2.5 text-sm text-(--desktop-text-secondary)">
							<input
								type="checkbox"
								className={cn(shell.checkboxClass, 'mt-0.5 shrink-0')}
								checked={inactiveSoftBlurEnabled}
								disabled={lowGpuMode}
								onChange={(event) => {
									setDesktopInactiveWindowSoftBlurEnabled(event.target.checked);
									setInactiveSoftBlurEnabled(event.target.checked);
								}}
							/>
							<span className="min-w-0">
								<span className="font-medium text-(--desktop-text-primary)">
									{t('settingsPanel.performanceInactiveSoftBlurLabel')}
								</span>
								<span
									className={cn(
										'mt-0.5 block leading-relaxed',
										DESKTOP_TYPOGRAPHY.meta,
										'text-(--desktop-text-dim)'
									)}
								>
									{lowGpuMode
										? t(
												'settingsPanel.performanceInactiveSoftBlurLowGpuDisabled'
											)
										: t('settingsPanel.performanceInactiveSoftBlurHint')}
								</span>
							</span>
						</label>
						<p
							className={cn(
								DESKTOP_TYPOGRAPHY.meta,
								'text-(--desktop-text-dim)'
							)}
						>
							{t('settingsPanel.performanceInactiveSoftBlurMeasureHint')}
						</p>
						<div className="flex flex-wrap items-center gap-2">
							<button
								type="button"
								className={cn(
									'rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-1.5 text-sm font-medium text-(--desktop-text-primary)',
									(lowGpuMode || softBlurSampleRunning) &&
										'cursor-not-allowed opacity-50'
								)}
								disabled={lowGpuMode || softBlurSampleRunning}
								onClick={() => {
									void runInactiveSoftBlurSample();
								}}
							>
								{softBlurSampleRunning
									? t('settingsPanel.performanceInactiveSoftBlurMeasureRunning')
									: t('settingsPanel.performanceInactiveSoftBlurMeasure')}
							</button>
						</div>
						{softBlurSample ? (
							<div
								className={cn(
									'rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2.5',
									DESKTOP_TYPOGRAPHY.meta,
									'text-(--desktop-text-secondary)'
								)}
							>
								<p className="font-medium text-(--desktop-text-primary)">
									{t(
										'settingsPanel.performanceInactiveSoftBlurMeasureResultTitle'
									)}
								</p>
								{softBlurVerdict ? (
									<p className="mt-1 font-medium text-[rgb(var(--desktop-accent-rgb))]">
										{t('settingsPanel.performanceInactiveSoftBlurVerdictTitle')}{' '}
										{t(
											softBlurVerdict === 'good'
												? 'settingsPanel.performanceInactiveSoftBlurVerdictGood'
												: softBlurVerdict === 'medium'
													? 'settingsPanel.performanceInactiveSoftBlurVerdictMedium'
													: 'settingsPanel.performanceInactiveSoftBlurVerdictLow'
										)}
									</p>
								) : null}
								<ul className="mt-1.5 list-disc space-y-0.5 pl-4">
									<li>
										{t(
											'settingsPanel.performanceInactiveSoftBlurMeasureResultSmoothness',
											{ fps: softBlurSample.fps }
										)}
									</li>
									<li>
										{t(
											'settingsPanel.performanceInactiveSoftBlurMeasureResultSlowest',
											{ ms: softBlurSample.p95FrameMs }
										)}
									</li>
									<li>
										{t(
											'settingsPanel.performanceInactiveSoftBlurMeasureResultStalls',
											{ count: softBlurSample.longTaskCount }
										)}
									</li>
									<li>
										{t(
											'settingsPanel.performanceInactiveSoftBlurMeasureResultBackground',
											{
												count: softBlurSample.inactiveSoftBlurShellCount,
											}
										)}
									</li>
								</ul>
								<button
									type="button"
									className={cn(
										'mt-2 rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface) px-3 py-1.5 text-sm font-medium text-(--desktop-text-primary)',
										softBlurSampleCopied &&
											'text-[rgb(var(--desktop-accent-rgb))]'
									)}
									onClick={() => {
										void copyInactiveSoftBlurSample();
									}}
								>
									{softBlurSampleCopied
										? t(
												'settingsPanel.performanceInactiveSoftBlurCopyResultDone'
											)
										: t('settingsPanel.performanceInactiveSoftBlurCopyResult')}
								</button>
							</div>
						) : null}
					</div>
				</SettingsFormCard>
			</DesktopSettingsMotionSection>

			{recommendations && recommendations.length > 0 ? (
				<DesktopSettingsMotionSection delaySec={0.12}>
					<SettingsFormCard
						title={t('settingsPanel.cardRecommendationsTitle')}
						windowStyle={shell.windowStyle}
					>
						<ul className="text-xs text-(--desktop-text-secondary) space-y-1 list-disc list-inside">
							{recommendations.map((rec) => (
								<li key={rec}>{rec}</li>
							))}
						</ul>
					</SettingsFormCard>
				</DesktopSettingsMotionSection>
			) : null}
		</section>
	);
};
