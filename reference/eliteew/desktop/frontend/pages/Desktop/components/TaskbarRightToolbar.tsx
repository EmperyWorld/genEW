/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Правая зона таскбара: шорткаты (или secondary overflow в compact), состояние
 * сессии/устройства, GAF/трей, уведомления, громкость, часы и «показать рабочий стол».
 *
 * Invariants:
 * - memo: при наведении на кнопки окон слева пропсы здесь не меняются — блок не перерисовывается.
 * - Session/device button открывает единый floating panel, а не отдельный popover.
 * - Compact: tour + shortcuts → TaskbarSecondaryOverflow; volume = fieldset + mute + range.
 *
 * Related:
 * - components/SessionDeviceTrayButton.tsx
 * - components/TaskbarTrayGafCluster.tsx
 * - components/TaskbarSecondaryOverflow.tsx
 */

import { GuideTourLaunchButton } from '@/components/guided-tour/GuideTourLaunchButton';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { themeDesignTokens } from '@/theme/designTokens';
import { cn } from '@/utils/cn';
import { AnimatePresence, m } from 'framer-motion';
import {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type RefObject,
	type WheelEvent as ReactWheelEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import type { DesktopIconStyle, DesktopWindowStyle } from '@/types/profile';
import { DESKTOP_LUCIDE, DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { useDesktopWindowPortalStackBase } from '@/pages/Desktop/context/DesktopWindowPortalStackContext';
import { useFinePointerHover } from '../hooks/useFinePointerHover';
import { useDesktopPopoverOpenGuard } from '../hooks/useDesktopPopoverOpenGuard';
import { FavoriteHexIcon } from '../../MusicPlayer/MusicPlayerFavoriteHex';
import { NowPlayingLoadHint } from '@/components/Audio/NowPlayingLoadHint';
import { useMusicLibraryContext } from '../context/MusicLibraryContext';
import { useMusicPlaybackDomain } from '../context/MusicPlaybackDomainContext';
import { useNowPlayingTransport } from '../context/NowPlayingContext';
import type { DesktopItem } from '../types/desktop.types';
import { getFloatingMenuPosition } from '../utils/desktopUi';
import { shouldCloseVolumeMenuOnOutsidePointer } from '../utils/desktopShellOutsideDismiss';
import { DesktopShellFloatingPortal } from './DesktopShellFloatingPortal';
import {
	DesktopAppButton,
	DesktopAppMenuDivider,
	DesktopAppMenuItem,
	DesktopAppMenuSurface,
} from './DesktopAppChrome';
import { TaskbarClock, type TaskbarClockHandle } from './TaskbarClock';
import {
	TaskbarIconContextMenu,
	type TaskbarIconContextMenuPoint,
} from './TaskbarIconContextMenu';
import { TaskbarNotificationCluster } from './TaskbarNotificationCluster';
import { SessionDeviceTrayButton } from './SessionDeviceTrayButton';
import { DesktopTaskbarRecoveryChip } from './DesktopTaskbarRecoveryChip';
import { TaskbarSecondaryOverflow } from './TaskbarSecondaryOverflow';
import { TaskbarTrayGafCluster } from './TaskbarTrayGafCluster';
import {
	ArrowDownTrayIcon,
	BackwardIcon,
	ComputerDesktopIcon,
	ForwardIcon,
	PauseIcon,
	PlayIcon,
	SpeakerWaveIcon,
	SpeakerXMarkIcon,
} from '@heroicons/react/24/outline';

function clampVolume(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function swallowWheelEvent(event: ReactWheelEvent<HTMLElement>): void {
	if (event.cancelable) {
		event.preventDefault();
	}
	event.stopPropagation();
}

const VOLUME_WHEEL_STEP = 0.04;
const VOLUME_CUE_MIN_INTERVAL_MS = 70;

/** Таскбар: тот же паттерн трека/ползунка, что компактный слайдер в `VolumeControl`. */
const TASKBAR_VOLUME_RANGE_CLASS = cn(
	'h-1.5 min-h-0 w-full min-w-20 max-w-28 shrink-0 cursor-pointer appearance-none rounded-full accent-[rgb(var(--desktop-accent-rgb))]',
	'focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-(--desktop-surface-app)',
	'bg-(--desktop-border-subtle)',
	'[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[color-mix(in_srgb,var(--desktop-border-subtle)_82%,var(--desktop-text-muted)_18%)]',
	'[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[color-mix(in_srgb,var(--desktop-border-subtle)_82%,var(--desktop-text-muted)_18%)]',
	'[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-(--desktop-surface-app) [&::-webkit-slider-thumb]:bg-[rgb(var(--desktop-accent-rgb))] [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgb(var(--desktop-accent-rgb)/0.45),0_1px_4px_rgb(0_0_0/0.35)]',
	'[&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-(--desktop-surface-app) [&::-moz-range-thumb]:bg-[rgb(var(--desktop-accent-rgb))] [&::-moz-range-thumb]:shadow-[0_0_0_1px_rgb(var(--desktop-accent-rgb)/0.45),0_1px_4px_rgb(0_0_0/0.35)]'
);

export type TaskbarRightToolbarProps = {
	/** Compact/mobile taskbar — tour button stays icon-only. */
	compact?: boolean;
	onShowShortcuts?: () => void;
	onOpenDesktopWelcomeTour?: () => void;
	onOpenSessionInfo?: () => void;
	taskbarButtonSurface: string;
	taskbarButtonActiveSurface: string;
	reduceMotion: boolean | null;
	showTray: boolean;
	onToggleTray: () => void;
	onCloseTray: () => void;
	apps: DesktopItem[];
	onOpenApp: (app: DesktopItem) => void;
	minimizedPersistentSurfaceApps?: ReadonlySet<string>;
	shellPanelStrong: string;
	shellPanel: string;
	iconStyle: DesktopIconStyle;
	shellWindowStyle: DesktopWindowStyle;
	showNotifications: boolean;
	onNotificationBellClick: () => void;
	onCloseNotificationPanel: () => void;
	clockRef: RefObject<TaskbarClockHandle | null>;
};

export const TaskbarRightToolbar = memo(function TaskbarRightToolbar({
	compact = false,
	onShowShortcuts,
	onOpenDesktopWelcomeTour,
	onOpenSessionInfo,
	taskbarButtonSurface,
	taskbarButtonActiveSurface,
	reduceMotion,
	showTray,
	onToggleTray,
	onCloseTray,
	apps,
	onOpenApp,
	minimizedPersistentSurfaceApps,
	shellPanelStrong,
	shellPanel,
	iconStyle,
	shellWindowStyle,
	showNotifications,
	onNotificationBellClick,
	onCloseNotificationPanel,
	clockRef,
}: TaskbarRightToolbarProps) {
	const { t } = useTranslation('desktopUi');
	const portalStackBase = useDesktopWindowPortalStackBase();
	const { taskbar } = themeDesignTokens.desktop;
	const finePointerHover = useFinePointerHover();
	const { user: currentUser } = useAuth();
	const {
		track,
		playing,
		isLoading,
		isLoadingStalled,
		error: playbackError,
		errorTrackId,
		retryCurrentTrack,
		volume,
		setVolume,
		togglePlayPause,
		next,
		prev,
	} = useNowPlayingTransport();
	const { hasPrev, hasNext } = useMusicPlaybackDomain();
	const { favoriteIdsSet, toggleFavorite } = useMusicLibraryContext();
	const volumePercent = Math.round(volume * 100);
	const VolumeIcon =
		volume === 0
			? SpeakerXMarkIcon
			: volume < 0.55
				? SpeakerWaveIcon
				: SpeakerWaveIcon;
	const isFavoriteTrack = track ? favoriteIdsSet.has(track.id) : false;
	const [volumeMenu, setVolumeMenu] = useState<{ x: number; y: number } | null>(
		null
	);
	const [toolbarContextMenu, setToolbarContextMenu] = useState<{
		kind: 'shortcuts' | 'show-desktop';
		point: TaskbarIconContextMenuPoint;
	} | null>(null);
	const volumeMenuOpenClickGuardRef = useDesktopPopoverOpenGuard(
		volumeMenu !== null
	);
	const volumeRef = useRef(volume);
	const lastNonZeroVolumeRef = useRef(volume > 0 ? volume : 0.7);
	const audioCueContextRef = useRef<AudioContext | null>(null);
	const audioCueLastAtRef = useRef(0);

	useEffect(() => {
		volumeRef.current = volume;
		if (volume > 0.001) {
			lastNonZeroVolumeRef.current = volume;
		}
	}, [volume]);

	useEffect(() => {
		return () => {
			if (audioCueContextRef.current) {
				void audioCueContextRef.current.close().catch(() => {});
				audioCueContextRef.current = null;
			}
		};
	}, []);

	const playVolumeStepCue = useCallback((level: number) => {
		if (typeof window === 'undefined') return;
		const now = performance.now();
		if (now - audioCueLastAtRef.current < VOLUME_CUE_MIN_INTERVAL_MS) return;
		audioCueLastAtRef.current = now;
		const AudioContextCtor =
			window.AudioContext ||
			(
				window as Window & {
					webkitAudioContext?: typeof AudioContext;
				}
			).webkitAudioContext;
		if (!AudioContextCtor) return;
		if (!audioCueContextRef.current) {
			audioCueContextRef.current = new AudioContextCtor();
		}
		const ctx = audioCueContextRef.current;
		if (ctx.state === 'suspended') {
			void ctx.resume().catch(() => {});
		}
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		const startedAt = ctx.currentTime;
		const duration = 0.032;
		const normalizedLevel = clampVolume(level);
		const frequency = 180 + normalizedLevel * 1240;
		const peakGain = 0.026 + normalizedLevel * 0.074;
		osc.type = 'sine';
		osc.frequency.setValueAtTime(frequency, startedAt);
		gain.gain.setValueAtTime(0.0001, startedAt);
		gain.gain.linearRampToValueAtTime(peakGain, startedAt + 0.004);
		gain.gain.exponentialRampToValueAtTime(
			Math.max(0.003, peakGain * 0.24),
			startedAt + duration * 0.55
		);
		gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + duration);
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start(startedAt);
		osc.stop(startedAt + duration + 0.01);
	}, []);

	const applyVolume = useCallback(
		(nextVolume: number, withCue = false) => {
			const safe = clampVolume(nextVolume);
			volumeRef.current = safe;
			if (safe > 0.001) {
				lastNonZeroVolumeRef.current = safe;
			}
			setVolume(safe);
			if (withCue) {
				playVolumeStepCue(safe);
			}
		},
		[playVolumeStepCue, setVolume]
	);

	const adjustVolumeByWheel = useCallback(
		(delta: number) => {
			applyVolume(volumeRef.current + delta, true);
		},
		[applyVolume]
	);

	const toggleMute = useCallback(() => {
		if (volumeRef.current <= 0.001) {
			applyVolume(
				lastNonZeroVolumeRef.current > 0 ? lastNonZeroVolumeRef.current : 0.7
			);
			return;
		}
		applyVolume(0);
	}, [applyVolume]);

	const openVolumeMenu = useCallback((x: number, y: number) => {
		setVolumeMenu({ x, y });
	}, []);

	const closeVolumeMenu = useCallback(() => {
		setVolumeMenu(null);
	}, []);

	const closeToolbarContextMenu = useCallback(() => {
		setToolbarContextMenu(null);
	}, []);

	const dispatchShowDesktop = useCallback(() => {
		window.dispatchEvent(new CustomEvent('desktop-show-desktop'));
	}, []);

	const volumeMenuPos = useMemo(() => {
		if (!volumeMenu) return null;
		return getFloatingMenuPosition(
			{ x: volumeMenu.x, y: volumeMenu.y },
			{
				menuWidth: 272,
				menuHeight: track ? 190 : 138,
				preferAbove: true,
				anchorGap: 12,
			}
		);
	}, [track, volumeMenu]);

	useEffect(() => {
		if (!volumeMenu) return;
		const onWindowPointerDown = (event: MouseEvent | PointerEvent) => {
			if (
				!shouldCloseVolumeMenuOnOutsidePointer({
					openClickGuardActive: volumeMenuOpenClickGuardRef.current,
					target: event.target as Element,
				})
			) {
				return;
			}
			setVolumeMenu(null);
		};
		window.addEventListener('mousedown', onWindowPointerDown, {
			capture: true,
		});
		window.addEventListener('pointerdown', onWindowPointerDown, {
			capture: true,
		});
		return () => {
			window.removeEventListener('mousedown', onWindowPointerDown, {
				capture: true,
			});
			window.removeEventListener('pointerdown', onWindowPointerDown, {
				capture: true,
			});
		};
	}, [volumeMenu, volumeMenuOpenClickGuardRef]);

	useEffect(() => {
		if (!volumeMenu) return;
		const onEsc = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setVolumeMenu(null);
			}
		};
		window.addEventListener('keydown', onEsc);
		return () => window.removeEventListener('keydown', onEsc);
	}, [volumeMenu]);

	const useSecondaryOverflow =
		compact && Boolean(onOpenDesktopWelcomeTour || onShowShortcuts);

	return (
		<div className={`flex shrink-0 items-center self-stretch ${taskbar.GAP}`}>
			{useSecondaryOverflow ? (
				<TaskbarSecondaryOverflow
					onOpenDesktopWelcomeTour={onOpenDesktopWelcomeTour}
					onShowShortcuts={onShowShortcuts}
					taskbarButtonSurface={taskbarButtonSurface}
					reduceMotion={reduceMotion}
				/>
			) : (
				<>
					{onOpenDesktopWelcomeTour ? (
						<DesktopChromeTooltip
							content={t('titleBarChrome.guideTour')}
							placement="top"
							offsetExtra={12}
						>
							<div data-desktop-welcome-guide="taskbar-tour-launch">
								<GuideTourLaunchButton
									compact={compact}
									showLabel={!compact}
									label={t('titleBarChrome.guideTour')}
									onClick={onOpenDesktopWelcomeTour}
									ariaLabel={t('titleBarChrome.guideTour')}
									className={`${taskbar.HIT_MIN_CLASS} rounded-lg border-0 bg-transparent p-1.5 shadow-none ${taskbarButtonSurface}`}
								/>
							</div>
						</DesktopChromeTooltip>
					) : null}
					{onShowShortcuts ? (
						<DesktopChromeTooltip
							content={t('taskbar.shortcutsTooltip')}
							placement="top"
							offsetExtra={12}
						>
							<m.button
								data-taskbar-interactive="true"
								data-desktop-welcome-guide="shortcuts"
								type="button"
								onClick={() => onShowShortcuts()}
								onContextMenu={(event) => {
									event.preventDefault();
									event.stopPropagation();
									setToolbarContextMenu({
										kind: 'shortcuts',
										point: { x: event.clientX, y: event.clientY },
									});
								}}
								className={`${taskbar.HIT_MIN_CLASS} p-1.5 rounded-lg ${taskbar.ICON_FOCUS} ${taskbarButtonSurface}`}
								aria-label={t('taskbar.shortcutsAria')}
								whileHover={
									finePointerHover && !reduceMotion
										? { scale: 1.02 }
										: undefined
								}
							>
								<ComputerDesktopIcon
									className={taskbar.ICON_CLASS}
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							</m.button>
						</DesktopChromeTooltip>
					) : null}
				</>
			)}

			<DesktopTaskbarRecoveryChip />

			<SessionDeviceTrayButton
				onOpenSessionInfo={onOpenSessionInfo}
				taskbarButtonSurface={taskbarButtonSurface}
				taskbarButtonActiveSurface={taskbarButtonActiveSurface}
				reduceMotion={reduceMotion}
			/>

			<TaskbarTrayGafCluster
				showTray={showTray}
				onToggleTray={onToggleTray}
				onCloseTray={onCloseTray}
				apps={apps}
				onOpenApp={onOpenApp}
				minimizedPersistentSurfaceApps={minimizedPersistentSurfaceApps}
				hasCurrentUser={!!currentUser}
				shellPanelStrong={shellPanelStrong}
				iconStyle={iconStyle}
				taskbarButtonSurface={taskbarButtonSurface}
				taskbarButtonActiveSurface={taskbarButtonActiveSurface}
				reduceMotion={reduceMotion}
			/>

			<TaskbarNotificationCluster
				showNotifications={showNotifications}
				onBellClick={onNotificationBellClick}
				onClosePanel={onCloseNotificationPanel}
				shellWindowStyle={shellWindowStyle}
				taskbarButtonSurface={taskbarButtonSurface}
				taskbarButtonActiveSurface={taskbarButtonActiveSurface}
				reduceMotion={reduceMotion}
			/>

			<DesktopChromeTooltip
				content={`${t('taskbar.taskbarVolumeLabel')}: ${volumePercent}% · ${t('taskbar.taskbarVolumeWheelHint')} · ${t('taskbar.taskbarVolumeLeftClickHint')} · ${t('taskbar.taskbarVolumeContextHint')}`}
				placement="top"
				offsetExtra={12}
			>
				<fieldset
					data-taskbar-interactive="true"
					data-volume-mini-popup
					className={cn(
						'm-0 flex h-8 min-w-[148px] max-w-[200px] items-center gap-1.5 rounded-lg border-0 p-0 px-2',
						taskbar.ICON_FOCUS,
						taskbarButtonSurface
					)}
					onWheel={(e) => {
						swallowWheelEvent(e);
						const delta = e.deltaY > 0 ? -VOLUME_WHEEL_STEP : VOLUME_WHEEL_STEP;
						adjustVolumeByWheel(delta);
					}}
					onContextMenu={(e) => {
						e.preventDefault();
						e.stopPropagation();
						openVolumeMenu(e.clientX, e.clientY);
					}}
				>
					<legend className="sr-only">
						{t('taskbar.taskbarVolumeAria', { volume: volumePercent })}
					</legend>
					<button
						type="button"
						className={cn(
							'inline-flex shrink-0 items-center justify-center rounded-md p-1',
							'text-(--desktop-text-secondary) hover:text-(--desktop-text-primary)',
							'focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
						)}
						aria-label={
							volume <= 0
								? t('taskbar.taskbarVolumeUnmuteAria', {
										defaultValue: t('taskbar.taskbarVolumeLabel'),
									})
								: t('taskbar.taskbarVolumeMuteAria', {
										defaultValue: t('taskbar.taskbarVolumeLabel'),
									})
						}
						onClick={(e) => {
							e.stopPropagation();
							toggleMute();
						}}
					>
						<VolumeIcon
							className="h-4 w-4 shrink-0"
							strokeWidth={DESKTOP_LUCIDE.stroke}
							aria-hidden
						/>
					</button>
					<input
						type="range"
						min={0}
						max={1}
						step={0.01}
						value={volume}
						onChange={(e) => applyVolume(Number(e.target.value))}
						onWheel={(e) => {
							swallowWheelEvent(e);
							const delta =
								e.deltaY > 0 ? -VOLUME_WHEEL_STEP : VOLUME_WHEEL_STEP;
							adjustVolumeByWheel(delta);
						}}
						className={TASKBAR_VOLUME_RANGE_CLASS}
						aria-label={t('taskbar.taskbarVolumeAria', {
							volume: volumePercent,
						})}
						aria-valuetext={`${volumePercent}%`}
					/>
					<span
						className={cn(
							DESKTOP_TYPOGRAPHY.captionInherit,
							'w-9 shrink-0 text-right tabular-nums text-(--desktop-text-secondary)'
						)}
						aria-hidden
					>
						{volumePercent}%
					</span>
				</fieldset>
			</DesktopChromeTooltip>
			<DesktopShellFloatingPortal>
				<AnimatePresence>
					{volumeMenu && volumeMenuPos ? (
						<m.div
							key="taskbar-volume-menu"
							initial={{ opacity: 0, scale: 0.96, y: 4 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.96, y: 4 }}
							transition={{ duration: 0.12 }}
							className="fixed"
							style={{
								zIndex: portalStackBase,
								left: volumeMenuPos.x,
								top: volumeMenuPos.y,
							}}
							data-volume-mini-popup
							onClick={(e) => e.stopPropagation()}
							onMouseDown={(e) => e.stopPropagation()}
						>
							<DesktopAppMenuSurface className="w-[272px] p-2.5">
								<div className="mb-2 flex items-center justify-between gap-2">
									<p
										className={cn(
											DESKTOP_TYPOGRAPHY.widgetTrackTitle,
											'truncate'
										)}
									>
										{track?.name ?? t('taskbar.volumeMenuNoTrack')}
									</p>
									<DesktopAppButton
										type="button"
										size="sm"
										variant={isFavoriteTrack ? 'accent' : 'ghost'}
										className="shrink-0 gap-1.5 px-2"
										disabled={!track}
										onClick={() => {
											if (!track) return;
											toggleFavorite(track.id);
										}}
									>
										<FavoriteHexIcon
											className="h-4 w-4"
											filled={isFavoriteTrack}
										/>
										<span
											className={cn(
												DESKTOP_TYPOGRAPHY.captionInherit,
												'text-(--desktop-text-primary)'
											)}
										>
											{isFavoriteTrack
												? t('taskbar.volumeMenuFavoriteRemove')
												: t('taskbar.volumeMenuFavoriteAdd')}
										</span>
									</DesktopAppButton>
								</div>
								<NowPlayingLoadHint
									compact
									className="mb-2"
									isLoadingStalled={isLoadingStalled}
									error={
										playbackError ??
										(errorTrackId
											? t('settingsPanel.widgetsPanel.playbackError')
											: null)
									}
									onRetry={() => {
										void retryCurrentTrack();
									}}
								/>
								<div className="grid grid-cols-3 gap-1.5">
									<DesktopChromeTooltip
										content={t('taskbar.volumeMenuPrev')}
										placement="top"
										offsetExtra={8}
									>
										<span className="inline-flex">
											<DesktopAppButton
												type="button"
												variant="ghost"
												size="icon"
												disabled={!track || !hasPrev}
												onClick={() => prev()}
												aria-label={t('taskbar.volumeMenuPrev')}
											>
												<BackwardIcon
													className={taskbar.ICON_CLASS}
													strokeWidth={DESKTOP_LUCIDE.stroke}
												/>
											</DesktopAppButton>
										</span>
									</DesktopChromeTooltip>
									<DesktopChromeTooltip
										content={
											playing
												? t('taskbar.volumeMenuPause')
												: t('taskbar.volumeMenuPlay')
										}
										placement="top"
										offsetExtra={8}
									>
										<span className="inline-flex">
											<DesktopAppButton
												type="button"
												variant="accent"
												size="icon"
												disabled={!track || isLoading}
												onClick={() => togglePlayPause()}
												aria-label={
													playing
														? t('taskbar.volumeMenuPause')
														: t('taskbar.volumeMenuPlay')
												}
											>
												{playing ? (
													<PauseIcon
														className={taskbar.ICON_CLASS}
														strokeWidth={DESKTOP_LUCIDE.stroke}
													/>
												) : (
													<PlayIcon
														className={taskbar.ICON_CLASS}
														strokeWidth={DESKTOP_LUCIDE.stroke}
													/>
												)}
											</DesktopAppButton>
										</span>
									</DesktopChromeTooltip>
									<DesktopChromeTooltip
										content={t('taskbar.volumeMenuNext')}
										placement="top"
										offsetExtra={8}
									>
										<span className="inline-flex">
											<DesktopAppButton
												type="button"
												variant="ghost"
												size="icon"
												disabled={!track || !hasNext}
												onClick={() => next()}
												aria-label={t('taskbar.volumeMenuNext')}
											>
												<ForwardIcon
													className={taskbar.ICON_CLASS}
													strokeWidth={DESKTOP_LUCIDE.stroke}
												/>
											</DesktopAppButton>
										</span>
									</DesktopChromeTooltip>
								</div>
								<div className="mt-2 flex items-center justify-between gap-2">
									<span className={DESKTOP_TYPOGRAPHY.caption}>
										{t('taskbar.taskbarVolumeLabel')}
									</span>
									<span
										className={cn(
											DESKTOP_TYPOGRAPHY.captionInherit,
											'tabular-nums text-(--desktop-text-secondary)'
										)}
									>
										{volumePercent}%
									</span>
								</div>
								<input
									type="range"
									min={0}
									max={1}
									step={0.01}
									value={volume}
									onChange={(e) => applyVolume(Number(e.target.value))}
									onWheel={(e) => {
										swallowWheelEvent(e);
										const delta =
											e.deltaY > 0 ? -VOLUME_WHEEL_STEP : VOLUME_WHEEL_STEP;
										adjustVolumeByWheel(delta);
									}}
									className={cn(
										TASKBAR_VOLUME_RANGE_CLASS,
										'mt-1.5 max-w-none min-w-0'
									)}
									aria-label={t('taskbar.taskbarVolumeAria', {
										volume: volumePercent,
									})}
								/>
								<div className="mt-2 flex justify-end">
									<DesktopAppButton
										type="button"
										size="sm"
										variant="neutral"
										onClick={closeVolumeMenu}
									>
										{t('taskbar.volumeMenuClose')}
									</DesktopAppButton>
								</div>
							</DesktopAppMenuSurface>
						</m.div>
					) : null}
				</AnimatePresence>
			</DesktopShellFloatingPortal>

			<TaskbarClock
				ref={clockRef}
				taskbarButtonSurface={taskbarButtonSurface}
				taskbarButtonActiveSurface={taskbarButtonActiveSurface}
				shellPanel={shellPanel}
			/>

			<DesktopChromeTooltip
				content={t('taskbar.showDesktopStrip')}
				placement="top"
				offsetExtra={12}
			>
				<m.button
					data-taskbar-interactive="true"
					type="button"
					className={cn(
						`relative ${taskbar.HIT_MIN_CLASS} shrink-0 cursor-pointer p-1.5 rounded-lg border-0`,
						taskbar.ICON_FOCUS,
						taskbarButtonSurface
					)}
					aria-label={t('taskbar.showDesktopStrip')}
					onClick={() => {
						dispatchShowDesktop();
					}}
					onContextMenu={(event) => {
						event.preventDefault();
						event.stopPropagation();
						setToolbarContextMenu({
							kind: 'show-desktop',
							point: { x: event.clientX, y: event.clientY },
						});
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							dispatchShowDesktop();
						}
					}}
					whileHover={
						finePointerHover && !reduceMotion ? { scale: 1.02 } : undefined
					}
				>
					<ArrowDownTrayIcon
						className={taskbar.ICON_CLASS}
						strokeWidth={DESKTOP_LUCIDE.stroke}
						aria-hidden
					/>
				</m.button>
			</DesktopChromeTooltip>
			<TaskbarIconContextMenu
				point={toolbarContextMenu?.point ?? null}
				onClose={closeToolbarContextMenu}
				menuWidth={224}
				menuHeight={toolbarContextMenu?.kind === 'show-desktop' ? 118 : 86}
				className="min-w-[224px]"
			>
				{toolbarContextMenu?.kind === 'show-desktop' ? (
					<>
						<DesktopAppMenuItem
							type="button"
							role="menuitem"
							onClick={() => {
								dispatchShowDesktop();
								closeToolbarContextMenu();
							}}
						>
							{t('taskbar.trayContextShowDesktop')}
						</DesktopAppMenuItem>
						<DesktopAppMenuDivider />
						<DesktopAppMenuItem
							type="button"
							role="menuitem"
							disabled={!onShowShortcuts}
							onClick={() => {
								onShowShortcuts?.();
								closeToolbarContextMenu();
							}}
						>
							{t('taskbar.trayContextOpenShortcuts')}
						</DesktopAppMenuItem>
					</>
				) : (
					<DesktopAppMenuItem
						type="button"
						role="menuitem"
						onClick={() => {
							onShowShortcuts?.();
							closeToolbarContextMenu();
						}}
					>
						{t('taskbar.trayContextOpenShortcuts')}
					</DesktopAppMenuItem>
				)}
			</TaskbarIconContextMenu>
		</div>
	);
});
