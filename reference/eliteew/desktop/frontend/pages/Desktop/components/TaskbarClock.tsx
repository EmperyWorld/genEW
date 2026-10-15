/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Taskbar clock and date display with seconds toggle menu; local timer avoids rerendering the whole Taskbar each second.
 *
 * Invariants:
 * - Outside-click dismiss respects Quest laser open guard (same pattern as Start menu / tray).
 * - Cadence realigns on tab visibility return (background throttling).
 * - Seconds flyout Escape uses `useShellCaptureEscape` so taskbar shell Escape defers.
 *
 * Related:
 * - components/TaskbarRightToolbar.tsx
 * - hooks/useShellCaptureKeyboard.ts
 * - utils/subscribeDocumentVisibleSync.ts
 */
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useDesktopPopoverOpenGuard } from '@/pages/Desktop/hooks/useDesktopPopoverOpenGuard';
import { useShellCaptureEscape } from '@/pages/Desktop/hooks/useShellCaptureKeyboard';
import { DESKTOP_TYPOGRAPHY, TASKBAR } from '@/pages/Desktop/constants';
import { useFinePointerHover } from '@/pages/Desktop/hooks/useFinePointerHover';
import { useTaskbarShellClockPrefs } from '@/pages/Desktop/hooks/useDesktopTaskbarShellPrefs';
import { shouldCloseClockMenuOnOutsidePointer } from '@/pages/Desktop/utils/desktopShellOutsideDismiss';
import {
	getTaskbarClockInitialDelayMs,
	getTaskbarClockTickMs,
} from '@/pages/Desktop/utils/taskbarClockTiming';
import { subscribeDocumentVisibleSync } from '@/pages/Desktop/utils/subscribeDocumentVisibleSync';
import { safeCopyToClipboard } from '@/utils/clipboard';
import { notify } from '@/notifications';
import { DesktopAppMenuDivider, DesktopAppMenuItem } from './DesktopAppChrome';
import {
	TaskbarIconContextMenu,
	type TaskbarIconContextMenuPoint,
} from './TaskbarIconContextMenu';

export type TaskbarClockHandle = {
	closeMenu: () => void;
	isMenuOpen: () => boolean;
};

export type TaskbarClockProps = {
	taskbarButtonSurface: string;
	taskbarButtonActiveSurface: string;
	/** Класс всплывающей панели (glass) для чекбокса секунд */
	shellPanel: string;
};

export const TaskbarClock = forwardRef<TaskbarClockHandle, TaskbarClockProps>(
	function TaskbarClock(
		{ taskbarButtonSurface, taskbarButtonActiveSurface, shellPanel },
		ref
	) {
		const { showSeconds, persistClockShowSeconds } =
			useTaskbarShellClockPrefs();
		const { t, i18n } = useTranslation('desktopUi');
		const clockLocale = useMemo(() => {
			const raw = i18n.resolvedLanguage ?? i18n.language ?? 'ru';
			return raw.replace(/_/g, '-');
		}, [i18n.resolvedLanguage, i18n.language]);
		const reduceMotion = useReducedMotion();
		const finePointerHover = useFinePointerHover();
		const [time, setTime] = useState(() => new Date());
		const [showClockMenu, setShowClockMenu] = useState(false);
		const [contextMenu, setContextMenu] =
			useState<TaskbarIconContextMenuPoint | null>(null);
		const clockMenuRef = useRef<HTMLDivElement>(null);
		const clockOpenClickGuardRef = useDesktopPopoverOpenGuard(showClockMenu);

		useImperativeHandle(
			ref,
			() => ({
				closeMenu: () => setShowClockMenu(false),
				isMenuOpen: () => showClockMenu,
			}),
			[showClockMenu]
		);

		useShellCaptureEscape(showClockMenu, () => setShowClockMenu(false));

		useEffect(() => {
			const tickMs = getTaskbarClockTickMs(showSeconds);
			let timeoutId: ReturnType<typeof window.setTimeout> | null = null;
			let intervalId: ReturnType<typeof window.setInterval> | null = null;

			const clearTimers = () => {
				if (timeoutId !== null) {
					window.clearTimeout(timeoutId);
					timeoutId = null;
				}
				if (intervalId !== null) {
					window.clearInterval(intervalId);
					intervalId = null;
				}
			};

			const updateNow = () => setTime(new Date());

			const scheduleCadence = () => {
				clearTimers();
				updateNow();
				timeoutId = window.setTimeout(() => {
					updateNow();
					intervalId = window.setInterval(updateNow, tickMs);
				}, getTaskbarClockInitialDelayMs({ showSeconds }));
			};

			const syncVisibleClock = () => {
				scheduleCadence();
			};

			scheduleCadence();
			const unsubVisible = subscribeDocumentVisibleSync(syncVisibleClock);

			return () => {
				unsubVisible();
				clearTimers();
			};
		}, [showSeconds]);

		useEffect(() => {
			if (!showClockMenu) return;
			const close = (e: MouseEvent | PointerEvent) => {
				if (
					!shouldCloseClockMenuOnOutsidePointer({
						openClickGuardActive: clockOpenClickGuardRef.current,
						target: e.target as Element,
						panelRoot: clockMenuRef.current,
					})
				) {
					return;
				}
				setShowClockMenu(false);
			};
			window.addEventListener('mousedown', close, { capture: true });
			window.addEventListener('pointerdown', close, { capture: true });
			return () => {
				window.removeEventListener('mousedown', close, { capture: true });
				window.removeEventListener('pointerdown', close, { capture: true });
			};
		}, [showClockMenu, clockOpenClickGuardRef]);
		const timeLabel = time.toLocaleTimeString(clockLocale, {
			hour: '2-digit',
			minute: '2-digit',
			...(showSeconds ? { second: '2-digit' } : {}),
		});
		const dateLabel = time.toLocaleDateString(clockLocale, {
			day: 'numeric',
			month: 'short',
		});
		const fullDateTimeLabel = time.toLocaleString(clockLocale, {
			dateStyle: 'medium',
			timeStyle: showSeconds ? 'medium' : 'short',
		});
		const closeContextMenu = () => setContextMenu(null);

		return (
			<div className="relative flex items-center" ref={clockMenuRef}>
				<m.button
					data-taskbar-interactive="true"
					data-clock-toggle="true"
					type="button"
					onClick={() => setShowClockMenu((v) => !v)}
					onContextMenu={(event) => {
						event.preventDefault();
						event.stopPropagation();
						setContextMenu({ x: event.clientX, y: event.clientY });
					}}
					className={`flex min-h-11 min-w-11 cursor-pointer flex-col items-end justify-center rounded-lg px-3 py-2 text-right min-[380px]:px-3.5 ${TASKBAR.ICON_FOCUS} ${showClockMenu ? taskbarButtonActiveSurface : taskbarButtonSurface}`}
					whileHover={
						finePointerHover && !reduceMotion ? { scale: 1.01 } : undefined
					}
					aria-label={t('taskbar.clockAria')}
				>
					<span className={DESKTOP_TYPOGRAPHY.taskbarClock}>{timeLabel}</span>
					<span className={`${DESKTOP_TYPOGRAPHY.meta} tabular-nums`}>
						{dateLabel}
					</span>
				</m.button>
				<AnimatePresence>
					{showClockMenu && (
						<m.div
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 8 }}
							className={`absolute bottom-full right-0 mb-2 w-52 ${shellPanel} p-3`}
						>
							<label className="flex cursor-pointer items-center gap-2 text-sm text-(--desktop-text-secondary)">
								<input
									type="checkbox"
									checked={showSeconds}
									onChange={(e) => {
										persistClockShowSeconds(e.target.checked);
									}}
									className="rounded accent-[rgb(var(--desktop-accent-rgb))]"
								/>
								{t('taskbar.clockSeconds')}
							</label>
						</m.div>
					)}
				</AnimatePresence>
				<TaskbarIconContextMenu
					point={contextMenu}
					onClose={closeContextMenu}
					menuWidth={220}
					menuHeight={142}
					className="min-w-[220px]"
				>
					<DesktopAppMenuItem
						type="button"
						role="menuitem"
						onClick={() => {
							setShowClockMenu((value) => !value);
							closeContextMenu();
						}}
					>
						{t('taskbar.trayContextClockSettings')}
					</DesktopAppMenuItem>
					<DesktopAppMenuItem
						type="button"
						role="menuitem"
						onClick={() => {
							persistClockShowSeconds(!showSeconds);
							closeContextMenu();
						}}
					>
						{showSeconds
							? t('taskbar.trayContextHideClockSeconds')
							: t('taskbar.trayContextShowClockSeconds')}
					</DesktopAppMenuItem>
					<DesktopAppMenuDivider />
					<DesktopAppMenuItem
						type="button"
						role="menuitem"
						onClick={() => {
							void (async () => {
								const copied = await safeCopyToClipboard(fullDateTimeLabel);
								if (copied) {
									notify.success(t('taskbar.trayContextCopyDateTimeDone'));
								} else {
									notify.error(t('taskbar.trayContextCopyDateTimeFailed'));
								}
								closeContextMenu();
							})();
						}}
					>
						{t('taskbar.trayContextCopyDateTime')}
					</DesktopAppMenuItem>
				</TaskbarIconContextMenu>
			</div>
		);
	}
);

TaskbarClock.displayName = 'TaskbarClock';
