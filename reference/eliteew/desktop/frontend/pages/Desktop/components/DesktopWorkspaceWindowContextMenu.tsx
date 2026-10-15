import { cn } from '@/utils/cn';
import { AnimatePresence, m } from 'framer-motion';
import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { DesktopControlCenterTab } from './DesktopSettingsPanel';
import { SNAP_PREVIEW_ZONE_KEYS } from './SnapPreview';
import {
	DesktopAppMenuDivider,
	DesktopAppMenuItem,
	DesktopAppMenuSectionLabel,
	DesktopAppMenuSurface,
} from './DesktopAppChrome';
import { DESKTOP_INTERACTIVE, DESKTOP_LUCIDE } from '../constants';
import { useDesktopWindowPortalStackBase } from '../context/DesktopWindowPortalStackContext';
import type { VirtualDesktop } from '../hooks/useVirtualDesktops';
import type {
	DesktopItem,
	SnapZone,
	WindowState,
} from '../types/desktop.types';
import { getAppStoreWindowInstanceCap } from '../utils/appStoreWindowPolicy';
import {
	getDesktopPortalShellProps,
	getFloatingMenuPosition,
} from '../utils/desktopUi';
import { isAssistantWindowContextSupported } from '../utils/desktopAssistantLaunchPayload';
import { DESKTOP_WORKSPACE_MOTION } from '../utils/desktopVisualSystem';
import {
	ArrowsPointingOutIcon,
	Bars3BottomLeftIcon,
	ChatBubbleLeftRightIcon,
	Cog6ToothIcon,
	ComputerDesktopIcon,
	DocumentDuplicateIcon,
	MinusIcon,
	SparklesIcon,
	Squares2X2Icon,
	StarIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';

const WINDOW_CONTEXT_MENU_ITEM_PX = 40;
const WINDOW_CONTEXT_MENU_SECTION_PX = 24;
const WINDOW_CONTEXT_MENU_DIVIDER_PX = 9;

const WINDOW_CONTEXT_SNAP_GROUPS: {
	sectionKey:
		| 'windowContextMenu.snapGroupMain'
		| 'windowContextMenu.snapGroupTiles';
	zones: Exclude<SnapZone, null>[];
}[] = [
	{
		sectionKey: 'windowContextMenu.snapGroupMain',
		zones: ['left', 'right', 'top', 'bottom'],
	},
	{
		sectionKey: 'windowContextMenu.snapGroupTiles',
		zones: [
			'left-third',
			'center-third',
			'right-third',
			'top-left',
			'top-right',
			'bottom-left',
			'bottom-right',
		],
	},
];

function estimateWindowContextMenuHeight(p: {
	hasBringToFront: boolean;
	windowLayerActionCount: number;
	policyExtraPx: number;
	assistantExtraPx: number;
	showBringIntoWorkArea: boolean;
	isMinimized: boolean;
	hasSnap: boolean;
	otherDesktopCount: number;
	hasMoveDesktop: boolean;
	hasShellSettings: boolean;
}): number {
	const R = WINDOW_CONTEXT_MENU_ITEM_PX;
	const S = WINDOW_CONTEXT_MENU_SECTION_PX;
	const D = WINDOW_CONTEXT_MENU_DIVIDER_PX;
	let h = (2 + (p.hasBringToFront ? 1 : 0) + p.windowLayerActionCount) * R;
	if (p.policyExtraPx > 0) {
		h += D;
	}
	h += p.policyExtraPx;
	if (p.assistantExtraPx > 0) {
		h += D;
	}
	h += p.assistantExtraPx;
	if (p.showBringIntoWorkArea && !p.isMinimized) {
		h += R;
	}
	if (p.hasSnap) {
		h += D;
		for (let gi = 0; gi < WINDOW_CONTEXT_SNAP_GROUPS.length; gi++) {
			if (gi > 0) h += D;
			const group = WINDOW_CONTEXT_SNAP_GROUPS[gi];
			h += S + group.zones.length * R;
		}
	}
	h += R;
	if (p.otherDesktopCount > 0 && p.hasMoveDesktop) {
		h += D + S + p.otherDesktopCount * R;
	}
	if (p.hasShellSettings) {
		h += D + R;
	}
	return h + 14;
}

export interface DesktopWorkspaceWindowContextMenuProps {
	windowContextMenu: { windowId: string; x: number; y: number } | null;
	onDismiss: () => void;
	reduceMotion: boolean;
	currentDesktopWindows: WindowState[];
	desktops: VirtualDesktop[];
	onMinimizeWindow: (id: string) => void;
	onMaximizeWindow: (id: string) => void;
	onCloseWindow: (id: string) => void;
	/** Поднять окно по z-index (аналог фокуса кликом по заголовку). */
	onFocusWindow?: (id: string) => void;
	/** Переключить «поверх всех» для окна из меню заголовка. */
	onToggleAlwaysOnTop?: (id: string) => void;
	/** Дублировать окно (новый экземпляр со смещением). */
	onDuplicateWindow?: (id: string) => void;
	moveWindowToDesktop?: (windowId: string, desktopId: string) => void;
	/** Открыть центр настройки рабочего стола (портал — корректно при масштабе UI). */
	onOpenShellSettings?: (tab?: DesktopControlCenterTab) => void;
	/** Укладка окна в зону привязки (как при перетаскивании к краю). */
	snapWindow?: (windowId: string, zone: Exclude<SnapZone, null>) => void;
	/** Сдвинуть окно в текущую рабочую область (как в настройках). */
	onBringWindowIntoWorkArea?: (windowId: string) => void;
	/** Каталог для подписи про single/multi instance (как на карточке витрины). */
	installedApps?: DesktopItem[];
	/** Волна 7: контекст Assistant / GAF из меню окна (зависит от expansion actions). */
	assistantWindowContextSummarizeEnabled?: boolean;
	assistantWindowContextGafEnabled?: boolean;
	onWindowContextAssistantSummarize?: (windowId: string) => void;
	onWindowContextAssistantShareGaf?: (windowId: string) => void;
}

/**
 * Context menu for a desktop window (title/body): minimize / maximize / close / move to another virtual desktop.
 */
export function DesktopWorkspaceWindowContextMenu({
	windowContextMenu,
	onDismiss,
	reduceMotion,
	currentDesktopWindows,
	desktops,
	onMinimizeWindow,
	onMaximizeWindow,
	onCloseWindow,
	onFocusWindow,
	onToggleAlwaysOnTop,
	onDuplicateWindow,
	moveWindowToDesktop,
	onOpenShellSettings,
	snapWindow,
	onBringWindowIntoWorkArea,
	installedApps,
	assistantWindowContextSummarizeEnabled,
	assistantWindowContextGafEnabled,
	onWindowContextAssistantSummarize,
	onWindowContextAssistantShareGaf,
}: DesktopWorkspaceWindowContextMenuProps): React.JSX.Element {
	const { t } = useTranslation('desktopUi');
	const { t: tStore } = useTranslation('appStore');
	const portalStackBase = useDesktopWindowPortalStackBase();
	const { style: portalShellStyle, theme: portalTheme } =
		getDesktopPortalShellProps();

	const assistantMenuExtra = useMemo(() => {
		if (!windowContextMenu) return 0;
		const win = currentDesktopWindows.find(
			(w) => w.id === windowContextMenu.windowId
		);
		if (!win || !isAssistantWindowContextSupported(win)) return 0;
		let rows = 0;
		if (
			assistantWindowContextSummarizeEnabled &&
			onWindowContextAssistantSummarize
		) {
			rows += 1;
		}
		if (assistantWindowContextGafEnabled && onWindowContextAssistantShareGaf) {
			rows += 1;
		}
		if (rows === 0) return 0;
		return rows * 44 + 40;
	}, [
		assistantWindowContextGafEnabled,
		assistantWindowContextSummarizeEnabled,
		currentDesktopWindows,
		onWindowContextAssistantShareGaf,
		onWindowContextAssistantSummarize,
		windowContextMenu,
	]);

	const policyMenuExtra = useMemo(() => {
		if (!windowContextMenu || !installedApps?.length) return 0;
		const win = currentDesktopWindows.find(
			(w) => w.id === windowContextMenu.windowId
		);
		if (win?.type !== 'app' || !win.appComponent) return 0;
		const app = installedApps.find(
			(a) =>
				a.type === 'app' &&
				Boolean(a.appComponent) &&
				a.appComponent === win.appComponent
		);
		return app ? 56 : 0;
	}, [windowContextMenu, currentDesktopWindows, installedApps]);

	const floatingPos = useMemo(() => {
		if (!windowContextMenu) return null;
		const win = currentDesktopWindows.find(
			(w) => w.id === windowContextMenu.windowId
		);
		const viewportH = typeof window !== 'undefined' ? window.innerHeight : 900;
		const maxMenuPx = Math.max(280, Math.floor(viewportH * 0.92) - 12);
		if (!win) {
			return getFloatingMenuPosition(
				{ x: windowContextMenu.x, y: windowContextMenu.y },
				{ menuWidth: 260, menuHeight: Math.min(maxMenuPx, 220) }
			);
		}
		const currentDesktopIdForWindow =
			desktops.find((d) => d.windows.includes(win.id))?.id ?? null;
		const otherCount =
			currentDesktopIdForWindow != null
				? desktops.filter((d) => d.id !== currentDesktopIdForWindow).length
				: 0;
		const windowLayerActionCount =
			(onToggleAlwaysOnTop ? 1 : 0) + (onDuplicateWindow ? 1 : 0);
		const rawHeight = estimateWindowContextMenuHeight({
			hasBringToFront: Boolean(onFocusWindow),
			windowLayerActionCount,
			policyExtraPx: policyMenuExtra,
			assistantExtraPx: assistantMenuExtra,
			showBringIntoWorkArea: Boolean(onBringWindowIntoWorkArea),
			isMinimized: Boolean(win.isMinimized),
			hasSnap: Boolean(snapWindow),
			otherDesktopCount: Math.max(0, otherCount),
			hasMoveDesktop: Boolean(moveWindowToDesktop),
			hasShellSettings: Boolean(onOpenShellSettings),
		});
		const menuHeight = Math.min(maxMenuPx, rawHeight);
		return getFloatingMenuPosition(
			{ x: windowContextMenu.x, y: windowContextMenu.y },
			{
				menuWidth: 260,
				menuHeight,
				viewportHeight: viewportH,
			}
		);
	}, [
		windowContextMenu,
		currentDesktopWindows,
		desktops,
		snapWindow,
		onBringWindowIntoWorkArea,
		onFocusWindow,
		onToggleAlwaysOnTop,
		onDuplicateWindow,
		moveWindowToDesktop,
		onOpenShellSettings,
		policyMenuExtra,
		assistantMenuExtra,
	]);

	const menuTree = (
		<AnimatePresence>
			{windowContextMenu && (
				<>
					<div
						className="fixed inset-0"
						style={{ zIndex: portalStackBase - 1 }}
						aria-hidden
						onMouseDown={onDismiss}
					/>
					<m.div
						initial={
							reduceMotion
								? { opacity: 1, scale: 1, y: 0 }
								: { opacity: 0, scale: 0.96, y: 4 }
						}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={
							reduceMotion
								? { opacity: 1, scale: 1, y: 0 }
								: { opacity: 0, scale: 0.96, y: 4 }
						}
						transition={{
							duration: reduceMotion
								? 0
								: DESKTOP_WORKSPACE_MOTION.popover.duration,
							ease: reduceMotion
								? undefined
								: DESKTOP_WORKSPACE_MOTION.popover.ease,
						}}
						className="fixed text-(--desktop-text-primary)"
						style={{
							zIndex: portalStackBase,
							left: floatingPos?.x ?? windowContextMenu.x,
							top: floatingPos?.y ?? windowContextMenu.y,
						}}
						onClick={(e) => e.stopPropagation()}
					>
						{(() => {
							const win = currentDesktopWindows.find(
								(w) => w.id === windowContextMenu.windowId
							);
							if (!win) return null;
							const isMax = win.isMaximized;
							const currentDesktopIdForWindow =
								desktops.find((d) => d.windows.includes(win.id))?.id ?? null;
							const otherDesktops = currentDesktopIdForWindow
								? desktops.filter((d) => d.id !== currentDesktopIdForWindow)
								: [];
							return (
								<DesktopAppMenuSurface
									className={cn(
										'min-w-[220px]',
										'max-h-[min(92vh,calc(100dvh-1rem))] overflow-y-auto overflow-x-hidden overscroll-y-contain'
									)}
								>
									<DesktopAppMenuItem
										type="button"
										icon={
											<MinusIcon
												className="h-4 w-4"
												strokeWidth={DESKTOP_LUCIDE.stroke}
											/>
										}
										onClick={() => {
											onMinimizeWindow(win.id);
											onDismiss();
										}}
										className={DESKTOP_INTERACTIVE.focusRing}
									>
										{t('windowContextMenu.minimize')}
									</DesktopAppMenuItem>
									<DesktopAppMenuItem
										type="button"
										icon={
											<ArrowsPointingOutIcon
												className="h-4 w-4"
												strokeWidth={DESKTOP_LUCIDE.stroke}
											/>
										}
										onClick={() => {
											onMaximizeWindow(win.id);
											onDismiss();
										}}
										className={DESKTOP_INTERACTIVE.focusRing}
									>
										{isMax
											? t('windowContextMenu.restore')
											: t('windowContextMenu.maximize')}
									</DesktopAppMenuItem>
									<DesktopAppMenuDivider />
									<DesktopAppMenuSectionLabel>
										{t('windowContextMenu.moveWindowHint')}
									</DesktopAppMenuSectionLabel>
									<p className="px-3 pb-1 text-xs leading-snug text-(--desktop-text-dim)">
										{t('windowContextMenu.moveWindowHintDetail')}
									</p>
									{onFocusWindow ? (
										<DesktopAppMenuItem
											type="button"
											icon={
												<ArrowsPointingOutIcon
													className="h-4 w-4"
													strokeWidth={DESKTOP_LUCIDE.stroke}
												/>
											}
											onClick={() => {
												onFocusWindow(win.id);
												onDismiss();
											}}
											className={DESKTOP_INTERACTIVE.focusRing}
										>
											{t('windowContextMenu.bringToFront')}
										</DesktopAppMenuItem>
									) : null}
									{onToggleAlwaysOnTop ? (
										<DesktopAppMenuItem
											type="button"
											icon={
												<StarIcon
													className="h-4 w-4"
													strokeWidth={DESKTOP_LUCIDE.stroke}
												/>
											}
											shortcut={
												win.alwaysOnTop ? (
													<span className="text-[rgb(var(--desktop-accent-rgb))]">
														✓
													</span>
												) : undefined
											}
											onClick={() => {
												onToggleAlwaysOnTop(win.id);
												onDismiss();
											}}
											className={DESKTOP_INTERACTIVE.focusRing}
										>
											{t('enhancedContextMenu.window.alwaysOnTop')}
										</DesktopAppMenuItem>
									) : null}
									{onDuplicateWindow ? (
										<DesktopAppMenuItem
											type="button"
											icon={
												<DocumentDuplicateIcon
													className="h-4 w-4"
													strokeWidth={DESKTOP_LUCIDE.stroke}
												/>
											}
											onClick={() => {
												onDuplicateWindow(win.id);
												onDismiss();
											}}
											className={DESKTOP_INTERACTIVE.focusRing}
										>
											{t('enhancedContextMenu.window.duplicate')}
										</DesktopAppMenuItem>
									) : null}
									{(() => {
										if (
											win.type !== 'app' ||
											!win.appComponent ||
											!installedApps?.length
										) {
											return null;
										}
										const app = installedApps.find(
											(a) =>
												a.type === 'app' &&
												Boolean(a.appComponent) &&
												a.appComponent === win.appComponent
										);
										if (!app) return null;
										const cap = getAppStoreWindowInstanceCap({
											allow_multiple_windows: app.allowMultipleWindows,
											max_window_instances: app.maxWindowInstances,
										});
										const labelText = cap.allowsMultipleInstances
											? tStore('card.windowsBadgeMultiple', {
													count: cap.maxInstances,
												})
											: tStore('card.windowsBadgeSingle');
										return (
											<>
												<DesktopAppMenuDivider />
												<DesktopAppMenuSectionLabel>
													{t('windowContextMenu.instancePolicySection')}
												</DesktopAppMenuSectionLabel>
												<p className="px-3 pb-1 text-xs leading-snug text-(--desktop-text-dim)">
													{labelText}
												</p>
											</>
										);
									})()}
									{win.type === 'app' &&
									isAssistantWindowContextSupported(win) &&
									((assistantWindowContextSummarizeEnabled &&
										onWindowContextAssistantSummarize) ||
										(assistantWindowContextGafEnabled &&
											onWindowContextAssistantShareGaf)) ? (
										<>
											<DesktopAppMenuDivider />
											<DesktopAppMenuSectionLabel>
												{t('windowContextMenu.assistantSection')}
											</DesktopAppMenuSectionLabel>
											{assistantWindowContextSummarizeEnabled &&
											onWindowContextAssistantSummarize ? (
												<DesktopAppMenuItem
													type="button"
													icon={
														<SparklesIcon
															className="h-4 w-4"
															strokeWidth={DESKTOP_LUCIDE.stroke}
														/>
													}
													onClick={() => {
														onWindowContextAssistantSummarize(win.id);
														onDismiss();
													}}
													className={DESKTOP_INTERACTIVE.focusRing}
												>
													{t('windowContextMenu.summarizeInAssistant')}
												</DesktopAppMenuItem>
											) : null}
											{assistantWindowContextGafEnabled &&
											onWindowContextAssistantShareGaf ? (
												<DesktopAppMenuItem
													type="button"
													icon={
														<ChatBubbleLeftRightIcon
															className="h-4 w-4"
															strokeWidth={DESKTOP_LUCIDE.stroke}
														/>
													}
													onClick={() => {
														onWindowContextAssistantShareGaf(win.id);
														onDismiss();
													}}
													className={DESKTOP_INTERACTIVE.focusRing}
												>
													{t('windowContextMenu.attachContextToGaf')}
												</DesktopAppMenuItem>
											) : null}
										</>
									) : null}
									{onBringWindowIntoWorkArea && !win.isMinimized ? (
										<DesktopAppMenuItem
											type="button"
											icon={
												<Bars3BottomLeftIcon
													className="h-4 w-4"
													strokeWidth={DESKTOP_LUCIDE.stroke}
												/>
											}
											onClick={() => {
												onBringWindowIntoWorkArea(win.id);
												onDismiss();
											}}
											className={DESKTOP_INTERACTIVE.focusRing}
										>
											{t('windowContextMenu.bringIntoWorkArea')}
										</DesktopAppMenuItem>
									) : null}
									{snapWindow ? (
										<>
											<DesktopAppMenuDivider />
											{WINDOW_CONTEXT_SNAP_GROUPS.map((group, gi) => (
												<React.Fragment key={group.sectionKey}>
													{gi > 0 ? <DesktopAppMenuDivider /> : null}
													<DesktopAppMenuSectionLabel>
														{t(group.sectionKey)}
													</DesktopAppMenuSectionLabel>
													{group.zones.map((zone) => {
														const labelKey = SNAP_PREVIEW_ZONE_KEYS[zone];
														return (
															<DesktopAppMenuItem
																key={zone}
																type="button"
																icon={
																	<Squares2X2Icon
																		className="h-4 w-4"
																		strokeWidth={DESKTOP_LUCIDE.stroke}
																	/>
																}
																onClick={() => {
																	snapWindow(win.id, zone);
																	onDismiss();
																}}
																className={DESKTOP_INTERACTIVE.focusRing}
															>
																{labelKey ? t(labelKey) : zone}
															</DesktopAppMenuItem>
														);
													})}
												</React.Fragment>
											))}
										</>
									) : null}
									<DesktopAppMenuItem
										type="button"
										tone="danger"
										icon={
											<XMarkIcon
												className="h-4 w-4"
												strokeWidth={DESKTOP_LUCIDE.stroke}
											/>
										}
										onClick={() => {
											onCloseWindow(win.id);
											onDismiss();
										}}
										className={DESKTOP_INTERACTIVE.focusRing}
									>
										{t('windowContextMenu.close')}
									</DesktopAppMenuItem>
									{otherDesktops.length > 0 && moveWindowToDesktop ? (
										<>
											<DesktopAppMenuDivider />
											<DesktopAppMenuSectionLabel>
												{t('windowContextMenu.moveToDesktopSection')}
											</DesktopAppMenuSectionLabel>
											{otherDesktops.map((d) => (
												<DesktopAppMenuItem
													key={d.id}
													type="button"
													icon={
														<ComputerDesktopIcon
															className="h-4 w-4"
															strokeWidth={DESKTOP_LUCIDE.stroke}
														/>
													}
													onClick={() => {
														moveWindowToDesktop(win.id, d.id);
														onDismiss();
													}}
													className={DESKTOP_INTERACTIVE.focusRing}
												>
													{d.name}
												</DesktopAppMenuItem>
											))}
										</>
									) : null}
									{onOpenShellSettings ? (
										<>
											<DesktopAppMenuDivider />
											<DesktopAppMenuItem
												type="button"
												icon={
													<Cog6ToothIcon
														className="h-4 w-4"
														strokeWidth={DESKTOP_LUCIDE.stroke}
													/>
												}
												onClick={() => {
													onOpenShellSettings('personalize');
													onDismiss();
												}}
												className={DESKTOP_INTERACTIVE.focusRing}
											>
												{t('windowContextMenu.desktopSettings')}
											</DesktopAppMenuItem>
										</>
									) : null}
								</DesktopAppMenuSurface>
							);
						})()}
					</m.div>
				</>
			)}
		</AnimatePresence>
	);

	if (typeof document === 'undefined') {
		return menuTree;
	}

	return createPortal(
		<div
			style={portalShellStyle}
			className={portalTheme === 'dark' ? 'dark' : ''}
		>
			{menuTree}
		</div>,
		document.body
	);
}
