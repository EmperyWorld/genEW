/**
 * Virtual Desktops Component
 * Панель виртуальных рабочих столов в стиле Windows 11.
 * State is provided by parent (single source: useVirtualDesktops in DesktopWorkspaceContent).
 */

import { m, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { notify } from '@/notifications';
import type { VirtualDesktop } from '../hooks/useVirtualDesktops';
import { useVirtualDesktopFirstUseHint } from '../hooks/useVirtualDesktopFirstUseHint';
import { useDesktopShellMotionPrefs } from '../context/DesktopShellMotionPrefsContext';
import { desktopShellTransitionDurationSec } from '../utils/desktopShellMotion';
import {
	DESKTOP_INTERACTIVE,
	DESKTOP_LUCIDE,
	DESKTOP_TYPOGRAPHY,
} from '../constants';
import { useDesktopWindowPortalStackBase } from '../context/DesktopWindowPortalStackContext';
import { useFinePointerHover } from '../hooks/useFinePointerHover';
import {
	getDesktopPortalShellProps,
	getFloatingMenuPosition,
} from '../utils/desktopUi';
import {
	ComputerDesktopIcon,
	PencilIcon,
	PlusIcon,
	Squares2X2Icon,
	TrashIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';

import {
	DesktopAppButton,
	DesktopAppMenuDivider,
	DesktopAppMenuItem,
	DesktopAppMenuSurface,
} from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

export type VirtualDesktopWorkspaceQuickScenario = {
	id: string;
	name: string;
	desktopId?: string;
};

export interface VirtualDesktopsProps {
	className?: string;
	desktops: VirtualDesktop[];
	activeDesktopId: string;
	activeDesktopIndex: number;
	createDesktop: (name?: string) => void;
	deleteDesktop: (id: string) => void;
	switchToDesktop: (id: string) => void;
	updateDesktopName?: (id: string, name: string) => void;
	/** Saved workspace scenarios bound to each virtual desktop id (count). */
	workspaceScenarioCountByDesktopId?: Readonly<Record<string, number>>;
	/** Taskbar: open a saved scenario without opening full settings. */
	workspaceQuickScenarios?: readonly VirtualDesktopWorkspaceQuickScenario[];
	onOpenWorkspaceQuickScenario?: (profileId: string) => void;
	/** Highlight strip target while dragging a window over a desktop button. */
	vdDropHoverId?: string | null;
}

type VdCtxMenu =
	| null
	| { kind: 'desktop'; desktopId: string; x: number; y: number }
	| { kind: 'add'; x: number; y: number };

export function VirtualDesktops({
	className = '',
	desktops,
	activeDesktopId,
	activeDesktopIndex,
	createDesktop,
	deleteDesktop,
	switchToDesktop,
	updateDesktopName,
	workspaceScenarioCountByDesktopId = {},
	workspaceQuickScenarios,
	onOpenWorkspaceQuickScenario,
	vdDropHoverId = null,
}: VirtualDesktopsProps) {
	const { t } = useTranslation('desktopUi');
	const portalStackBase = useDesktopWindowPortalStackBase();
	const { reduceMotion, speed, speedScale } = useDesktopShellMotionPrefs();
	const vdTransitionSec = desktopShellTransitionDurationSec(
		reduceMotion,
		speed
	);
	const finePointerHover = useFinePointerHover();
	const { showHint: showFirstUseHint, dismissHint: dismissFirstUseHint } =
		useVirtualDesktopFirstUseHint(desktops.length);
	const stripRef = useRef<HTMLElement>(null);
	const [ctxMenu, setCtxMenu] = useState<VdCtxMenu>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const quickScenariosWrapRef = useRef<HTMLDivElement>(null);
	const [quickScenariosOpen, setQuickScenariosOpen] = useState(false);
	const [inlineRenameDesktopId, setInlineRenameDesktopId] = useState<
		string | null
	>(null);
	const [inlineRenameDraft, setInlineRenameDraft] = useState('');
	const inlineRenameRef = useRef<HTMLInputElement>(null);

	const closeMenu = useCallback(() => setCtxMenu(null), []);

	const commitInlineRename = useCallback(
		(desktopId: string) => {
			if (!updateDesktopName) {
				setInlineRenameDesktopId(null);
				return;
			}
			const trimmed = inlineRenameDraft.trim();
			if (!trimmed) {
				notify.error(t('virtualDesktops.renameInvalid'));
				inlineRenameRef.current?.focus();
				return;
			}
			updateDesktopName(desktopId, trimmed);
			setInlineRenameDesktopId(null);
		},
		[inlineRenameDraft, t, updateDesktopName]
	);

	const startInlineRename = useCallback(
		(desktopId: string, currentName: string) => {
			if (!updateDesktopName) return;
			setInlineRenameDesktopId(desktopId);
			setInlineRenameDraft(currentName);
			closeMenu();
		},
		[closeMenu, updateDesktopName]
	);

	useEffect(() => {
		if (inlineRenameDesktopId == null) return;
		inlineRenameRef.current?.focus();
		inlineRenameRef.current?.select();
	}, [inlineRenameDesktopId]);

	const attemptDeleteDesktop = useCallback(
		(desktopId: string) => {
			if (desktopId === activeDesktopId) {
				notify.info(
					t('virtualDesktops.deleteActiveBlockedTitle'),
					t('virtualDesktops.deleteActiveBlockedBody')
				);
				return;
			}
			deleteDesktop(desktopId);
		},
		[activeDesktopId, deleteDesktop, t]
	);

	useEffect(() => {
		const root = stripRef.current;
		if (!root || typeof document === 'undefined') {
			return;
		}
		const ae = document.activeElement;
		if (!ae || !root.contains(ae)) {
			return;
		}
		const safeId =
			typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
				? CSS.escape(activeDesktopId)
				: activeDesktopId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
		const btn = root.querySelector<HTMLElement>(
			`[data-vd-id="${safeId}"][data-vd-switch="true"]`
		);
		requestAnimationFrame(() => btn?.focus());
	}, [activeDesktopId]);

	useEffect(() => {
		if (!ctxMenu) return;

		const onDocMouseDown = (ev: MouseEvent) => {
			const t = ev.target as Node | null;
			if (t && menuRef.current?.contains(t)) return;
			closeMenu();
		};
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.key === 'Escape') {
				ev.preventDefault();
				closeMenu();
			}
		};
		document.addEventListener('mousedown', onDocMouseDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onDocMouseDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [ctxMenu, closeMenu]);

	useEffect(() => {
		if (!quickScenariosOpen) return;

		const onDocMouseDown = (ev: MouseEvent) => {
			const node = ev.target as Node | null;
			if (node && quickScenariosWrapRef.current?.contains(node)) return;
			setQuickScenariosOpen(false);
		};
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.key === 'Escape') {
				ev.preventDefault();
				setQuickScenariosOpen(false);
			}
		};
		document.addEventListener('mousedown', onDocMouseDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onDocMouseDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [quickScenariosOpen]);

	const openDesktopMenu = useCallback(
		(e: React.MouseEvent, desktopId: string) => {
			e.preventDefault();
			e.stopPropagation();
			setCtxMenu({
				kind: 'desktop',
				desktopId,
				x: e.clientX,
				y: e.clientY,
			});
		},
		[]
	);

	const openAddMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setCtxMenu({ kind: 'add', x: e.clientX, y: e.clientY });
	}, []);

	const handleRename = useCallback(
		(desktopId: string, currentName: string) => {
			startInlineRename(desktopId, currentName);
		},
		[startInlineRename]
	);

	const ctxDesktop =
		ctxMenu?.kind === 'desktop'
			? desktops.find((d) => d.id === ctxMenu.desktopId)
			: undefined;

	const activeStripDesktop =
		activeDesktopIndex >= 0 ? desktops[activeDesktopIndex] : undefined;
	const activeStripName = activeStripDesktop?.name?.trim() ?? '';

	const { style: portalShellStyle, theme: portalTheme } =
		getDesktopPortalShellProps();

	const menuHeightDesktop = updateDesktopName ? 200 : 160;
	const menuWidth = 220;

	const pos =
		ctxMenu?.kind === 'desktop'
			? getFloatingMenuPosition(
					{ x: ctxMenu.x, y: ctxMenu.y },
					{
						menuWidth,
						menuHeight: menuHeightDesktop,
						preferAbove: true,
					}
				)
			: ctxMenu?.kind === 'add'
				? getFloatingMenuPosition(
						{ x: ctxMenu.x, y: ctxMenu.y },
						{
							menuWidth,
							menuHeight: 52,
							preferAbove: true,
						}
					)
				: null;

	const menuPortal =
		ctxMenu && pos ? (
			<div
				style={portalShellStyle}
				className={portalTheme === 'dark' ? 'dark' : ''}
			>
				<div
					ref={menuRef}
					role="menu"
					aria-label={t('virtualDesktops.ctxMenuAria')}
					className="fixed text-(--desktop-text-primary)"
					style={{
						left: pos.x,
						top: pos.y,
						zIndex: portalStackBase,
					}}
					onPointerDown={(e) => e.stopPropagation()}
				>
					{ctxMenu.kind === 'add' ? (
						<DesktopAppMenuSurface className="min-w-[200px] ring-1 ring-(--desktop-border-menu)">
							<DesktopAppMenuItem
								type="button"
								icon={
									<PlusIcon
										className="h-4 w-4"
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								}
								onClick={() => {
									createDesktop();
									closeMenu();
								}}
								className={DESKTOP_INTERACTIVE.focusRing}
							>
								{t('virtualDesktops.ctxNewDesktop')}
							</DesktopAppMenuItem>
						</DesktopAppMenuSurface>
					) : ctxDesktop ? (
						<DesktopAppMenuSurface className="min-w-[200px] ring-1 ring-(--desktop-border-menu)">
							{!ctxDesktop.isActive ? (
								<DesktopAppMenuItem
									type="button"
									icon={
										<ComputerDesktopIcon
											className="h-4 w-4"
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
									}
									onClick={() => {
										switchToDesktop(ctxDesktop.id);
										closeMenu();
									}}
									className={DESKTOP_INTERACTIVE.focusRing}
								>
									{t('virtualDesktops.ctxSwitch')}
								</DesktopAppMenuItem>
							) : null}
							{updateDesktopName ? (
								<DesktopAppMenuItem
									type="button"
									icon={
										<PencilIcon
											className="h-4 w-4"
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
									}
									onClick={() => handleRename(ctxDesktop.id, ctxDesktop.name)}
									className={DESKTOP_INTERACTIVE.focusRing}
								>
									{t('virtualDesktops.ctxRename')}
								</DesktopAppMenuItem>
							) : null}
							{desktops.length > 1 ? (
								<>
									<DesktopAppMenuDivider />
									<DesktopAppMenuItem
										type="button"
										tone="danger"
										icon={
											<TrashIcon
												className="h-4 w-4"
												strokeWidth={DESKTOP_LUCIDE.stroke}
											/>
										}
										onClick={() => {
											attemptDeleteDesktop(ctxDesktop.id);
											closeMenu();
										}}
										className={DESKTOP_INTERACTIVE.focusRing}
									>
										{t('virtualDesktops.ctxDelete')}
									</DesktopAppMenuItem>
								</>
							) : null}
						</DesktopAppMenuSurface>
					) : null}
				</div>
			</div>
		) : null;

	return (
		<>
			<section
				ref={stripRef}
				data-desktop-welcome-guide="virtual-desktops"
				className={`flex max-w-full min-w-0 items-center gap-0.5 px-1 ${className}`}
				aria-label={
					activeStripName
						? t('virtualDesktops.stripAriaWithName', {
								name: activeStripName,
								active: activeDesktopIndex + 1,
								total: desktops.length,
							})
						: t('virtualDesktops.counter', {
								active: activeDesktopIndex + 1,
								total: desktops.length,
							})
				}
			>
				<div className="flex min-w-0 items-center gap-[3px]">
					<AnimatePresence>
						{desktops.map((desktop, index) => (
							<m.div
								key={desktop.id}
								initial={
									reduceMotion
										? { opacity: 1, scale: 1 }
										: { opacity: 0, scale: 0.92 }
								}
								animate={{ opacity: 1, scale: 1 }}
								exit={
									reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }
								}
								transition={
									reduceMotion
										? { duration: 0 }
										: {
												duration: vdTransitionSec,
												delay: index * 0.04 * speedScale,
											}
								}
								className="group relative"
							>
								{inlineRenameDesktopId === desktop.id ? (
									<input
										ref={inlineRenameRef}
										type="text"
										value={inlineRenameDraft}
										onChange={(e) => setInlineRenameDraft(e.target.value)}
										onBlur={() => commitInlineRename(desktop.id)}
										onClick={(e) => e.stopPropagation()}
										onKeyDown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												commitInlineRename(desktop.id);
											}
											if (e.key === 'Escape') {
												e.preventDefault();
												setInlineRenameDesktopId(null);
											}
										}}
										className={cn(
											'h-[30px] w-30 rounded-lg border border-[rgb(var(--desktop-accent-rgb)/0.45)] bg-(--desktop-surface-panel) px-2 text-xs text-(--desktop-text-primary) outline-none',
											DESKTOP_INTERACTIVE.focusRing
										)}
										aria-label={t('virtualDesktops.inlineRenameAria')}
									/>
								) : (
									<DesktopChromeTooltip
										content={
											desktop.isActive && showFirstUseHint
												? t('virtualDesktops.firstUseHint')
												: `${t('virtualDesktops.desktopTitle', {
														index: index + 1,
													})}${
														(
															workspaceScenarioCountByDesktopId[desktop.id] ?? 0
														) > 0
															? ` — ${t(
																	'virtualDesktops.scenarioProfilesOnDesktopTitle',
																	{
																		count:
																			workspaceScenarioCountByDesktopId[
																				desktop.id
																			] ?? 0,
																	}
																)}`
															: ''
													}`
										}
										placement="top"
										offsetExtra={8}
									>
										<span className="inline-flex">
											<DesktopAppButton
												data-vd-id={desktop.id}
												data-vd-switch="true"
												data-vd-drop-target={desktop.id}
												onClick={() => {
													if (desktop.isActive && showFirstUseHint) {
														dismissFirstUseHint();
													}
													switchToDesktop(desktop.id);
												}}
												onContextMenu={(e) => openDesktopMenu(e, desktop.id)}
												type="button"
												variant="ghost"
												size="icon"
												aria-current={desktop.isActive ? 'true' : undefined}
												aria-label={t('virtualDesktops.desktopAria', {
													index: index + 1,
												})}
												className={`
                  relative flex size-[30px]! min-h-[30px]! min-w-[30px]! items-center justify-center rounded-lg transition-[opacity,box-shadow,border-color] duration-200 motion-reduce:transition-none
                  bg-[color-mix(in_srgb,var(--glass-bg-strong)_82%,var(--desktop-surface-app)_18%)]
                  border border-[rgb(var(--desktop-fg-primary-rgb)/0.08)]
                  shadow-[0_1px_6px_rgba(15,23,42,0.1)]
                  ${desktop.isActive ? 'ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.5)] shadow-[0_2px_10px_rgba(15,23,42,0.14)]' : 'opacity-[0.88] fine-hover:opacity-100 fine-hover:border-[rgb(var(--desktop-fg-primary-rgb)/0.14)]'}
                  ${vdDropHoverId === desktop.id ? 'ring-2 ring-[rgb(var(--desktop-accent-rgb))] scale-105' : ''}
                  text-[rgb(var(--desktop-fg-primary-rgb)/0.92)]
                `}
											>
												<ComputerDesktopIcon
													className="h-3 w-3 shrink-0 opacity-90"
													aria-hidden
												/>
												{desktop.isActive ? (
													<span
														className="absolute bottom-0.5 left-1/2 h-0.5 w-2.5 -translate-x-1/2 rounded-full bg-[rgb(var(--desktop-accent-rgb))]"
														aria-hidden
													/>
												) : null}
												{(workspaceScenarioCountByDesktopId[desktop.id] ?? 0) >
												0 ? (
													<span
														className={cn(
															'pointer-events-none absolute -right-0.5 -top-0.5 flex h-[13px] min-w-[13px] items-center justify-center rounded-full bg-[rgb(var(--desktop-accent-rgb)/0.92)] px-0.5 font-semibold leading-none text-white shadow-sm',
															DESKTOP_TYPOGRAPHY.micro
														)}
														aria-hidden
													>
														{t('virtualDesktops.scenarioProfilesBadge', {
															count:
																workspaceScenarioCountByDesktopId[desktop.id] ??
																0,
														})}
													</span>
												) : null}
											</DesktopAppButton>
										</span>
									</DesktopChromeTooltip>
								)}

								<div className="pointer-events-none absolute -top-1 -right-1 flex gap-1 opacity-0 transition-opacity fine-group-hover:pointer-events-auto fine-group-hover:opacity-100">
									<div className="flex gap-1">
										{desktops.length > 1 && !desktop.isActive && (
											<DesktopChromeTooltip
												content={t('virtualDesktops.deleteTitle')}
												placement="top"
												offsetExtra={6}
											>
												<button
													onClick={(e) => {
														e.stopPropagation();
														attemptDeleteDesktop(desktop.id);
													}}
													type="button"
													className={cn(
														'flex size-4 min-h-4 min-w-4 items-center justify-center rounded border border-(--desktop-border-subtle) bg-(--desktop-surface-panel) text-(--desktop-text-secondary) fine-hover:border-red-500/35 fine-hover:bg-red-500/14 fine-hover:text-red-200',
														DESKTOP_INTERACTIVE.focusRing
													)}
													aria-label={t('virtualDesktops.deleteTitle')}
												>
													<XMarkIcon className="h-2.5 w-2.5" aria-hidden />
												</button>
											</DesktopChromeTooltip>
										)}
									</div>
								</div>
							</m.div>
						))}
					</AnimatePresence>

					<DesktopChromeTooltip
						content={t('virtualDesktops.addTitle')}
						placement="top"
						offsetExtra={8}
					>
						<m.button
							onClick={() => createDesktop()}
							onContextMenu={openAddMenu}
							type="button"
							className={`
            ml-0.5 flex size-[30px] min-h-[30px] min-w-[30px] items-center justify-center rounded-lg
            bg-[color-mix(in_srgb,var(--glass-bg-strong)_78%,var(--desktop-surface-app)_22%)]
            border border-[rgb(var(--desktop-fg-primary-rgb)/0.08)] text-[rgb(var(--desktop-fg-secondary-rgb)/0.95)]
            shadow-[0_1px_6px_rgba(15,23,42,0.1)]
            fine-hover:border-[rgb(var(--desktop-fg-primary-rgb)/0.16)] fine-hover:text-[rgb(var(--desktop-fg-primary-rgb))]
            transition-[border-color,box-shadow,color] duration-200 motion-reduce:transition-none ${DESKTOP_INTERACTIVE.focusRing}
          `}
							whileHover={
								finePointerHover && !reduceMotion ? { scale: 1.03 } : undefined
							}
							whileTap={reduceMotion ? undefined : { scale: 0.97 }}
							aria-label={t('virtualDesktops.addAria')}
						>
							<PlusIcon className="h-3 w-3" aria-hidden />
						</m.button>
					</DesktopChromeTooltip>
				</div>

				<DesktopChromeTooltip
					content={
						activeStripName
							? `${activeStripName} · ${activeDesktopIndex + 1}/${desktops.length}`
							: t('virtualDesktops.counter', {
									active: activeDesktopIndex + 1,
									total: desktops.length,
								})
					}
					placement="top"
					offsetExtra={8}
				>
					<div
						className={cn(
							'ml-0.5 flex max-w-[min(11rem,42vw)] min-w-0 items-center gap-1 rounded-full border border-(--desktop-border-subtle)/90 bg-(--desktop-surface-soft)/90 px-1.5 py-px',
							DESKTOP_TYPOGRAPHY.shellVirtualDesktopCounter
						)}
						aria-hidden
					>
						<span className="min-w-0 truncate">
							{activeStripName ||
								t('virtualDesktops.desktopTitle', {
									index: activeDesktopIndex + 1,
								})}
						</span>
						<span className="shrink-0 tabular-nums opacity-75">
							{activeDesktopIndex + 1}/{desktops.length}
						</span>
					</div>
				</DesktopChromeTooltip>
				{workspaceQuickScenarios &&
				workspaceQuickScenarios.length > 0 &&
				onOpenWorkspaceQuickScenario ? (
					<div className="relative ml-0.5" ref={quickScenariosWrapRef}>
						<DesktopChromeTooltip
							content={t('virtualDesktops.workspaceQuickScenariosTitle')}
							placement="top"
							offsetExtra={8}
						>
							<span className="inline-flex">
								<DesktopAppButton
									type="button"
									variant="ghost"
									size="icon"
									aria-expanded={quickScenariosOpen}
									className="flex size-[30px]! min-h-[30px]! min-w-[30px]! shrink-0 rounded-lg border border-[rgb(var(--desktop-fg-primary-rgb)/0.08)] bg-[color-mix(in_srgb,var(--glass-bg-strong)_82%,var(--desktop-surface-app)_18%)] text-[rgb(var(--desktop-fg-primary-rgb)/0.92)] shadow-[0_1px_6px_rgba(15,23,42,0.1)]"
									onClick={() => setQuickScenariosOpen((open) => !open)}
									aria-label={t('virtualDesktops.workspaceQuickScenariosAria')}
								>
									<Squares2X2Icon
										className="h-3 w-3 shrink-0 opacity-90"
										aria-hidden
									/>
								</DesktopAppButton>
							</span>
						</DesktopChromeTooltip>
						{quickScenariosOpen ? (
							<div
								className="absolute right-0 top-full mt-1"
								style={{ zIndex: portalStackBase }}
								role="presentation"
								onPointerDown={(e) => e.stopPropagation()}
							>
								<DesktopAppMenuSurface className="max-h-[min(50vh,320px)] min-w-[220px] overflow-y-auto ring-1 ring-(--desktop-border-menu)">
									{workspaceQuickScenarios.map((s) => {
										const deskName =
											s.desktopId != null && s.desktopId !== ''
												? desktops.find((d) => d.id === s.desktopId)?.name
												: undefined;
										const trimmedDesk = deskName?.trim();
										const itemTitle =
											trimmedDesk != null && trimmedDesk !== ''
												? `${s.name} (${trimmedDesk})`
												: s.name;
										return (
											<DesktopChromeTooltip
												key={s.id}
												content={itemTitle}
												placement="left"
												offsetExtra={4}
											>
												<DesktopAppMenuItem
													type="button"
													onClick={() => {
														onOpenWorkspaceQuickScenario(s.id);
														setQuickScenariosOpen(false);
														closeMenu();
													}}
													className={DESKTOP_INTERACTIVE.focusRing}
												>
													{itemTitle}
												</DesktopAppMenuItem>
											</DesktopChromeTooltip>
										);
									})}
								</DesktopAppMenuSurface>
							</div>
						) : null}
					</div>
				) : null}
			</section>
			{typeof document !== 'undefined' && menuPortal
				? createPortal(menuPortal, document.body)
				: null}
		</>
	);
}
