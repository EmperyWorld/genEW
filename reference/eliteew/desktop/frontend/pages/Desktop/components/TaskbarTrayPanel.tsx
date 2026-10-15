/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Popup panel for real Desktop background processes. It is split out of Taskbar
 * to avoid rerendering the parent on clock ticks and tray state updates.
 *
 * Invariants:
 * - Rows represent real runtime/minimized activity only; static product shortcuts do not belong here.
 * - Visual equality comparator must include every prop that changes rendered output.
 * - Panel is ``position: fixed`` via body portal; anchor coords come from the tray toggle.
 *
 * Related:
 * - `hooks/useDesktopTrayItems.ts`
 * - `components/TaskbarTrayGafCluster.tsx`
 * - `utils/desktopTraySurfacePolicy.ts`
 */

import { cn } from '@/utils/cn';
import { AnimatePresence, m } from 'framer-motion';
import * as React from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DesktopIconStyle } from '../../../types/profile';
import {
	DESKTOP_INTERACTIVE,
	DESKTOP_LUCIDE,
	DESKTOP_TYPOGRAPHY,
	DESKTOP_Z_INDEX,
} from '@/pages/Desktop/constants';
import { useDesktopWindowPortalStackBase } from '@/pages/Desktop/context/DesktopWindowPortalStackContext';
import { getFloatingMenuPosition } from '../utils/desktopUi';
import type {
	DesktopTrayItem,
	DesktopTrayItemVariant,
} from '../hooks/useDesktopTrayItems';
import { DesktopAppBadge } from '../utils/desktopVisualSystem';
import {
	DesktopAppButton,
	DesktopAppEmptyState,
	DesktopAppMenuItem,
	DesktopAppMenuSurface,
} from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { DesktopShellFloatingPortal } from './DesktopShellFloatingPortal';
import {
	ChatBubbleLeftRightIcon,
	ExclamationCircleIcon,
	MusicalNoteIcon,
	SparklesIcon,
	UsersIcon,
} from '@heroicons/react/24/outline';

export type TaskbarTrayPanelProps = {
	/** Класс панели (glass/strong), уже с `getDesktopShellPanelClassName`. */
	panelClassName: string;
	panelId: string;
	/** Viewport-fixed top-left from tray toggle anchor. */
	panelPosition: { x: number; y: number };
	panelWidthPx: number;
	trayItems: DesktopTrayItem[];
	gafUnread: number;
	ugsActiveTaskCount: number;
	ugsTrayPollError: boolean;
	ugsTrayPollSuccess: boolean;
	musicPlaybackErrorMessage: string | null;
	iconStyle: DesktopIconStyle;
	onActivateApp: (appComponent: string) => void;
	listFocusRef?: React.RefObject<HTMLDivElement | null>;
};

/** Сравнение строк трея по отображаемым полям (без нового массива при неизменных данных). */
function trayItemsVisualEqual(
	a: DesktopTrayItem[],
	b: DesktopTrayItem[]
): boolean {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const x = a[i];
		const y = b[i];
		if (
			x.id !== y.id ||
			x.variant !== y.variant ||
			x.appComponent !== y.appComponent ||
			x.label !== y.label ||
			x.status !== y.status ||
			x.secondary !== y.secondary ||
			x.socketConnected !== y.socketConnected
		) {
			return false;
		}
	}
	return true;
}

/** Возвращает true, если пропсы визуально те же — пропускаем ререндер (тик часов в Taskbar). */
export function taskbarTrayPanelPropsAreEqual(
	prev: Readonly<TaskbarTrayPanelProps>,
	next: Readonly<TaskbarTrayPanelProps>
): boolean {
	if (prev.panelClassName !== next.panelClassName) return false;
	if (prev.panelId !== next.panelId) return false;
	if (
		prev.panelPosition.x !== next.panelPosition.x ||
		prev.panelPosition.y !== next.panelPosition.y
	) {
		return false;
	}
	if (prev.panelWidthPx !== next.panelWidthPx) return false;
	if (prev.gafUnread !== next.gafUnread) return false;
	if (prev.ugsActiveTaskCount !== next.ugsActiveTaskCount) return false;
	if (prev.ugsTrayPollError !== next.ugsTrayPollError) return false;
	if (prev.ugsTrayPollSuccess !== next.ugsTrayPollSuccess) return false;
	if (prev.musicPlaybackErrorMessage !== next.musicPlaybackErrorMessage)
		return false;
	if (prev.iconStyle !== next.iconStyle) return false;
	if (prev.onActivateApp !== next.onActivateApp) return false;
	return trayItemsVisualEqual(prev.trayItems, next.trayItems);
}

function trayItemIcon(
	variant: DesktopTrayItemVariant,
	className: string
): React.ReactNode {
	const sw = DESKTOP_LUCIDE.stroke;
	switch (variant) {
		case 'gaf':
			return <ChatBubbleLeftRightIcon className={className} strokeWidth={sw} />;
		case 'music':
			return <MusicalNoteIcon className={className} strokeWidth={sw} />;
		case 'ugs':
			return <SparklesIcon className={className} strokeWidth={sw} />;
		case 'friends':
			return <UsersIcon className={className} strokeWidth={sw} />;
		default:
			return <UsersIcon className={className} strokeWidth={sw} />;
	}
}

const TaskbarTrayPanelInner: React.FC<TaskbarTrayPanelProps> = ({
	panelClassName,
	panelId,
	panelPosition,
	panelWidthPx,
	trayItems,
	gafUnread,
	ugsActiveTaskCount,
	ugsTrayPollError,
	ugsTrayPollSuccess,
	musicPlaybackErrorMessage,
	iconStyle,
	onActivateApp,
	listFocusRef,
}) => {
	const { t } = useTranslation('desktopUi');
	const portalStackBase = useDesktopWindowPortalStackBase();
	const ugsTrayRow = trayItems.find((row) => row.variant === 'ugs');
	const [trayRowContext, setTrayRowContext] = React.useState<{
		x: number;
		y: number;
		item: DesktopTrayItem;
	} | null>(null);

	const trayRowMenuPos = React.useMemo(() => {
		if (!trayRowContext) return null;
		return getFloatingMenuPosition(
			{ x: trayRowContext.x, y: trayRowContext.y },
			{ menuWidth: 220, menuHeight: 52 }
		);
	}, [trayRowContext]);

	React.useEffect(() => {
		if (!trayRowContext) return;
		const close = () => setTrayRowContext(null);
		window.addEventListener('click', close);
		return () => window.removeEventListener('click', close);
	}, [trayRowContext]);

	React.useEffect(() => {
		if (!trayRowContext) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setTrayRowContext(null);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [trayRowContext]);

	return (
		<m.div
			ref={listFocusRef}
			id={panelId}
			data-tray-popup
			initial={{ opacity: 0, y: 8, scale: 0.98 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={{ opacity: 0, y: 8, scale: 0.98 }}
			className={`fixed overflow-hidden ${panelClassName}`}
			style={{
				left: panelPosition.x,
				top: panelPosition.y,
				width: panelWidthPx,
				zIndex: DESKTOP_Z_INDEX.PANEL,
				boxShadow: 'var(--desktop-shadow-panel)',
			}}
			role="region"
			aria-label={t('taskbar.trayDialogLabel')}
		>
			<div className="flex items-center justify-between gap-2 border-b border-(--desktop-border-subtle) bg-(--desktop-surface-panel) px-4 pt-3 pb-2">
				<span className="text-sm font-medium text-(--desktop-text-primary)">
					{t('taskbar.trayPanelTitle')}
				</span>
				<span className={DESKTOP_TYPOGRAPHY.taskbarTrayMeta}>
					{trayItems.length > 0
						? `${t('taskbar.trayProcesses', { count: trayItems.length })}${
								gafUnread > 0
									? ` · ${t('taskbar.gafUnread')} ${gafUnread > 99 ? '99+' : gafUnread}`
									: ''
							}${
								ugsTrayRow && ugsActiveTaskCount > 0
									? ` · ${t('taskbar.trayUgsHubLine')} ${ugsActiveTaskCount > 99 ? '99+' : ugsActiveTaskCount}`
									: ''
							}`
						: t('taskbar.trayNoActive')}
				</span>
			</div>
			<div className="py-1.5 max-h-60 overflow-y-auto text-xs">
				{trayItems.length === 0 ? (
					<DesktopAppEmptyState
						className="min-h-[140px] px-4 py-6"
						title={t('taskbar.trayEmptyTitle')}
						description={t('taskbar.trayEmptyDescription')}
					/>
				) : (
					trayItems.map((item) => {
						const secondaryLine = item.secondary
							? item.secondary
							: item.variant === 'gaf' && gafUnread === 0
								? t('taskbar.trayNoNewMessages')
								: null;
						const trayRowTooltip = secondaryLine
							? `${item.label}\n${secondaryLine}`
							: item.label;
						return (
							<div key={item.id}>
								<DesktopChromeTooltip
									content={trayRowTooltip}
									placement="right"
									offsetExtra={4}
								>
									<DesktopAppButton
										type="button"
										onClick={() => onActivateApp(item.appComponent)}
										onContextMenu={(e) => {
											e.preventDefault();
											e.stopPropagation();
											setTrayRowContext({
												x: e.clientX,
												y: e.clientY,
												item,
											});
										}}
										variant="ghost"
										size="md"
										className="w-full justify-start rounded-none px-4 py-2 text-left"
									>
										<DesktopAppBadge
											appComponent={item.appComponent}
											icon={trayItemIcon(item.variant, DESKTOP_LUCIDE.accentSm)}
											variant="list"
											className="h-7 w-7"
											iconStyle={iconStyle}
										/>
										<div className="flex min-w-0 flex-1 flex-col">
											<div className="flex items-center justify-between gap-2">
												<span className="truncate text-xs font-medium text-(--desktop-text-primary)">
													{item.label}
												</span>
												<span
													className={cn(
														DESKTOP_TYPOGRAPHY.small,
														'flex shrink-0 items-center gap-1 whitespace-nowrap text-(--desktop-text-muted)'
													)}
												>
													{item.variant === 'gaf' ? (
														<DesktopChromeTooltip
															content={
																item.socketConnected
																	? t('taskbar.trayGafRtOnline')
																	: t('taskbar.trayGafRtOffline')
															}
															placement="top"
															offsetExtra={6}
														>
															<span
																className={`h-1.5 w-1.5 shrink-0 rounded-full ${
																	item.socketConnected
																		? 'bg-[rgb(var(--desktop-accent-rgb))]'
																		: 'bg-(--desktop-text-muted)'
																}`}
																aria-hidden
															/>
														</DesktopChromeTooltip>
													) : null}
													{item.variant === 'music' &&
													musicPlaybackErrorMessage ? (
														<DesktopChromeTooltip
															content={musicPlaybackErrorMessage}
															placement="top"
															offsetExtra={6}
														>
															<span
																className="inline-flex shrink-0 text-rose-400"
																role="img"
																aria-label={`${t('taskbar.trayMusicErrorPrefix')} ${musicPlaybackErrorMessage}`}
															>
																<ExclamationCircleIcon
																	className="h-3.5 w-3.5"
																	strokeWidth={DESKTOP_LUCIDE.stroke}
																	aria-hidden
																/>
															</span>
														</DesktopChromeTooltip>
													) : item.variant === 'ugs' ? (
														<>
															<DesktopChromeTooltip
																content={
																	ugsActiveTaskCount === 0
																		? t('taskbar.trayUgsMinimized')
																		: ugsTrayPollError
																			? t('taskbar.trayUgsError')
																			: ugsTrayPollSuccess
																				? t('taskbar.trayUgsActive')
																				: t('taskbar.trayUgsQueued')
																}
																placement="top"
																offsetExtra={6}
															>
																<span
																	className={`h-1.5 w-1.5 shrink-0 rounded-full ${
																		ugsActiveTaskCount === 0
																			? 'bg-(--desktop-text-muted)'
																			: ugsTrayPollError
																				? 'bg-rose-400'
																				: ugsTrayPollSuccess
																					? 'bg-cyan-400'
																					: 'bg-(--desktop-text-muted)'
																	}`}
																	aria-hidden
																/>
															</DesktopChromeTooltip>
															<span className="sr-only">
																{ugsActiveTaskCount === 0
																	? t('taskbar.trayUgsMinimized')
																	: ugsTrayPollError
																		? t('taskbar.trayUgsError')
																		: ugsTrayPollSuccess
																			? t('taskbar.trayUgsActive')
																			: t('taskbar.trayUgsQueued')}
															</span>
														</>
													) : null}
													<span>{item.status}</span>
												</span>
											</div>
											{item.secondary ? (
												<span
													className={cn(DESKTOP_TYPOGRAPHY.small, 'truncate')}
												>
													{item.secondary}
												</span>
											) : item.variant === 'gaf' && gafUnread === 0 ? (
												<span
													className={cn(DESKTOP_TYPOGRAPHY.small, 'truncate')}
												>
													{t('taskbar.trayNoNewMessages')}
												</span>
											) : null}
										</div>
									</DesktopAppButton>
								</DesktopChromeTooltip>
							</div>
						);
					})
				)}
			</div>
			<DesktopShellFloatingPortal>
				<AnimatePresence>
					{trayRowContext && trayRowMenuPos ? (
						<m.div
							key="tray-row-context"
							initial={{ opacity: 0, scale: 0.96, y: 4 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.96, y: 4 }}
							transition={{ duration: 0.12 }}
							className="fixed"
							style={{
								zIndex: portalStackBase,
								left: trayRowMenuPos.x,
								top: trayRowMenuPos.y,
							}}
							data-tray-popup
							role="presentation"
							onClick={(e) => e.stopPropagation()}
							onMouseDown={(e) => e.stopPropagation()}
						>
							<DesktopAppMenuSurface className="min-w-[200px]" role="menu">
								<DesktopAppMenuItem
									type="button"
									role="menuitem"
									onClick={() => {
										onActivateApp(trayRowContext.item.appComponent);
										setTrayRowContext(null);
									}}
									className={DESKTOP_INTERACTIVE.focusRing}
								>
									{t('taskbar.trayRowContextOpen')}
								</DesktopAppMenuItem>
							</DesktopAppMenuSurface>
						</m.div>
					) : null}
				</AnimatePresence>
			</DesktopShellFloatingPortal>
		</m.div>
	);
};

export const TaskbarTrayPanel = memo(
	TaskbarTrayPanelInner,
	taskbarTrayPanelPropsAreEqual
);
TaskbarTrayPanel.displayName = 'TaskbarTrayPanel';
