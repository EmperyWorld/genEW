/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Thin desktop app for the separate MusicForge backend-first song generation flow.
 *
 * Invariants:
 * - The UI submits only user intent and renders backend snapshots; no raw workflow/model/sampler controls.
 * - Active progress uses `monitorMusicForgeRun` (SSE first, backoff GET poll; pauses when tab hidden).
 *
 * Related:
 * - src/services/musicForge/musicForgeApi.ts
 * - src/pages/MusicForge/musicForgeUiHelpers.ts
 */

import {
	ArrowPathIcon,
	MusicalNoteIcon,
	StopIcon,
} from '@heroicons/react/24/outline';
import {
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
	DesktopAppButton,
	DesktopAppContentWrapper,
	DesktopAppInput,
	DesktopAppPanel,
	DesktopAppSectionLabel,
	DesktopNativeSelect,
} from '@/pages/Desktop/components/DesktopAppChrome';
import {
	cancelMusicForgeRun,
	createMusicForgeRun,
	fetchMusicForgeCapabilities,
	fetchMusicForgeRun,
	isMusicForgeRunTerminalStatus,
	monitorMusicForgeRun,
	type MusicForgeCapabilities,
	type MusicForgeLanguage,
	type MusicForgeRun,
	type MusicForgeRunCreate,
} from '@/services/musicForge/musicForgeApi';
import { cn } from '@/utils/cn';
import {
	clampDurationSeconds,
	ideaNeedsMinLengthHint,
	mapMusicForgeApiError,
} from './musicForgeUiHelpers';
import { MusicForgeResultCard } from './MusicForgeResultCard';
import { MusicForgeWorkflow } from './MusicForgeWorkflow';

const DEFAULT_CAPABILITIES: MusicForgeCapabilities = {
	default_language: 'auto',
	languages: [
		{ value: 'auto', label_ru: 'Авто' },
		{ value: 'ru', label_ru: 'Русский' },
		{ value: 'en', label_ru: 'English' },
	],
	duration_seconds_default: 180,
	duration_seconds_min: 60,
	duration_seconds_max: 240,
	mvp_lane: 'SFT XL (default) | BASE XL | TURBO XL',
	frontend_role: 'thin_client',
	modes: [],
	default_mode_key: null,
};

type MusicForgeAppProps = {
	embedded?: boolean;
	initialRunId?: string | null;
};

export function MusicForgeApp({
	embedded = false,
	initialRunId = null,
}: MusicForgeAppProps) {
	const { t } = useTranslation('desktopUi');
	const [capabilities, setCapabilities] = useState(DEFAULT_CAPABILITIES);
	const [capabilitiesWarning, setCapabilitiesWarning] = useState(false);
	const [idea, setIdea] = useState('');
	const [language, setLanguage] = useState<MusicForgeLanguage>('auto');
	const [modeKey, setModeKey] = useState('');
	const [styleHint, setStyleHint] = useState('');
	const [constraints, setConstraints] = useState('');
	const [duration, setDuration] = useState(150);
	const [runId, setRunId] = useState<string | null>(initialRunId);
	const [run, setRun] = useState<MusicForgeRun | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [cancelPending, setCancelPending] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [monitorError, setMonitorError] = useState<string | null>(null);
	const lastSubmitRef = useRef<MusicForgeRunCreate | null>(null);

	const runActive = run?.status === 'queued' || run?.status === 'running';
	const canSubmit = idea.trim().length >= 3 && !submitting && !runActive;
	const ideaHintVisible = ideaNeedsMinLengthHint(idea);
	const statusText = useMemo(() => {
		if (!run) return t('musicForge.status.idle');
		if (cancelPending) return t('musicForge.status.cancelPending');
		if (run.status === 'completed') return t('musicForge.status.completed');
		if (run.status === 'failed') return t('musicForge.status.failed');
		if (run.status === 'cancelled') return t('musicForge.status.cancelled');
		return t('musicForge.status.active');
	}, [cancelPending, run, t]);

	const resolveLanguageLabel = useCallback(
		(value: MusicForgeLanguage, fallbackLabel: string) => {
			const key = `musicForge.languages.${value}`;
			const translated = t(key);
			return translated === key ? fallbackLabel : translated;
		},
		[t]
	);

	const loadCapabilities = useCallback(() => {
		setCapabilitiesWarning(false);
		return fetchMusicForgeCapabilities()
			.then((data) => {
				setCapabilities(data);
				setLanguage(data.default_language);
				setDuration(data.duration_seconds_default);
				const modes = data.modes ?? [];
				const preferred =
					data.default_mode_key ||
					modes.find((m) => m.is_default)?.mode_key ||
					modes[0]?.mode_key ||
					'';
				setModeKey(preferred);
			})
			.catch(() => {
				setCapabilities(DEFAULT_CAPABILITIES);
				setCapabilitiesWarning(true);
			});
	}, []);

	useEffect(() => {
		let alive = true;
		void loadCapabilities().finally(() => {
			if (!alive) return;
		});
		return () => {
			alive = false;
		};
	}, [loadCapabilities]);

	useEffect(() => {
		if (!initialRunId) return;
		setRunId(initialRunId);
	}, [initialRunId]);

	useEffect(() => {
		if (!runId) return;
		const controller = new AbortController();
		let stopped = false;

		void monitorMusicForgeRun({
			runId,
			signal: controller.signal,
			onRunSnapshot: (next) => {
				if (stopped) return;
				setRun(next);
				if (isMusicForgeRunTerminalStatus(next.status)) {
					setCancelPending(false);
					setMonitorError(null);
				}
			},
			onError: (exc) => {
				if (stopped) return;
				const offline = typeof navigator !== 'undefined' && !navigator.onLine;
				setMonitorError(
					offline
						? t('musicForge.errors.offline')
						: mapMusicForgeApiError(exc, t, 'musicForge.errors.pollFailed')
				);
			},
		}).catch(() => {
			/* abort / monitor end — UI keeps last snapshot */
		});

		return () => {
			stopped = true;
			controller.abort();
		};
	}, [runId, t]);

	const applyLastPayloadToForm = useCallback(
		(payload: MusicForgeRunCreate) => {
			setIdea(payload.idea);
			setLanguage(payload.language ?? 'auto');
			setModeKey(payload.mode_key ?? capabilities.default_mode_key ?? '');
			setStyleHint(payload.style_hint ?? '');
			setConstraints(payload.constraints ?? '');
			setDuration(
				clampDurationSeconds(
					payload.duration_seconds ?? capabilities.duration_seconds_default,
					capabilities.duration_seconds_min,
					capabilities.duration_seconds_max
				)
			);
		},
		[
			capabilities.default_mode_key,
			capabilities.duration_seconds_default,
			capabilities.duration_seconds_max,
			capabilities.duration_seconds_min,
		]
	);

	const submitPayload = useCallback(
		async (payload: MusicForgeRunCreate) => {
			lastSubmitRef.current = payload;
			setSubmitting(true);
			setFormError(null);
			setRun(null);
			try {
				const created = await createMusicForgeRun(payload);
				setRunId(created.run_id);
				const snapshot = await fetchMusicForgeRun(created.run_id);
				setRun(snapshot);
			} catch (exc) {
				setFormError(
					mapMusicForgeApiError(exc, t, 'musicForge.errors.submitFailed')
				);
			} finally {
				setSubmitting(false);
			}
		},
		[t]
	);

	const submitRun = useCallback(
		async (event?: FormEvent) => {
			event?.preventDefault();
			if (!canSubmit) return;
			const clampedDuration = clampDurationSeconds(
				duration,
				capabilities.duration_seconds_min,
				capabilities.duration_seconds_max
			);
			if (clampedDuration !== duration) setDuration(clampedDuration);
			const payload: MusicForgeRunCreate = {
				idea: idea.trim(),
				language,
				style_hint: styleHint.trim() || null,
				constraints: constraints.trim() || null,
				duration_seconds: clampedDuration,
				mode_key: modeKey.trim() || null,
				idempotency_key: crypto.randomUUID(),
			};
			await submitPayload(payload);
		},
		[
			canSubmit,
			capabilities.duration_seconds_max,
			capabilities.duration_seconds_min,
			constraints,
			duration,
			idea,
			language,
			modeKey,
			styleHint,
			submitPayload,
		]
	);

	const restoreLastRequest = useCallback(() => {
		const last = lastSubmitRef.current;
		if (!last || runActive) return;
		applyLastPayloadToForm(last);
	}, [applyLastPayloadToForm, runActive]);

	const retryGeneration = useCallback(async () => {
		const last = lastSubmitRef.current;
		if (!last || runActive) return;
		applyLastPayloadToForm(last);
		await submitPayload({
			...last,
			idempotency_key: crypto.randomUUID(),
		});
	}, [applyLastPayloadToForm, runActive, submitPayload]);

	const startNewSong = useCallback(() => {
		setRunId(null);
		setRun(null);
		setFormError(null);
		setMonitorError(null);
		setCancelPending(false);
	}, []);

	const cancelRun = useCallback(async () => {
		if (!runId || !runActive || cancelPending) return;
		setCancelPending(true);
		try {
			const next = await cancelMusicForgeRun(runId);
			setRun(next);
		} catch (exc) {
			setFormError(
				mapMusicForgeApiError(exc, t, 'musicForge.errors.cancelFailed')
			);
		} finally {
			setCancelPending(false);
		}
	}, [cancelPending, runActive, runId, t]);

	const handleDurationBlur = useCallback(() => {
		setDuration((current) =>
			clampDurationSeconds(
				current,
				capabilities.duration_seconds_min,
				capabilities.duration_seconds_max
			)
		);
	}, [capabilities.duration_seconds_max, capabilities.duration_seconds_min]);

	return (
		<DesktopAppContentWrapper
			appComponent="MusicForgeApp"
			mode={embedded ? 'passthrough' : 'standard'}
			className="h-full min-h-0 overflow-hidden"
		>
			<div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_10%_0%,rgba(217,70,239,0.18),transparent_30%),radial-gradient(circle_at_90%_10%,rgba(251,191,36,0.14),transparent_30%)]">
				<header className="shrink-0 border-b border-white/10 px-5 py-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="min-w-0">
							<h1 className="truncate text-2xl font-bold text-white">
								{t('musicForge.title')}
							</h1>
							<p className="mt-1 max-w-3xl text-sm text-(--desktop-text-secondary)">
								{t('musicForge.subtitle')}
							</p>
						</div>
						<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right">
							<p className="text-xs uppercase tracking-[0.18em] text-fuchsia-100/75">
								{t('musicForge.statusLabel')}
							</p>
							<p className="text-sm font-semibold text-white">{statusText}</p>
						</div>
					</div>
				</header>

				<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
					<div className="grid gap-5 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.4fr)]">
						<DesktopAppPanel className="space-y-4 p-4">
							{capabilitiesWarning ? (
								<div
									className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-50"
									role="status"
								>
									<p>{t('musicForge.capabilities.loadFailed')}</p>
									<DesktopAppButton
										type="button"
										variant="ghost"
										className="mt-2"
										onClick={() => void loadCapabilities()}
									>
										<ArrowPathIcon className="size-4" />
										{t('musicForge.capabilities.retry')}
									</DesktopAppButton>
								</div>
							) : null}
							<form
								className="space-y-4"
								onSubmit={(event) => void submitRun(event)}
							>
								<div>
									<DesktopAppSectionLabel>
										{t('musicForge.form.ideaLabel')}
									</DesktopAppSectionLabel>
									<DesktopAppInput
										id="music-forge-idea"
										value={idea}
										onChange={(event) => setIdea(event.target.value)}
										placeholder={t('musicForge.form.ideaPlaceholder')}
										disabled={runActive}
										aria-invalid={ideaHintVisible || undefined}
										aria-describedby={
											ideaHintVisible ? 'music-forge-idea-hint' : undefined
										}
									/>
									{ideaHintVisible ? (
										<p
											id="music-forge-idea-hint"
											className="mt-1 text-xs text-amber-100/90"
										>
											{t('musicForge.form.ideaMinLength')}
										</p>
									) : null}
								</div>
								{(capabilities.modes?.length ?? 0) > 0 ? (
									<div>
										<DesktopAppSectionLabel htmlFor="music-forge-mode">
											{t('musicForge.form.modeLabel')}
										</DesktopAppSectionLabel>
										<DesktopNativeSelect
											id="music-forge-mode"
											value={modeKey}
											onChange={(event) => setModeKey(event.target.value)}
											disabled={runActive}
											aria-describedby="music-forge-mode-hint"
										>
											{(capabilities.modes ?? []).map((mode) => (
												<option key={mode.mode_key} value={mode.mode_key}>
													{language === 'en' ? mode.label_en : mode.label_ru}
												</option>
											))}
										</DesktopNativeSelect>
										<p
											id="music-forge-mode-hint"
											className="mt-1 text-xs text-(--desktop-text-dim)"
										>
											{t('musicForge.form.modeHint')}
										</p>
									</div>
								) : null}
								<div className="grid gap-3 sm:grid-cols-2">
									<div>
										<DesktopAppSectionLabel>
											{t('musicForge.form.languageLabel')}
										</DesktopAppSectionLabel>
										<DesktopNativeSelect
											value={language}
											onChange={(event) =>
												setLanguage(event.target.value as MusicForgeLanguage)
											}
											disabled={runActive}
										>
											{capabilities.languages.map((item) => (
												<option key={item.value} value={item.value}>
													{resolveLanguageLabel(item.value, item.label_ru)}
												</option>
											))}
										</DesktopNativeSelect>
									</div>
									<div>
										<DesktopAppSectionLabel htmlFor="music-forge-duration">
											{t('musicForge.form.durationLabel')}
										</DesktopAppSectionLabel>
										<DesktopAppInput
											id="music-forge-duration"
											type="number"
											min={capabilities.duration_seconds_min}
											max={capabilities.duration_seconds_max}
											value={duration}
											onChange={(event) =>
												setDuration(Number(event.target.value))
											}
											onBlur={handleDurationBlur}
											disabled={runActive}
											aria-describedby="music-forge-duration-hint"
										/>
										<p
											id="music-forge-duration-hint"
											className="mt-1 text-xs text-(--desktop-text-dim)"
										>
											{t('musicForge.form.durationRange', {
												min: capabilities.duration_seconds_min,
												max: capabilities.duration_seconds_max,
											})}
										</p>
									</div>
								</div>
								<div>
									<DesktopAppSectionLabel>
										{t('musicForge.form.styleHintLabel')}
									</DesktopAppSectionLabel>
									<DesktopAppInput
										value={styleHint}
										onChange={(event) => setStyleHint(event.target.value)}
										placeholder={t('musicForge.form.styleHintPlaceholder')}
										disabled={runActive}
									/>
								</div>
								<div>
									<DesktopAppSectionLabel>
										{t('musicForge.form.constraintsLabel')}
									</DesktopAppSectionLabel>
									<textarea
										value={constraints}
										onChange={(event) => setConstraints(event.target.value)}
										placeholder={t('musicForge.form.constraintsPlaceholder')}
										disabled={runActive}
										className={cn(
											'min-h-28 w-full rounded-2xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2.5 text-sm text-(--desktop-text-primary) outline-none [&::placeholder]:text-(--desktop-text-dim)',
											'focus:border-(--desktop-border-strong) focus:bg-(--desktop-surface-soft-hover)'
										)}
									/>
								</div>
								{formError ? (
									<div
										className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
										role="alert"
									>
										{formError}
									</div>
								) : null}
								<div className="flex flex-wrap gap-2">
									<DesktopAppButton
										type="submit"
										variant="accent"
										disabled={!canSubmit}
									>
										{runActive || submitting ? (
											<ArrowPathIcon className="size-4 motion-reduce:animate-none animate-spin" />
										) : (
											<MusicalNoteIcon className="size-4" />
										)}
										{t('musicForge.actions.createSong')}
									</DesktopAppButton>
									<DesktopAppButton
										type="button"
										variant="neutral"
										disabled={!runActive || cancelPending}
										onClick={() => void cancelRun()}
									>
										<StopIcon className="size-4" />
										{t('musicForge.actions.cancel')}
									</DesktopAppButton>
									<DesktopAppButton
										type="button"
										variant="ghost"
										disabled={runActive || !lastSubmitRef.current}
										onClick={restoreLastRequest}
									>
										{t('musicForge.actions.restoreLastRequest')}
									</DesktopAppButton>
								</div>
							</form>
						</DesktopAppPanel>

						<div className="space-y-5">
							<MusicForgeWorkflow
								run={run}
								cancelPending={cancelPending}
								monitorError={monitorError}
								onRetry={() => void retryGeneration()}
								onNewSong={startNewSong}
								canRetry={Boolean(lastSubmitRef.current) && !runActive}
							/>
							<MusicForgeResultCard run={run} />
						</div>
					</div>
				</div>
			</div>
		</DesktopAppContentWrapper>
	);
}

export default MusicForgeApp;
