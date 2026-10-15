/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Floating desktop widget (clock, credits, now playing, perf/notifications) extracted from workspace shell.
 *
 * Invariants:
 * - Widget reflects transport state from NowPlayingContext without creating parallel audio state.
 * - Menu/telemetry overlays remain keyboard reachable and portal-safe.
 *
 * Related:
 * - src/pages/Desktop/DesktopWorkspaceContent.tsx
 * - src/pages/MusicPlayer/MusicPlayerNowPlayingBar.tsx
 * - utils/subscribeDocumentVisibleSync.ts
 */
import { AudioTrackMeta } from '../../../components/Audio/AudioTrackMeta';
import { MiniAudioControls } from '../../../components/Audio/MiniAudioControls';
import { SecureAvatar } from '../../../components/profile/SecureAvatar';
import AuthStatusIndicator from '../../../components/ui/AuthStatusIndicator';
import { useAvailableCredits } from '../../../components/ui/useAvailableCredits';
import { useAuth } from '../../../contexts/AuthContext';
import type { DesktopWidgetsStyle } from '../../../types/profile';
import { cn } from '@/utils/cn';
import { formatDuration } from '../../../utils/formatDuration';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import * as React from 'react';
import type { CSSProperties } from 'react';
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
	DESKTOP_INTERACTIVE,
	DESKTOP_LAYOUT,
	DESKTOP_FLOATING_WIDGET_POSITION_SEED,
	DESKTOP_LUCIDE,
	DESKTOP_POLLING,
	DESKTOP_PORTAL_STACK_BUMP,
	DESKTOP_TYPOGRAPHY,
	STORAGE_KEYS,
} from '../constants';
import { useDesktopWindowPortalStackBase } from '../context/DesktopWindowPortalStackContext';
import { useMusicPlaybackDomain } from '../context/MusicPlaybackDomainContext';
import {
	useNowPlayingTime,
	useNowPlayingTransport,
} from '../context/NowPlayingContext';
import { DESKTOP_SHELL_TIMEZONE_OPTIONS } from '../constants/desktopShellTimezoneOptions';
import {
	getDesktopPortalShellProps,
	getFloatingMenuPosition,
} from '../utils/desktopUi';
import { getDesktopWidgetRootClassName } from '../utils/desktopVisualSystem';
import {
	resolveFloatingWidgetViewportPosition,
	type ViewportRect,
} from '../utils/desktopFloatingWidgetPlacement';
import { subscribeDocumentVisibleSync } from '../utils/subscribeDocumentVisibleSync';
import { readDesktopWorkArea } from '../utils/desktopSnapGeometry';
import { fetchDesktopShellStateDeduplicated } from '../services/desktopApi';
import {
	flushShellStatePipelineNow,
	scheduleShellStateMutation,
	waitForShellStatePipelineFlush,
} from '../utils/desktopShellStateMutationPipeline';
import {
	DesktopAppMenuDivider,
	DesktopAppMenuItem,
	DesktopAppMenuSurface,
	DesktopNativeSelect,
	DESKTOP_NATIVE_SELECT_OPTION_CLASSNAME,
} from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { DesktopFloatingPerformanceStrip } from './DesktopFloatingPerformanceStrip';
import {
	ArrowPathIcon,
	ArrowPathRoundedSquareIcon,
	ArrowsRightLeftIcon,
	BellIcon,
	CheckIcon,
	CpuChipIcon,
	UserIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';

export interface DesktopWorkspaceFloatingWidgetProps {
	performance: {
		metrics: {
			fps: number;
			renderTime: number;
			memoryUsage: number;
			windowCount?: number;
		};
		isHighPerformanceMode: boolean;
		preferAggressiveBackgroundSuspend?: boolean;
		recommendations?: string[];
		setPreferAggressiveBackgroundSuspend?: (value: boolean) => void;
	};
	/** При открытых тяжёлых модалках (например Settings) временно приглушаем telemetry-блоки. */
	suspendTelemetry?: boolean;
	/** Во время drag окна снижаем частоту вторичных обновлений виджета. */
	deferRealtimeUpdates?: boolean;
	windowCount: number;
	notifications: {
		unreadCount: number;
		markAllAsRead: () => void;
	};
	/** Open user profile (avatar click in widget) */
	onOpenProfile?: () => void;
	/** Avatar URL from profile API (AuthContext does not have it) */
	avatarUrl?: string | null;
	/** Hide floating widget for current user */
	onHide?: () => void;
	/** Вкладка «Производительность» в центре настройки стола */
	onOpenPerformanceSettings?: () => void;
	/** Открыть центр уведомлений (панель таскбара) */
	onOpenNotificationCenter?: () => void;
	widgetsStyle: DesktopWidgetsStyle;
	/** Desktop config `widget_position` — free placement after first drag or non-seed API values. */
	widgetPosition: { x: number; y: number };
	/** Persist clamped viewport coordinates to desktop config. */
	onWidgetPositionCommit?: (next: { x: number; y: number }) => void;
	/** Viewport bounds of desktop icons; nudge free placement out of this zone. */
	iconReservedViewportBounds?: ViewportRect | null;
}

function floatingWidgetViewportSize() {
	const tb = DESKTOP_LAYOUT.TASKBAR_HEIGHT_PX;
	if (typeof window === 'undefined') {
		const wa = readDesktopWorkArea();
		return {
			width: wa.width,
			height: wa.height + tb,
			taskbarPx: tb,
			pad: 8,
		};
	}
	return {
		width: window.innerWidth,
		height: window.innerHeight,
		taskbarPx: tb,
		pad: 8,
	};
}

function isFwContextMenuBlockedTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return Boolean(
		target.closest('button, a, input, select, textarea, [role="button"], label')
	);
}

/** Изолированная подписка на транспорт + время: остальной виджет не ререндерится на каждый тик. */
const DesktopFloatingWidgetNowPlayingStrip = React.memo(
	function DesktopFloatingWidgetNowPlayingStrip() {
		const { t } = useTranslation('desktopUi');
		const np = useNowPlayingTransport();
		const currentTime = useNowPlayingTime();
		const { hasPrev, hasNext, shuffle, repeat } = useMusicPlaybackDomain();
		if (!np.track) return null;

		return (
			<m.div
				className="group relative mx-2.5 mb-2.5 flex flex-col gap-2.5 overflow-hidden rounded-[1.2rem] border border-(--desktop-border-subtle) px-3 py-2.5 text-left transition-colors"
				style={{
					background:
						'radial-gradient(circle at 0% 0%, rgba(255,255,255,0.08), transparent 32%), radial-gradient(circle at 100% 100%, rgb(var(--desktop-accent-rgb) / 0.14), transparent 46%), color-mix(in srgb, var(--glass-bg) 72%, transparent 28%)',
					boxShadow:
						'0 14px 30px rgba(2, 6, 23, 0.2), 0 0 0 1px rgba(255,255,255,0.03) inset',
				}}
			>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_26%,rgba(2,6,23,0.08)_100%)]"
				/>
				<DesktopChromeTooltip
					content={t('floatingWidgetCtx.openMusicPlayer')}
					placement="top"
					offsetExtra={6}
				>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							window.dispatchEvent(
								new CustomEvent('desktop-open-app', {
									detail: { appComponent: 'MusicPlayer' },
								})
							);
						}}
						className="relative flex items-start gap-3 rounded-2xl p-1 text-left transition-colors hover:bg-[rgb(var(--desktop-fg-primary-rgb)/0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]"
					>
						<AudioTrackMeta
							contentId={np.track.id}
							title={np.track.name}
							titleLabel={t('floatingWidgetCtx.nowPlayingLabel')}
							className="relative min-w-0 w-full flex-1"
							thumbnailClassName="h-10 w-10 rounded-[0.85rem] bg-[color-mix(in_srgb,var(--glass-bg-strong)_88%,rgb(var(--desktop-bg-primary-rgb))_12%)] shadow-[0_10px_22px_rgba(15,23,42,0.38)]"
							thumbnailFallbackIconClassName="h-5 w-5 text-(--desktop-text-muted)"
							titleLabelClassName={DESKTOP_TYPOGRAPHY.labelOverline}
							titleClassName={cn(DESKTOP_TYPOGRAPHY.widgetTrackTitle, 'mt-1')}
							textBlockClassName="relative min-w-0 flex-1"
							titleTooltip="desktop-styled"
						>
							<div
								className={cn(
									DESKTOP_TYPOGRAPHY.meta,
									'mt-0.5 flex items-center justify-between gap-2'
								)}
							>
								<div className="flex min-w-0 items-center gap-2">
									<span className="inline-flex min-w-0 items-center gap-1">
										{np.playing && (
											<span
												className="mr-1 flex items-end gap-[2px] text-[rgb(var(--desktop-accent-rgb)/0.95)]"
												aria-hidden="true"
											>
												<span className="h-2 w-[2px] rounded-full motion-safe:animate-pulse motion-reduce:animate-none bg-[rgb(var(--desktop-accent-rgb))] [animation-delay:0ms]" />
												<span className="h-3 w-[2px] rounded-full motion-safe:animate-pulse motion-reduce:animate-none bg-[rgb(var(--desktop-accent-rgb)/0.75)] [animation-delay:120ms]" />
												<span className="h-1.5 w-[2px] rounded-full motion-safe:animate-pulse motion-reduce:animate-none bg-[rgb(var(--desktop-accent-rgb)/0.55)] [animation-delay:240ms]" />
											</span>
										)}
										<span className="truncate">
											{np.playing
												? t('musicPlayer.nowPlayingBar.transportPlay')
												: t('musicPlayer.nowPlayingBar.transportPause')}
										</span>
									</span>
									<span className="inline-flex items-center gap-1 text-(--desktop-text-dim)">
										{shuffle && <ArrowsRightLeftIcon className="h-3 w-3" />}
										{repeat === 'all' && <ArrowPathIcon className="h-3 w-3" />}
										{repeat === 'one' && (
											<ArrowPathRoundedSquareIcon className="h-3 w-3" />
										)}
									</span>
								</div>
								{np.duration > 0 && (
									<span
										className={cn(
											DESKTOP_TYPOGRAPHY.caption,
											'text-(--desktop-text-dim) tabular-nums'
										)}
									>
										{formatDuration(currentTime)} /{' '}
										{formatDuration(np.duration)}
									</span>
								)}
							</div>
						</AudioTrackMeta>
					</button>
				</DesktopChromeTooltip>
				<div
					className="relative mt-0.5 rounded-[0.95rem] border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1.5 shadow-[0_10px_22px_rgba(15,23,42,0.22)]"
					onPointerDown={(e) => {
						e.stopPropagation();
					}}
				>
					<MiniAudioControls
						compact
						className="w-full"
						playing={np.playing}
						isLoading={np.isLoading}
						isLoadingStalled={np.isLoadingStalled}
						hasPrev={hasPrev}
						hasNext={hasNext}
						onTogglePlayPause={np.togglePlayPause}
						onPrev={np.prev}
						onNext={np.next}
						currentTime={currentTime}
						duration={np.duration}
						bufferedRanges={np.bufferedRanges}
						onSeek={np.seek}
						volume={np.volume}
						onVolumeChange={np.setVolume}
						playbackError={
							np.error ??
							(np.errorTrackId
								? t('settingsPanel.widgetsPanel.playbackError')
								: null)
						}
						onRetryPlayback={() => {
							void np.retryCurrentTrack();
						}}
					/>
				</div>
			</m.div>
		);
	}
);

const DesktopWorkspaceFloatingWidget: React.FC<DesktopWorkspaceFloatingWidgetProps> =
	React.memo(
		({
			performance,
			suspendTelemetry = false,
			deferRealtimeUpdates = false,
			windowCount,
			notifications,
			onOpenProfile,
			avatarUrl,
			onHide,
			onOpenPerformanceSettings,
			onOpenNotificationCenter,
			widgetsStyle,
			widgetPosition,
			onWidgetPositionCommit,
			iconReservedViewportBounds = null,
		}) => {
			const { t, i18n } = useTranslation('desktopUi', {
				keyPrefix: 'floatingWidgetCtx',
			});
			const clockLocale = useMemo(() => {
				const raw = i18n.resolvedLanguage ?? i18n.language ?? 'ru';
				return raw.replace(/_/g, '-');
			}, [i18n.resolvedLanguage, i18n.language]);
			const portalStackBase = useDesktopWindowPortalStackBase();
			const reduceMotion = useReducedMotion();
			const { user } = useAuth();
			const { formattedCredits } = useAvailableCredits();
			const avatarSrc = avatarUrl ?? user?.profile?.avatar_url;
			const userId = user?.id ?? 'anonymous';

			const widgetShellHydratedRef = useRef(false);
			const pendingShellWidgetPatchRef = useRef<{
				timezone?: string;
				quiet_mode?: boolean;
			} | null>(null);
			/** Интервал обновления часов раз в минуту (свёрнутый виджет); чистим при размонтировании / смене режима */
			const clockMinuteIntervalRef = useRef<number | null>(null);

			const [timezone, setTimezone] = useState<string>(() => {
				try {
					return (
						Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow'
					);
				} catch {
					return 'Europe/Moscow';
				}
			});

			const [time, setTime] = useState(new Date());
			const [isExpanded, setIsExpanded] = useState(false);
			const [isQuietMode, setIsQuietMode] = useState<boolean>(false);
			const [fwCtxMenu, setFwCtxMenu] = useState<{
				x: number;
				y: number;
			} | null>(null);
			const fwCtxMenuRef = useRef<HTMLDivElement>(null);

			const closeFwCtxMenu = useCallback(() => setFwCtxMenu(null), []);

			const widgetRootRef = useRef<HTMLDivElement>(null);
			const widgetDragStartRef = useRef<{ x: number; y: number } | null>(null);
			const [widgetDragOffset, setWidgetDragOffset] = useState({
				dx: 0,
				dy: 0,
			});

			const isPresetFloatingLayout = useMemo(() => {
				if (typeof localStorage === 'undefined') return false;
				if (
					localStorage.getItem(STORAGE_KEYS.FLOATING_WIDGET_USER_POSITIONED) ===
					'1'
				) {
					return false;
				}
				return (
					widgetPosition.x === DESKTOP_FLOATING_WIDGET_POSITION_SEED.x &&
					widgetPosition.y === DESKTOP_FLOATING_WIDGET_POSITION_SEED.y
				);
			}, [widgetPosition.x, widgetPosition.y]);

			const widgetRootStyle = useMemo((): CSSProperties => {
				const style: CSSProperties = {};
				if (!isPresetFloatingLayout) {
					style.left = widgetPosition.x;
					style.top = widgetPosition.y;
				}
				if (widgetDragOffset.dx !== 0 || widgetDragOffset.dy !== 0) {
					style.transform = `translate3d(${widgetDragOffset.dx}px, ${widgetDragOffset.dy}px, 0)`;
				}
				return style;
			}, [
				isPresetFloatingLayout,
				widgetPosition.x,
				widgetPosition.y,
				widgetDragOffset.dx,
				widgetDragOffset.dy,
			]);

			const handleWidgetDragPointerDown = useCallback(
				(e: React.PointerEvent) => {
					if (!onWidgetPositionCommit || e.button !== 0) return;
					e.preventDefault();
					e.stopPropagation();
					widgetDragStartRef.current = { x: e.clientX, y: e.clientY };
					widgetRootRef.current?.setPointerCapture(e.pointerId);
				},
				[onWidgetPositionCommit]
			);

			const handleWidgetDragPointerMove = useCallback(
				(e: React.PointerEvent) => {
					if (!widgetDragStartRef.current) return;
					setWidgetDragOffset({
						dx: e.clientX - widgetDragStartRef.current.x,
						dy: e.clientY - widgetDragStartRef.current.y,
					});
				},
				[]
			);

			const cancelWidgetDragVisual = useCallback(() => {
				widgetDragStartRef.current = null;
				setWidgetDragOffset({ dx: 0, dy: 0 });
			}, []);

			const handleWidgetDragPointerUp = useCallback(
				(e: React.PointerEvent) => {
					if (!widgetDragStartRef.current) return;
					const el = widgetRootRef.current;
					widgetDragStartRef.current = null;
					try {
						el?.releasePointerCapture(e.pointerId);
					} catch {
						/* ignore */
					}
					if (!el || !onWidgetPositionCommit) {
						setWidgetDragOffset({ dx: 0, dy: 0 });
						return;
					}
					const r = el.getBoundingClientRect();
					setWidgetDragOffset({ dx: 0, dy: 0 });
					const resolved = resolveFloatingWidgetViewportPosition({
						x: r.left,
						y: r.top,
						widgetWidth: r.width,
						widgetHeight: r.height,
						viewport: floatingWidgetViewportSize(),
						iconReserved: iconReservedViewportBounds,
					});
					try {
						localStorage.setItem(
							STORAGE_KEYS.FLOATING_WIDGET_USER_POSITIONED,
							'1'
						);
					} catch {
						/* ignore */
					}
					onWidgetPositionCommit({
						x: Math.round(resolved.x),
						y: Math.round(resolved.y),
					});
				},
				[iconReservedViewportBounds, onWidgetPositionCommit]
			);

			useLayoutEffect(() => {
				if (
					isPresetFloatingLayout ||
					!onWidgetPositionCommit ||
					widgetDragStartRef.current
				) {
					return;
				}
				const resolved = resolveFloatingWidgetViewportPosition({
					x: widgetPosition.x,
					y: widgetPosition.y,
					viewport: floatingWidgetViewportSize(),
					iconReserved: iconReservedViewportBounds,
				});
				if (
					resolved.x === widgetPosition.x &&
					resolved.y === widgetPosition.y
				) {
					return;
				}
				onWidgetPositionCommit({
					x: Math.round(resolved.x),
					y: Math.round(resolved.y),
				});
			}, [
				iconReservedViewportBounds,
				isPresetFloatingLayout,
				onWidgetPositionCommit,
				widgetPosition.x,
				widgetPosition.y,
			]);

			const handleWidgetDragLostCapture = useCallback(() => {
				if (widgetDragStartRef.current) {
					cancelWidgetDragVisual();
				}
			}, [cancelWidgetDragVisual]);

			/** Развёрнутый виджет дописывает блок вниз — ограничиваем высоту по вьюпорту над таскбаром. */
			// biome-ignore lint/correctness/useExhaustiveDependencies: пересчёт после переноса/драга, не только toggle expanded
			useLayoutEffect(() => {
				const el = widgetRootRef.current;
				if (!el) return;

				const clearSizing = () => {
					el.style.maxHeight = '';
					el.style.overflowY = '';
				};

				const apply = () => {
					if (!isExpanded) {
						clearSizing();
						return;
					}
					const pad = 8;
					const tb = DESKTOP_LAYOUT.TASKBAR_HEIGHT_PX;
					const top = el.getBoundingClientRect().top;
					const roomBelow = window.innerHeight - top - tb - pad;
					const maxH = Math.max(240, Math.floor(roomBelow));
					el.style.maxHeight = `${maxH}px`;
					el.style.overflowY = 'auto';
				};

				apply();
				let nestedRaf = 0;
				const outerRaf = requestAnimationFrame(() => {
					nestedRaf = requestAnimationFrame(apply);
				});
				window.addEventListener('resize', apply);

				return () => {
					cancelAnimationFrame(outerRaf);
					cancelAnimationFrame(nestedRaf);
					window.removeEventListener('resize', apply);
					clearSizing();
				};
			}, [
				isExpanded,
				isPresetFloatingLayout,
				widgetPosition.x,
				widgetPosition.y,
				widgetDragOffset.dx,
				widgetDragOffset.dy,
			]);

			useEffect(() => {
				if (!fwCtxMenu) return;
				const onDoc = (ev: MouseEvent) => {
					if (fwCtxMenuRef.current?.contains(ev.target as Node)) return;
					closeFwCtxMenu();
				};
				const onKey = (ev: KeyboardEvent) => {
					if (ev.key === 'Escape') closeFwCtxMenu();
				};
				document.addEventListener('mousedown', onDoc);
				document.addEventListener('keydown', onKey);
				return () => {
					document.removeEventListener('mousedown', onDoc);
					document.removeEventListener('keydown', onKey);
				};
			}, [fwCtxMenu, closeFwCtxMenu]);

			const scheduleWidgetShellPersist = useCallback(
				(partial: { timezone?: string; quiet_mode?: boolean }) => {
					if (!widgetShellHydratedRef.current) {
						pendingShellWidgetPatchRef.current = {
							...pendingShellWidgetPatchRef.current,
							...partial,
						};
						return;
					}
					scheduleShellStateMutation({
						source: 'chrome',
						merge: () => partial,
					});
					void waitForShellStatePipelineFlush().catch(() => {});
				},
				[]
			);

			const flushPendingWidgetShellPatch = useCallback(() => {
				const p = pendingShellWidgetPatchRef.current;
				pendingShellWidgetPatchRef.current = null;
				if (!p) return;
				const body: { timezone?: string; quiet_mode?: boolean } = {};
				if (p.timezone !== undefined) body.timezone = p.timezone;
				if (p.quiet_mode !== undefined) body.quiet_mode = p.quiet_mode;
				if (Object.keys(body).length === 0) return;
				scheduleShellStateMutation({
					source: 'chrome',
					merge: () => body,
					immediate: true,
				});
				void flushShellStatePipelineNow('chrome').catch(() => {});
			}, []);

			useEffect(() => {
				widgetShellHydratedRef.current = false;
				let cancelled = false;
				void (async () => {
					try {
						const s = await fetchDesktopShellStateDeduplicated();
						if (cancelled) return;
						const toPatch: { timezone?: string; quiet_mode?: boolean } = {};
						if (s.timezone?.trim()) {
							setTimezone(s.timezone.trim());
						} else {
							let leg = '';
							try {
								leg =
									window.localStorage
										.getItem(`desktop_timezone::${userId}`)
										?.trim() ?? '';
							} catch {
								/* ignore */
							}
							if (leg) {
								setTimezone(leg);
								toPatch.timezone = leg;
							}
						}
						if (typeof s.quiet_mode === 'boolean') {
							setIsQuietMode(s.quiet_mode);
						} else {
							let q = false;
							try {
								q =
									window.localStorage.getItem(
										`desktop_quiet_mode::${userId}`
									) === '1';
							} catch {
								/* ignore */
							}
							setIsQuietMode(q);
							if (q) toPatch.quiet_mode = true;
						}
						try {
							window.localStorage.removeItem(`desktop_timezone::${userId}`);
							window.localStorage.removeItem(`desktop_quiet_mode::${userId}`);
						} catch {
							/* ignore */
						}
						if (Object.keys(toPatch).length > 0) {
							scheduleShellStateMutation({
								source: 'chrome',
								merge: () => toPatch,
								immediate: true,
							});
							await flushShellStatePipelineNow('chrome').catch(() => {});
						}
					} catch {
						/* offline: keep browser defaults */
					} finally {
						if (!cancelled) {
							widgetShellHydratedRef.current = true;
							flushPendingWidgetShellPatch();
						}
					}
				})();
				return () => {
					cancelled = true;
				};
			}, [userId, flushPendingWidgetShellPatch]);

			// Часы: в свёрнутом виджете не дергаем React каждую секунду — раз в минуту (с выравниванием
			// к границе минуты). В развёрнутом режиме обновляем раз в секунду, кроме периода drag окна:
			// тогда тоже переходим на 1/min, чтобы уменьшить стейтовый шум.
			useEffect(() => {
				setTime(new Date());
				if (clockMinuteIntervalRef.current) {
					window.clearInterval(clockMinuteIntervalRef.current);
					clockMinuteIntervalRef.current = null;
				}
				if (isExpanded && !deferRealtimeUpdates) {
					const id = window.setInterval(
						() => setTime(new Date()),
						DESKTOP_POLLING.CLOCK_MS
					);
					return () => window.clearInterval(id);
				}
				const now = new Date();
				const msToNextMinute =
					60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
				const timeoutId = window.setTimeout(() => {
					setTime(new Date());
					clockMinuteIntervalRef.current = window.setInterval(
						() => setTime(new Date()),
						60_000
					);
				}, msToNextMinute);
				return () => {
					window.clearTimeout(timeoutId);
					if (clockMinuteIntervalRef.current) {
						window.clearInterval(clockMinuteIntervalRef.current);
						clockMinuteIntervalRef.current = null;
					}
				};
			}, [isExpanded, deferRealtimeUpdates]);

			useEffect(() => {
				return subscribeDocumentVisibleSync(() => setTime(new Date()));
			}, []);

			useEffect(() => {
				if (suspendTelemetry && isExpanded) {
					setIsExpanded(false);
				}
			}, [suspendTelemetry, isExpanded]);

			const {
				metrics,
				isHighPerformanceMode,
				preferAggressiveBackgroundSuspend,
				recommendations,
				setPreferAggressiveBackgroundSuspend,
			} = performance;
			const widgetSectionClassName =
				'rounded-[1.15rem] border border-(--desktop-border-subtle) bg-(--desktop-surface-panel) shadow-(--desktop-shadow-soft)';
			const widgetChipClassName = cn(
				DESKTOP_TYPOGRAPHY.micro,
				'inline-flex items-center rounded-full border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-0.5'
			);
			const widgetCreditsClassName =
				'relative flex w-full items-center justify-center overflow-hidden rounded-[1rem] border border-[rgb(var(--desktop-accent-rgb)/0.22)] bg-[linear-gradient(180deg,rgb(var(--desktop-accent-rgb)/0.2)_0%,rgb(var(--desktop-bg-primary-rgb))_100%)] px-1.5 py-1.5 shadow-[0_14px_32px_rgba(2,6,23,0.24)]';

			const { style: fwPortalShellStyle, theme: fwPortalTheme } =
				getDesktopPortalShellProps();

			const fwCtxMenuPortal =
				fwCtxMenu && typeof document !== 'undefined'
					? createPortal(
							<div
								style={fwPortalShellStyle}
								className={fwPortalTheme === 'dark' ? 'dark' : ''}
							>
								<div
									ref={fwCtxMenuRef}
									role="menu"
									aria-label={t('menuAria')}
									className="fixed text-(--desktop-text-primary)"
									style={{
										...(() => {
											const p = getFloatingMenuPosition(
												{ x: fwCtxMenu.x, y: fwCtxMenu.y },
												{ menuWidth: 260, menuHeight: 280, preferAbove: true }
											);
											return { left: p.x, top: p.y };
										})(),
										zIndex:
											portalStackBase +
											DESKTOP_PORTAL_STACK_BUMP.WORKSPACE_FLOATING_WIDGET_MENU,
									}}
									onPointerDown={(e) => e.stopPropagation()}
								>
									<DesktopAppMenuSurface className="min-w-[220px] ring-1 ring-(--desktop-border-menu)">
										{onHide ? (
											<DesktopAppMenuItem
												type="button"
												icon={
													<XMarkIcon
														className="h-4 w-4"
														strokeWidth={DESKTOP_LUCIDE.stroke}
													/>
												}
												onClick={() => {
													onHide();
													closeFwCtxMenu();
												}}
												className={DESKTOP_INTERACTIVE.focusRing}
											>
												{t('hide')}
											</DesktopAppMenuItem>
										) : null}
										{onOpenProfile ? (
											<DesktopAppMenuItem
												type="button"
												icon={
													<UserIcon
														className="h-4 w-4"
														strokeWidth={DESKTOP_LUCIDE.stroke}
													/>
												}
												onClick={() => {
													onOpenProfile();
													closeFwCtxMenu();
												}}
												className={DESKTOP_INTERACTIVE.focusRing}
											>
												{t('profile')}
											</DesktopAppMenuItem>
										) : null}
										{onOpenNotificationCenter ? (
											<DesktopAppMenuItem
												type="button"
												icon={
													<BellIcon
														className="h-4 w-4"
														strokeWidth={DESKTOP_LUCIDE.stroke}
													/>
												}
												onClick={() => {
													onOpenNotificationCenter();
													closeFwCtxMenu();
												}}
												className={DESKTOP_INTERACTIVE.focusRing}
											>
												{t('notifications')}
											</DesktopAppMenuItem>
										) : null}
										<DesktopAppMenuItem
											type="button"
											icon={
												<CheckIcon
													className="h-4 w-4"
													strokeWidth={DESKTOP_LUCIDE.stroke}
												/>
											}
											onClick={() => {
												notifications.markAllAsRead();
												closeFwCtxMenu();
											}}
											className={DESKTOP_INTERACTIVE.focusRing}
										>
											{t('markAllRead')}
										</DesktopAppMenuItem>
										{onOpenPerformanceSettings ? (
											<>
												<DesktopAppMenuDivider />
												<DesktopAppMenuItem
													type="button"
													icon={
														<CpuChipIcon
															className="h-4 w-4"
															strokeWidth={DESKTOP_LUCIDE.stroke}
														/>
													}
													onClick={() => {
														onOpenPerformanceSettings();
														closeFwCtxMenu();
													}}
													className={DESKTOP_INTERACTIVE.focusRing}
												>
													{t('performance')}
												</DesktopAppMenuItem>
											</>
										) : null}
									</DesktopAppMenuSurface>
								</div>
							</div>,
							document.body
						)
					: null;

			return (
				<>
					<m.div
						ref={widgetRootRef}
						style={widgetRootStyle}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{
							duration: reduceMotion ? 0 : 0.22,
						}}
						className={getDesktopWidgetRootClassName(
							widgetsStyle,
							isPresetFloatingLayout ? 'preset-corner' : 'free'
						)}
						onPointerMove={handleWidgetDragPointerMove}
						onPointerUp={handleWidgetDragPointerUp}
						onPointerCancel={handleWidgetDragPointerUp}
						onLostPointerCapture={handleWidgetDragLostCapture}
						onContextMenu={(e) => {
							if (isFwContextMenuBlockedTarget(e.target)) return;
							e.preventDefault();
							e.stopPropagation();
							setFwCtxMenu({ x: e.clientX, y: e.clientY });
						}}
					>
						{onWidgetPositionCommit ? (
							<DesktopChromeTooltip
								content={t('dragMove')}
								placement="top"
								offsetExtra={6}
							>
								<button
									type="button"
									onPointerDown={handleWidgetDragPointerDown}
									className={cn(
										'absolute left-2 right-10 top-0 z-12 h-2 touch-none cursor-grab rounded-b border-0 bg-transparent p-0',
										'active:cursor-grabbing',
										DESKTOP_INTERACTIVE.focusRing
									)}
									aria-label={t('dragMove')}
								/>
							</DesktopChromeTooltip>
						) : null}
						<div
							aria-hidden="true"
							className="pointer-events-none absolute inset-0"
						>
							<div className="absolute inset-x-0 top-0 h-px bg-[rgb(var(--desktop-fg-primary-rgb)/0.1)]" />
							<div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent_22%,rgb(var(--desktop-bg-primary-rgb)/0.06)_100%)]" />
							<div className="absolute -right-8 top-6 h-24 w-24 rounded-full bg-[rgb(var(--desktop-accent-rgb)/0.16)] blur-3xl" />
						</div>
						{onHide && (
							<DesktopChromeTooltip
								content={t('hide')}
								placement="left"
								offsetExtra={6}
							>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onHide();
									}}
									className="absolute right-2.5 top-2.5 z-10 rounded-full border border-(--desktop-border-subtle) bg-(--desktop-surface-panel) p-1 text-(--desktop-text-muted) opacity-0 pointer-events-none transition-[opacity,background-color,color] duration-150 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto hover:bg-(--desktop-surface-soft-hover) hover:text-(--desktop-text-primary)"
									aria-label={t('hide')}
								>
									<XMarkIcon className="w-3.5 h-3.5" />
								</button>
							</DesktopChromeTooltip>
						)}
						<div className="relative flex items-start gap-2.5 p-3 pb-2.5">
							<div className="flex shrink-0 flex-col items-center gap-1.5">
								<div
									className={`${widgetSectionClassName} flex w-full items-center justify-center px-1.5 py-1`}
								>
									<AuthStatusIndicator mode="nav" isCollapsed className="" />
								</div>
								<div className={widgetCreditsClassName}>
									<div
										aria-hidden="true"
										className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgb(var(--desktop-accent-rgb)/0.22),transparent_58%)]"
									/>
									<div
										aria-hidden="true"
										className="pointer-events-none absolute inset-x-2 top-0 h-px bg-[rgb(var(--desktop-fg-primary-rgb)/0.12)]"
									/>
									<span
										className={cn(
											DESKTOP_TYPOGRAPHY.widgetKpi,
											'relative block text-center drop-shadow-[0_6px_16px_rgb(var(--desktop-accent-rgb)/0.35)]'
										)}
									>
										{formattedCredits}
									</span>
								</div>
								{onOpenProfile ? (
									<div className="flex shrink-0 flex-col items-center gap-1.5">
										<DesktopChromeTooltip
											content={t('profileTooltip')}
											placement="left"
											offsetExtra={6}
										>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													onOpenProfile();
												}}
												className="flex h-13 w-13 shrink-0 items-center justify-center overflow-hidden rounded-[1.05rem] border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--glass-bg-strong)_84%,transparent_16%)] shadow-[0_12px_24px_rgba(2,6,23,0.24)] transition-colors hover:bg-(--desktop-surface-soft-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb))]"
												aria-label={t('profileSettingsAria')}
											>
												<SecureAvatar
													avatarUrl={avatarSrc ?? null}
													className="h-full w-full object-cover"
													alt=""
												/>
											</button>
										</DesktopChromeTooltip>
									</div>
								) : null}
							</div>
							<div className="flex-1 min-w-0">
								<div className="flex items-start gap-2">
									{isExpanded ? (
										<button
											type="button"
											className="flex-1 min-w-0 rounded-[1.1rem] p-1.5 text-left transition-colors hover:bg-[rgb(var(--desktop-fg-primary-rgb)/0.05)]"
											onClick={() => setIsExpanded(false)}
											aria-expanded="true"
										>
											<div className={DESKTOP_TYPOGRAPHY.widgetClock}>
												{time.toLocaleTimeString(clockLocale, {
													hour: '2-digit',
													minute: '2-digit',
													timeZone: timezone,
												})}
											</div>
											<div
												className={cn(DESKTOP_TYPOGRAPHY.widgetDate, 'mt-1')}
											>
												{time.toLocaleDateString(clockLocale, {
													weekday: 'long',
													day: 'numeric',
													month: 'long',
													timeZone: timezone,
												})}
											</div>
											<div className={`mt-2.5 ${widgetSectionClassName} p-2.5`}>
												<label
													className={`mb-1 block ${DESKTOP_TYPOGRAPHY.caption} uppercase tracking-wide`}
													htmlFor="desktop-widget-timezone"
												>
													{t('timezoneLabel')}
												</label>
												<DesktopNativeSelect
													id="desktop-widget-timezone"
													onClick={(e) => e.stopPropagation()}
													value={timezone}
													onChange={(e) => {
														const v = e.target.value;
														setTimezone(v);
														scheduleWidgetShellPersist({ timezone: v });
													}}
													className={cn(
														DESKTOP_TYPOGRAPHY.caption,
														'w-full min-w-0 rounded-[0.9rem] leading-snug'
													)}
												>
													{DESKTOP_SHELL_TIMEZONE_OPTIONS.map((option) => (
														<option
															key={option.value}
															className={DESKTOP_NATIVE_SELECT_OPTION_CLASSNAME}
															value={option.value}
														>
															{option.label}
														</option>
													))}
												</DesktopNativeSelect>
											</div>
											<div className="mt-2.5 flex flex-wrap gap-1.5">
												<span className={widgetChipClassName}>
													{t('windowsOpen', { count: windowCount })}
												</span>
												<span className={widgetChipClassName}>
													{t('newNotifications', {
														count: notifications.unreadCount,
													})}
												</span>
												<span className={widgetChipClassName}>
													{isHighPerformanceMode
														? t('performanceModeHigh')
														: t('performanceModeBalanced')}
												</span>
											</div>
										</button>
									) : (
										<button
											type="button"
											className="flex-1 min-w-0 rounded-[1.1rem] p-1.5 text-left transition-colors hover:bg-[rgb(var(--desktop-fg-primary-rgb)/0.05)]"
											onClick={() => setIsExpanded(true)}
											aria-expanded="false"
										>
											<div className={DESKTOP_TYPOGRAPHY.widgetClock}>
												{time.toLocaleTimeString(clockLocale, {
													hour: '2-digit',
													minute: '2-digit',
													timeZone: timezone,
												})}
											</div>
											<div
												className={cn(DESKTOP_TYPOGRAPHY.widgetDate, 'mt-1')}
											>
												{time.toLocaleDateString(clockLocale, {
													weekday: 'long',
													day: 'numeric',
													month: 'long',
													timeZone: timezone,
												})}
											</div>
											<div className={`mt-2.5 ${widgetSectionClassName} p-2.5`}>
												<label
													className={`mb-1 block ${DESKTOP_TYPOGRAPHY.caption} uppercase tracking-wide`}
													htmlFor="desktop-widget-timezone"
												>
													{t('timezoneLabel')}
												</label>
												<DesktopNativeSelect
													id="desktop-widget-timezone"
													onClick={(e) => e.stopPropagation()}
													value={timezone}
													onChange={(e) => {
														const v = e.target.value;
														setTimezone(v);
														scheduleWidgetShellPersist({ timezone: v });
													}}
													className={cn(
														DESKTOP_TYPOGRAPHY.caption,
														'w-full min-w-0 rounded-[0.9rem] leading-snug'
													)}
												>
													{DESKTOP_SHELL_TIMEZONE_OPTIONS.map((option) => (
														<option
															key={option.value}
															className={DESKTOP_NATIVE_SELECT_OPTION_CLASSNAME}
															value={option.value}
														>
															{option.label}
														</option>
													))}
												</DesktopNativeSelect>
											</div>
											<div className="mt-2.5 flex flex-wrap gap-1.5">
												<span className={widgetChipClassName}>
													{t('windowsOpen', { count: windowCount })}
												</span>
												<span className={widgetChipClassName}>
													{t('newNotifications', {
														count: notifications.unreadCount,
													})}
												</span>
												<span className={widgetChipClassName}>
													{isHighPerformanceMode
														? t('performanceModeHigh')
														: t('performanceModeBalanced')}
												</span>
											</div>
										</button>
									)}
								</div>
							</div>
						</div>

						<DesktopFloatingWidgetNowPlayingStrip />

						<AnimatePresence>
							{isExpanded && (
								<m.div
									initial={{ height: 0, opacity: 0 }}
									animate={{ height: 'auto', opacity: 1 }}
									exit={{ height: 0, opacity: 0 }}
									className="border-t border-(--desktop-border-subtle) bg-[linear-gradient(180deg,rgb(var(--desktop-bg-primary-rgb)/0.04),rgb(var(--desktop-bg-primary-rgb)/0.1))]"
								>
									{!suspendTelemetry ? (
										<div className="px-2.5 pt-2.5">
											<div className={`${widgetSectionClassName} p-1.5`}>
												<DesktopFloatingPerformanceStrip
													data={{
														fps: metrics?.fps ?? 0,
														memoryUsage: metrics?.memoryUsage ?? 0,
														windowCount,
														renderTime: metrics?.renderTime ?? 0,
													}}
													isHighPerformanceMode={isHighPerformanceMode}
													preferAggressiveBackgroundSuspend={
														preferAggressiveBackgroundSuspend ?? false
													}
													recommendations={recommendations ?? []}
													onToggleAggressiveBackground={() => {
														if (setPreferAggressiveBackgroundSuspend) {
															setPreferAggressiveBackgroundSuspend(
																!preferAggressiveBackgroundSuspend
															);
														}
													}}
													className="mt-0"
												/>
											</div>
										</div>
									) : (
										<section
											className={`mx-2.5 mt-2.5 p-3 ${widgetSectionClassName}`}
											aria-label={t('telemetryPausedAria')}
										>
											<p className="text-xs text-(--desktop-text-dim)">
												{t('telemetryPausedBody')}
											</p>
										</section>
									)}

									<div
										className={`mx-2.5 my-2.5 p-2.5 space-y-2 ${widgetSectionClassName}`}
									>
										<div className="flex items-center justify-between gap-2 pt-1">
											<div
												className={cn(
													DESKTOP_TYPOGRAPHY.caption,
													'flex items-center gap-2 text-(--desktop-text-secondary)'
												)}
											>
												<BellIcon className="w-3 h-3 text-(--desktop-text-secondary)" />
												<span>
													{t('notificationsHeading', {
														count: notifications.unreadCount,
													})}
												</span>
											</div>
											<div className="flex items-center gap-2">
												<button
													type="button"
													onClick={() =>
														setIsQuietMode((prev) => {
															const next = !prev;
															scheduleWidgetShellPersist({ quiet_mode: next });
															return next;
														})
													}
													className={cn(
														DESKTOP_TYPOGRAPHY.caption,
														'px-2 py-1 rounded-lg',
														isQuietMode
															? 'bg-(--desktop-surface-soft-active) text-(--desktop-text-primary)'
															: 'bg-(--desktop-surface-soft) text-(--desktop-text-secondary)'
													)}
												>
													{isQuietMode ? t('quietMode') : t('normalMode')}
												</button>
												{notifications.unreadCount > 0 && (
													<m.button
														type="button"
														onClick={notifications.markAllAsRead}
														className={cn(
															DESKTOP_TYPOGRAPHY.caption,
															'px-2 py-1 rounded-lg bg-(--desktop-surface-soft) hover:bg-(--desktop-surface-soft-hover) text-(--desktop-text-secondary)'
														)}
														whileHover={
															reduceMotion ? undefined : { scale: 1.05 }
														}
														whileTap={
															reduceMotion ? undefined : { scale: 0.95 }
														}
													>
														{t('clearNotifications')}
													</m.button>
												)}
											</div>
										</div>
									</div>
								</m.div>
							)}
						</AnimatePresence>
					</m.div>
					{fwCtxMenuPortal}
				</>
			);
		}
	);

DesktopWorkspaceFloatingWidget.displayName = 'DesktopWorkspaceFloatingWidget';

export { DesktopWorkspaceFloatingWidget };
