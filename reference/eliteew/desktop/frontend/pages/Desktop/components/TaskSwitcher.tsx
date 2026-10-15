/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Alt+Tab-style desktop window switcher with preview cards and keyboard navigation.
 *
 * Invariants:
 * - ModalAdvanced keeps trapFocus disabled so Tab/arrows/Enter are handled internally.
 * - Visible titles use desktop display-title helpers; technical app ids stay unchanged.
 * - While open, root is a shell keyboard surface so global Win/Alt shortcuts defer.
 * - Escape and navigation keys use capture + stopPropagation via `useShellCaptureKeyboard`.
 *
 * Related:
 * - utils/desktopShellKeyboardCapture.ts
 * - src/pages/Desktop/utils/desktopWindowDisplayTitle.ts
 * - src/pages/Desktop/components/TaskbarPinnedAndWindowsStrip.tsx
 */

import * as React from 'react';
import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { m, useReducedMotion } from 'framer-motion';
import type { WindowState } from '../types/desktop.types';
import type { DesktopIconStyle } from '@/types/profile';
import { cn } from '@/utils/cn';
import { ModalAdvanced } from '@/components/ui/ModalAdvanced';
import { resolveDesktopWindowDisplayTitle } from '../utils/desktopWindowDisplayTitle';
import { DesktopAppBadge } from '../utils/desktopVisualSystem';
import {
	DesktopAppButton,
	DesktopAppSectionLabel,
	DesktopAppStatusBadge,
	DesktopProductStatePanel,
} from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { DESKTOP_TYPOGRAPHY } from '../constants';
import {
	ArrowsPointingInIcon,
	ArrowsPointingOutIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { useShellCaptureKeyboard } from '../hooks/useShellCaptureKeyboard';

interface TaskSwitcherProps {
	isOpen: boolean;
	windows: WindowState[];
	currentWindowId?: string;
	onSelectWindow: (windowId: string) => void;
	onClose: () => void;
	iconStyle?: DesktopIconStyle;
}

export const TaskSwitcher: React.FC<TaskSwitcherProps> = memo(
	function TaskSwitcher({
		isOpen,
		windows,
		currentWindowId,
		onSelectWindow,
		onClose,
		iconStyle = 'glass',
	}) {
		const { t } = useTranslation('desktopUi');
		const reduceMotion = useReducedMotion();
		const windowCardVariants = useMemo(
			() =>
				reduceMotion
					? {
							inactive: { scale: 1, opacity: 0.62 },
							active: { scale: 1, opacity: 1 },
							hover: { scale: 1, opacity: 1 },
						}
					: {
							inactive: { scale: 0.9, opacity: 0.6 },
							active: { scale: 1, opacity: 1 },
							hover: {
								scale: 1.05,
								transition: {
									type: 'spring' as const,
									stiffness: 400,
									damping: 25,
								},
							},
						},
			[reduceMotion]
		);
		const [selectedIndex, setSelectedIndex] = useState(0);
		const selectedIndexRef = useRef(0);
		selectedIndexRef.current = selectedIndex;

		// Order by zIndex descending (topmost first), then by id for stability
		const sortedWindows = useMemo(
			() =>
				[...windows].sort(
					(a, b) => b.zIndex - a.zIndex || a.id.localeCompare(b.id)
				),
			[windows]
		);

		// Find current window index on open (by currentWindowId in sorted list)
		useEffect(() => {
			if (isOpen && currentWindowId) {
				const index = sortedWindows.findIndex((w) => w.id === currentWindowId);
				setSelectedIndex(index >= 0 ? index : 0);
			}
		}, [isOpen, currentWindowId, sortedWindows]);

		const surfaceRef = useRef<HTMLDivElement>(null);

		useEffect(() => {
			if (!isOpen) return;
			const frameId = window.requestAnimationFrame(() => {
				surfaceRef.current?.focus();
			});
			return () => window.cancelAnimationFrame(frameId);
		}, [isOpen]);

		// Handle keyboard navigation (Escape closes, Tab/arrows navigate, Enter selects)
		useShellCaptureKeyboard(isOpen, (e) => {
			if (sortedWindows.length === 0) {
				if (e.key === 'Escape') {
					e.preventDefault();
					e.stopPropagation();
					onClose();
				}
				return;
			}

			if (
				['Tab', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', ' '].includes(
					e.key
				)
			) {
				e.preventDefault();
				e.stopPropagation();
			}
			switch (e.key) {
				case 'Tab':
					setSelectedIndex(
						(i) =>
							(e.shiftKey ? i - 1 + sortedWindows.length : i + 1) %
							sortedWindows.length
					);
					break;
				case 'ArrowRight':
					setSelectedIndex((i) => (i + 1) % sortedWindows.length);
					break;
				case 'ArrowLeft':
					setSelectedIndex(
						(i) => (i - 1 + sortedWindows.length) % sortedWindows.length
					);
					break;
				case 'Enter':
				case ' ': {
					const picked = sortedWindows[selectedIndexRef.current];
					if (picked) {
						onSelectWindow(picked.id);
						onClose();
					}
					break;
				}
				case 'Escape':
					onClose();
					break;
			}
		});

		useEffect(() => {
			if (!isOpen) return;

			const handleKeyUp = (e: KeyboardEvent) => {
				if (e.key !== 'Alt') return;
				const picked = sortedWindows[selectedIndexRef.current];
				if (picked) onSelectWindow(picked.id);
				onClose();
			};

			window.addEventListener('keyup', handleKeyUp);
			return () => window.removeEventListener('keyup', handleKeyUp);
		}, [isOpen, sortedWindows, onSelectWindow, onClose]);

		const getVisibleWindows = useCallback(() => {
			if (sortedWindows.length <= 5) return sortedWindows;
			const start = Math.max(0, selectedIndex - 2);
			const end = Math.min(sortedWindows.length, start + 5);
			return sortedWindows.slice(start, end);
		}, [sortedWindows, selectedIndex]);

		const visibleWindows = getVisibleWindows();

		if (!isOpen) return null;

		return (
			<ModalAdvanced
				isOpen={true}
				onClose={onClose}
				closeOnEscape={false}
				title={t('taskSwitcher.title')}
				size="full"
				variant="desktop"
				showCloseButton={false}
				trapFocus={false}
			>
				<div
					ref={surfaceRef}
					className="p-4 outline-none"
					data-desktop-shell-keyboard-surface=""
					tabIndex={-1}
				>
					{sortedWindows.length === 0 ? (
						<DesktopProductStatePanel
							state="empty"
							title={t('taskSwitcher.emptyTitle')}
							description={t('taskSwitcher.emptyDescription')}
							actions={
								<DesktopChromeTooltip
									content={t('taskSwitcher.emptyAction')}
									placement="top"
									offsetExtra={4}
								>
									<DesktopAppButton type="button" onClick={onClose}>
										{t('taskSwitcher.emptyAction')}
									</DesktopAppButton>
								</DesktopChromeTooltip>
							}
						/>
					) : null}
					{sortedWindows.length > 0 ? (
						<>
							<div className="mb-4 flex items-center justify-center">
								<DesktopAppStatusBadge>
									{t('taskSwitcher.openSummary', {
										count: sortedWindows.length,
									})}
								</DesktopAppStatusBadge>
							</div>

							<div className="flex items-center gap-4">
								{sortedWindows.length > 5 && selectedIndex > 2 && (
									<m.div
										whileHover={reduceMotion ? undefined : { scale: 1.1 }}
										whileTap={reduceMotion ? undefined : { scale: 0.9 }}
									>
										<DesktopChromeTooltip
											content={t('taskSwitcher.prevWindow')}
											placement="top"
											offsetExtra={8}
										>
											<span className="inline-flex">
												<DesktopAppButton
													type="button"
													onClick={() =>
														setSelectedIndex((i) => Math.max(0, i - 1))
													}
													variant="neutral"
													size="icon"
													aria-label={t('taskSwitcher.prevWindow')}
												>
													<ChevronLeftIcon className="w-5 h-5 text-(--desktop-text-muted)" />
												</DesktopAppButton>
											</span>
										</DesktopChromeTooltip>
									</m.div>
								)}

								<div className="flex gap-3">
									{visibleWindows.map((window) => {
										const globalIndex = sortedWindows.indexOf(window);
										const isSelected = globalIndex === selectedIndex;
										const windowTitle =
											resolveDesktopWindowDisplayTitle(window);

										return (
											<m.button
												key={window.id}
												type="button"
												variants={windowCardVariants}
												animate={isSelected ? 'active' : 'inactive'}
												whileHover={reduceMotion ? undefined : 'hover'}
												onClick={() => {
													onSelectWindow(window.id);
													onClose();
												}}
												className={`relative group ${isSelected ? 'z-10' : ''}`}
												aria-label={t('taskSwitcher.selectWindow', {
													title: windowTitle,
												})}
												aria-current={isSelected ? 'true' : undefined}
											>
												<div
													className={`
                          w-[180px] h-[140px] rounded-xl overflow-hidden border-2 transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none
                          ${
														isSelected
															? 'border-[rgb(var(--desktop-accent-rgb))] shadow-lg shadow-[rgb(var(--desktop-accent-rgb)/0.3)]'
															: 'border-(--desktop-border-subtle) hover:border-(--desktop-border-strong)'
													}
                        `}
												>
													{/* Window Preview (simplified) */}
													<div className="w-full h-full relative bg-(--desktop-surface-panel)">
														{/* Title Bar */}
														<div className="h-8 flex items-center gap-2 border-b border-(--desktop-border-subtle) bg-(--desktop-surface-panel-strong) px-3">
															<div className="h-3 w-3 rounded-full bg-red-500/50" />
															<div className="h-3 w-3 rounded-full bg-yellow-500/50" />
															<div className="h-3 w-3 rounded-full bg-green-500/50" />
															<span
																className={cn(
																	'ml-2 flex-1 truncate text-left',
																	DESKTOP_TYPOGRAPHY.shellMeta10
																)}
															>
																<DesktopChromeTooltip
																	content={windowTitle}
																	placement="bottom"
																	offsetExtra={6}
																>
																	<span className="block truncate">
																		{windowTitle}
																	</span>
																</DesktopChromeTooltip>
															</span>
														</div>

														{/* App icon preview */}
														<div className="flex h-[calc(100%-2rem)] items-center justify-center bg-(--desktop-surface-soft) p-2">
															{window.icon ? (
																<DesktopAppBadge
																	appComponent={window.appComponent}
																	icon={window.icon}
																	variant="panel"
																	iconStyle={iconStyle}
																	className="h-14 w-14"
																/>
															) : (
																<div className="flex h-14 w-14 items-center justify-center rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)">
																	<span
																		className={cn(
																			'font-medium',
																			DESKTOP_TYPOGRAPHY.small
																		)}
																	>
																		{t('taskSwitcher.appFallback')}
																	</span>
																</div>
															)}
														</div>

														{/* Window State Indicators */}
														{window.isMinimized && (
															<DesktopChromeTooltip
																content={t('taskSwitcher.minimize')}
																placement="top"
																offsetExtra={6}
															>
																<div className="absolute top-10 right-2">
																	<ArrowsPointingInIcon
																		className="h-4 w-4 text-yellow-500"
																		aria-hidden
																	/>
																	<span className="sr-only">
																		{t('taskSwitcher.minimize')}
																	</span>
																</div>
															</DesktopChromeTooltip>
														)}
														{window.isMaximized && (
															<DesktopChromeTooltip
																content={t('taskSwitcher.maximize')}
																placement="top"
																offsetExtra={6}
															>
																<div className="absolute top-10 right-2">
																	<ArrowsPointingOutIcon
																		className="h-4 w-4 text-green-500"
																		aria-hidden
																	/>
																	<span className="sr-only">
																		{t('taskSwitcher.maximize')}
																	</span>
																</div>
															</DesktopChromeTooltip>
														)}
													</div>

													{/* Selection Indicator */}
													{isSelected &&
														(reduceMotion ? (
															<div
																className="absolute -bottom-3 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[rgb(var(--desktop-accent-rgb))]"
																aria-hidden
															/>
														) : (
															<m.div
																layoutId="task-switcher-selection"
																className="absolute -bottom-3 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[rgb(var(--desktop-accent-rgb))]"
																aria-hidden
															/>
														))}
												</div>

												{/* Window Title */}
												<div className="mt-2 text-xs text-center">
													<DesktopChromeTooltip
														content={windowTitle}
														placement="bottom"
														offsetExtra={6}
													>
														<div
															className={`font-medium truncate px-2 ${
																isSelected
																	? 'text-(--desktop-text-primary)'
																	: 'text-(--desktop-text-muted)'
															}`}
														>
															{windowTitle}
														</div>
													</DesktopChromeTooltip>
												</div>
											</m.button>
										);
									})}
								</div>

								{sortedWindows.length > 5 &&
									selectedIndex < sortedWindows.length - 3 && (
										<m.div
											whileHover={reduceMotion ? undefined : { scale: 1.1 }}
											whileTap={reduceMotion ? undefined : { scale: 0.9 }}
										>
											<DesktopChromeTooltip
												content={t('taskSwitcher.nextWindow')}
												placement="top"
												offsetExtra={8}
											>
												<span className="inline-flex">
													<DesktopAppButton
														type="button"
														onClick={() =>
															setSelectedIndex((i) =>
																Math.min(sortedWindows.length - 1, i + 1)
															)
														}
														variant="neutral"
														size="icon"
														aria-label={t('taskSwitcher.nextWindow')}
													>
														<ChevronRightIcon className="w-5 h-5 text-(--desktop-text-muted)" />
													</DesktopAppButton>
												</span>
											</DesktopChromeTooltip>
										</m.div>
									)}
							</div>

							{/* Instructions */}
							<div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-(--desktop-text-dim)">
								<DesktopAppSectionLabel className="tracking-normal normal-case">
									{t('taskSwitcher.hintNav')}
								</DesktopAppSectionLabel>
								<DesktopAppSectionLabel className="tracking-normal normal-case">
									{t('taskSwitcher.hintSelect')}
								</DesktopAppSectionLabel>
								<DesktopAppSectionLabel className="tracking-normal normal-case">
									{t('taskSwitcher.hintCancel')}
								</DesktopAppSectionLabel>
							</div>
						</>
					) : null}
				</div>
			</ModalAdvanced>
		);
	}
);

// Hook for easier integration
export function useTaskSwitcher(
	windows: WindowState[],
	currentWindowId?: string,
	onSelectWindow?: (windowId: string) => void
) {
	const [isOpen, setIsOpen] = useState(false);

	// Listen for Alt+Tab
	useEffect(() => {
		let altPressed = false;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Alt') {
				altPressed = true;
			}

			if (e.key === 'Tab' && altPressed && !isOpen) {
				e.preventDefault();
				setIsOpen(true);
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.key === 'Alt') {
				altPressed = false;
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	}, [isOpen]);

	const handleClose = useCallback(() => {
		setIsOpen(false);
	}, []);

	const Component = useCallback(
		() => (
			<TaskSwitcher
				isOpen={isOpen}
				windows={windows}
				currentWindowId={currentWindowId}
				onSelectWindow={(id) => {
					onSelectWindow?.(id);
					setIsOpen(false);
				}}
				onClose={handleClose}
			/>
		),
		[isOpen, windows, currentWindowId, onSelectWindow, handleClose]
	);

	return {
		TaskSwitcher: Component,
		openTaskSwitcher: () => setIsOpen(true),
		closeTaskSwitcher: handleClose,
		isOpen,
	};
}
