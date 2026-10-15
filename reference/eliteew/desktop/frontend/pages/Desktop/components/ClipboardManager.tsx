/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop Clipboard history UI: text/image/html history, search, pinning, copy-back, and shell-state persistence.
 *
 * Invariants:
 * - Shell-state persistence must pass through `clipboardHistoryPersistence` caps before PATCH.
 * - Clipboard polling follows `DESKTOP_POLLING.CLIPBOARD_MS`; skips while tab is hidden.
 * - User-visible copy uses `safeCopyToClipboard` for text; image copy keeps native ClipboardItem API.
 * - Modal Escape: search clear then close; suspended while guide tour is open (`consumeEscapeForSearchClear`).
 *
 * Related:
 * - src/pages/Desktop/utils/clipboardHistoryPersistence.ts
 * - hooks/useShellCaptureKeyboard.ts
 * - documentation/product/desktop/DESKTOP-STATE-PERSISTENCE.md
 * - utils/subscribeDocumentVisibleSync.ts
 * - DesktopChromeTooltip.tsx
 */

import * as React from 'react';
import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { cn } from '@/utils/cn';
import { safeCopyToClipboard } from '@/utils/clipboard';
import { notify } from '@/notifications';
import type { DesktopWindowStyle } from '@/types/profile';
import { api } from '../../../services/api/client';
import { log } from '../../../utils/logger';
import { clipboardImageBlobSource } from '../utils/clipboardImageBlobSource';
import { subscribeDocumentVisibleSync } from '../utils/subscribeDocumentVisibleSync';
import {
	DESKTOP_OVERLAY,
	DESKTOP_POLLING,
	DESKTOP_TYPOGRAPHY,
	DESKTOP_Z_INDEX,
} from '../constants';
import { getDesktopShellPanelClassName } from '../utils/desktopVisualSystem';
import {
	type DesktopClipboardShellRecord,
	fetchDesktopShellStateDeduplicated,
} from '../services/desktopApi';
import {
	flushShellStatePipelineNow,
	scheduleShellStateMutation,
	waitForShellStatePipelineFlush,
} from '../utils/desktopShellStateMutationPipeline';
import {
	DESKTOP_CLIPBOARD_SHELL_MAX_ITEMS,
	clipboardItemsToShellRecords,
	shellRecordsToClipboardItems,
} from '../utils/clipboardHistoryPersistence';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
	ClipboardIcon,
	ClockIcon,
	DocumentTextIcon,
	MagnifyingGlassIcon,
	MapPinIcon,
	PhotoIcon,
	StarIcon,
	TrashIcon,
	XMarkIcon,
} from '@heroicons/react/24/outline';

import {
	DESKTOP_CHROME_FOCUS_VISIBLE,
	DesktopAppEmptyState,
} from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { guideTourLabelsFromI18n } from '@/components/guided-tour/guideTourLabelsFromI18n';
import { SpotlightGuideModal } from '@/components/guided-tour/SpotlightGuideModal';
import { useBuiltGuideSteps } from '@/components/guided-tour/useBuiltGuideSteps';
import { useDesktopGuideTourOpener } from '@/pages/Desktop/hooks/useDesktopGuideTourOpener';
import {
	consumeEscapeForSearchClear,
	useShellCaptureEscape,
} from '@/pages/Desktop/hooks/useShellCaptureKeyboard';
import { useTranslation } from 'react-i18next';
import {
	CLIPBOARD_GUIDE_AUDIO_LS_KEY,
	CLIPBOARD_GUIDE_ROOT_ID,
	CLIPBOARD_GUIDE_STEP_DEFS,
	CLIPBOARD_GUIDE_TOUR_FOLDER,
} from './clipboardGuideConstants';
import { formatDesktopRelativeTimeAgo } from '../utils/desktopRelativeTime';
import { useTimeTick } from './notificationHub/useTimeTick';
interface ClipboardItem {
	id: string;
	type: 'text' | 'image' | 'html';
	content: string;
	preview?: string;
	timestamp: Date;
	pinned: boolean;
	source?: string;
}

interface ClipboardManagerProps {
	isOpen?: boolean;
	onClose?: () => void;
	embedded?: boolean;
	shellWindowStyle?: DesktopWindowStyle;
}

/** Matches API shell_state cap (`_MAX_CLIPBOARD_SHELL_ITEMS`). */
const MAX_HISTORY = DESKTOP_CLIPBOARD_SHELL_MAX_ITEMS;
const STORAGE_KEY = 'desktop-clipboard-history';

// Truncate text for preview
function truncateText(text: string, maxLength: number = 100): string {
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength)}...`;
}

export const ClipboardManager: React.FC<ClipboardManagerProps> = memo(
	({
		isOpen = true,
		onClose,
		embedded = false,
		shellWindowStyle = 'glass',
	}) => {
		const reduceMotion = useReducedMotion();
		const { t: tGuide } = useTranslation('desktopUi', {
			keyPrefix: 'clipboardGuide',
		});
		const { t } = useTranslation('desktopUi', {
			keyPrefix: 'clipboardManager',
		});
		const { t: tRelative } = useTranslation('desktopUi', {
			keyPrefix: 'notificationHub',
		});
		const timeRefreshKey = useTimeTick();
		const guideLabels = React.useMemo(
			() => guideTourLabelsFromI18n(tGuide, 'guide'),
			[tGuide]
		);
		const guideSteps = useBuiltGuideSteps(
			tGuide,
			'guide.steps',
			CLIPBOARD_GUIDE_STEP_DEFS
		);
		const [guideOpen, setGuideOpen] = React.useState(false);
		const openGuideTour = React.useCallback(() => setGuideOpen(true), []);
		useDesktopGuideTourOpener(openGuideTour);
		const [history, setHistory] = useState<ClipboardItem[]>([]);
		const [shellHydrated, setShellHydrated] = useState(false);
		const [search, setSearch] = useState('');
		const [selectedId, setSelectedId] = useState<string | null>(null);
		const searchRef = useRef<HTMLInputElement>(null);

		useShellCaptureEscape(
			isOpen && !embedded && Boolean(onClose) && !guideOpen,
			() => {
				onClose?.();
			},
			{
				onLayer: () => consumeEscapeForSearchClear(search, () => setSearch('')),
			}
		);

		useEffect(() => {
			let cancelled = false;
			const loadLegacyLocal = (): void => {
				const saved = localStorage.getItem(STORAGE_KEY);
				if (!saved) return;
				try {
					const parsed = JSON.parse(saved) as ClipboardItem[];
					setHistory(
						parsed.map((item) => ({
							...item,
							timestamp: new Date(item.timestamp),
						}))
					);
				} catch {
					/* invalid */
				}
			};
			void (async () => {
				try {
					const s = await fetchDesktopShellStateDeduplicated();
					if (cancelled) return;
					const rows = s.clipboard_history;
					if (Array.isArray(rows) && rows.length > 0) {
						setHistory(
							shellRecordsToClipboardItems(
								rows as unknown as DesktopClipboardShellRecord[]
							)
						);
					} else {
						const raw = localStorage.getItem(STORAGE_KEY);
						if (raw) {
							try {
								const parsed = JSON.parse(raw) as ClipboardItem[];
								const normalized = parsed.map((item) => ({
									...item,
									timestamp: new Date(item.timestamp),
								}));
								if (normalized.length > 0) {
									setHistory(normalized);
									scheduleShellStateMutation({
										source: 'other',
										merge: () => ({
											clipboard_history:
												clipboardItemsToShellRecords(normalized),
										}),
										immediate: true,
									});
									await flushShellStatePipelineNow('other').catch(() => {});
								}
							} catch {
								/* ignore */
							}
						}
					}
					try {
						localStorage.removeItem(STORAGE_KEY);
					} catch {
						/* ignore */
					}
				} catch {
					if (!cancelled) loadLegacyLocal();
				} finally {
					if (!cancelled) setShellHydrated(true);
				}
			})();
			return () => {
				cancelled = true;
			};
		}, []);

		useEffect(() => {
			if (!shellHydrated) return;
			const capped = history.slice(0, MAX_HISTORY);
			scheduleShellStateMutation({
				source: 'other',
				merge: () => ({
					clipboard_history: clipboardItemsToShellRecords(capped),
				}),
			});
			void waitForShellStatePipelineFlush().catch(() => {});
		}, [history, shellHydrated]);

		// Focus search on open
		useEffect(() => {
			if ((isOpen || embedded) && searchRef.current) {
				setTimeout(() => searchRef.current?.focus(), 100);
			}
		}, [isOpen, embedded]);

		const addToHistory = useCallback(
			(item: Omit<ClipboardItem, 'id' | 'timestamp' | 'pinned'>) => {
				setHistory((prev) => {
					const exists = prev.find(
						(p) => p.content === item.content && !p.pinned
					);
					if (exists) {
						return [
							{ ...exists, timestamp: new Date() },
							...prev.filter((p) => p.id !== exists.id),
						].slice(0, MAX_HISTORY);
					}

					const newItem: ClipboardItem = {
						...item,
						id: `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
						timestamp: new Date(),
						pinned: false,
					};

					return [newItem, ...prev].slice(0, MAX_HISTORY);
				});
			},
			[]
		);

		// Listen for clipboard events
		useEffect(() => {
			if (!isOpen && !embedded) return;

			const _handlePaste = async () => {
				try {
					const clipboardItems = await navigator.clipboard.read();
					for (const item of clipboardItems) {
						// Check for image
						if (item.types.includes('image/png')) {
							const blob = await item.getType('image/png');
							const reader = new FileReader();
							reader.onload = () => {
								addToHistory({
									type: 'image',
									content: reader.result as string,
									preview: reader.result as string,
								});
							};
							reader.readAsDataURL(blob);
						}
						// Check for text
						else if (item.types.includes('text/plain')) {
							const blob = await item.getType('text/plain');
							const text = await blob.text();
							if (text.trim()) {
								addToHistory({
									type: 'text',
									content: text,
								});
							}
						}
					}
				} catch {
					// ClipboardIcon API not available or permission denied
				}
			};

			const pollClipboardText = async () => {
				try {
					const text = await navigator.clipboard.readText();
					if (text?.trim() && history[0]?.content !== text) {
						addToHistory({ type: 'text', content: text });
					}
				} catch {
					// Permission denied
				}
			};

			// Poll clipboard periodically (no native clipboard change event). Min 5s per Desktop polling policy.
			const interval = setInterval(() => {
				if (document.visibilityState !== 'visible') return;
				void pollClipboardText();
			}, DESKTOP_POLLING.CLIPBOARD_MS);

			const unsubVisible = subscribeDocumentVisibleSync(() => {
				void pollClipboardText();
			});

			return () => {
				clearInterval(interval);
				unsubVisible();
			};
		}, [isOpen, embedded, history, addToHistory]);

		// Copy item to clipboard
		const copyItem = useCallback(
			async (item: ClipboardItem) => {
				try {
					if (item.type === 'image') {
						const blob =
							clipboardImageBlobSource(item.content) === 'api'
								? await api.get<Blob>(item.content, { responseType: 'blob' })
								: await (await fetch(item.content)).blob();
						await navigator.clipboard.write([
							new ClipboardItem({ [blob.type]: blob }),
						]);
						notify.success(t('copyDone'));
					} else {
						const copied = await safeCopyToClipboard(item.content);
						if (copied) {
							notify.success(t('copyDone'));
						} else {
							notify.error(t('copyFailed'));
							return;
						}
					}
					onClose?.();
				} catch (err) {
					notify.error(t('copyFailed'));
					log.error(
						'ClipboardManager',
						'Failed to copy',
						err instanceof Error ? err : undefined
					);
				}
			},
			[onClose, t]
		);

		// Toggle pin
		const togglePin = useCallback((id: string) => {
			setHistory((prev) =>
				prev.map((item) =>
					item.id === id ? { ...item, pinned: !item.pinned } : item
				)
			);
		}, []);

		// Delete item
		const deleteItem = useCallback((id: string) => {
			setHistory((prev) => prev.filter((item) => item.id !== id));
		}, []);

		// Clear all (except pinned)
		const clearHistory = useCallback(() => {
			setHistory((prev) => prev.filter((item) => item.pinned));
		}, []);

		// Filter history
		const filteredHistory = history.filter((item) => {
			if (!search) return true;
			const searchLower = search.toLowerCase();
			return item.content.toLowerCase().includes(searchLower);
		});

		// Sort: pinned first, then by timestamp
		const sortedHistory = [...filteredHistory].sort((a, b) => {
			if (a.pinned && !b.pinned) return -1;
			if (!a.pinned && b.pinned) return 1;
			return b.timestamp.getTime() - a.timestamp.getTime();
		});

		if (!isOpen && !embedded) return null;

		const content = (
			<div
				id={embedded ? CLIPBOARD_GUIDE_ROOT_ID : undefined}
				className="relative flex h-full flex-col bg-transparent text-(--desktop-text-primary)"
			>
				<div
					data-cb-guide="header"
					className="relative flex items-center justify-between border-b border-(--desktop-border-subtle) px-4 py-3"
				>
					<div className="flex items-center gap-3">
						<div
							className="flex h-9 w-9 items-center justify-center rounded-xl border border-[rgb(var(--desktop-fg-primary-rgb)/0.1)] bg-[linear-gradient(135deg,rgb(var(--desktop-accent-rgb)/0.3),rgb(var(--desktop-accent-rgb)/0.1))] shadow-[inset_0_1px_0_rgb(var(--desktop-fg-primary-rgb)/0.06)]"
							aria-hidden
						>
							<ClipboardIcon className="h-5 w-5 text-(--desktop-text-primary)" />
						</div>
						<div>
							<h2 className="text-base font-semibold text-(--desktop-text-primary)">
								{t('title')}
							</h2>
							<p className={cn(DESKTOP_TYPOGRAPHY.meta)}>
								{t('meta', { count: history.length })}
							</p>
						</div>
					</div>
					{!embedded && onClose && (
						<DesktopChromeTooltip
							content={t('close')}
							placement="bottom"
							offsetExtra={4}
						>
							<button
								type="button"
								onClick={onClose}
								className={cn(
									'rounded-lg p-2 text-(--desktop-text-muted) transition-colors hover:bg-(--desktop-surface-soft) hover:text-(--desktop-text-primary)',
									DESKTOP_CHROME_FOCUS_VISIBLE
								)}
								aria-label={t('close')}
							>
								<XMarkIcon className="h-5 w-5" />
							</button>
						</DesktopChromeTooltip>
					)}
				</div>

				{/* MagnifyingGlassIcon */}
				<div
					data-cb-guide="search"
					className="border-b border-(--desktop-border-subtle) px-4 py-3"
				>
					<div className="relative">
						<MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--desktop-text-muted)" />
						<input
							ref={searchRef}
							type="text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder={t('searchPlaceholder')}
							className={cn(
								'w-full rounded-(--desktop-radius) border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) py-2 pl-10 pr-4 text-sm text-(--desktop-text-primary) placeholder:text-(--desktop-text-dim)',
								'outline-none transition-colors duration-200 focus:border-(--desktop-border-strong) focus:bg-(--desktop-surface-soft-hover) focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)] motion-reduce:transition-none'
							)}
						/>
					</div>
				</div>

				{/* Actions */}
				<div className="flex items-center justify-between border-b border-(--desktop-border-subtle) px-4 py-2">
					<span className="text-xs text-(--desktop-text-dim)">
						{t('pinnedCount', {
							count: sortedHistory.filter((i) => i.pinned).length,
						})}
					</span>
					<DesktopChromeTooltip
						content={t('clear')}
						placement="top"
						offsetExtra={4}
					>
						<button
							type="button"
							onClick={clearHistory}
							className={cn(
								DESKTOP_TYPOGRAPHY.meta,
								'flex items-center gap-1 transition-colors hover:text-[color-mix(in_srgb,rgb(248_113_113)_75%,var(--desktop-text-primary))]',
								DESKTOP_CHROME_FOCUS_VISIBLE
							)}
							aria-label={t('clearAria')}
						>
							<TrashIcon className="h-3 w-3" />
							{t('clear')}
						</button>
					</DesktopChromeTooltip>
				</div>

				{/* History List */}
				<div className="flex-1 overflow-y-auto" data-cb-guide="history">
					{sortedHistory.length === 0 ? (
						<DesktopAppEmptyState
							className="min-h-[200px]"
							icon={
								<ClipboardIcon className="h-8 w-8 text-(--desktop-text-muted)" />
							}
							title={t('emptyTitle')}
							description={t('emptyDescription')}
						/>
					) : (
						<div className="p-2 space-y-1">
							{sortedHistory.map((item) => (
								<m.div
									key={item.id}
									initial={reduceMotion ? false : { opacity: 0, y: -10 }}
									animate={reduceMotion ? false : { opacity: 1, y: 0 }}
									exit={reduceMotion ? undefined : { opacity: 0, x: -20 }}
									transition={
										reduceMotion ? { duration: 0 } : { duration: 0.2 }
									}
									className={cn(
										'group relative cursor-pointer rounded-(--desktop-radius) border p-3 transition-colors',
										selectedId === item.id
											? 'border-[rgb(var(--desktop-accent-rgb)/0.4)] bg-(--desktop-surface-accent)'
											: 'border-transparent bg-(--desktop-surface-soft)/40 hover:bg-(--desktop-surface-soft)'
									)}
									onClick={() => copyItem(item)}
									onContextMenu={(e) => {
										e.preventDefault();
										setSelectedId(item.id);
									}}
								>
									{/* MapPinIcon indicator */}
									{item.pinned && (
										<div className="absolute top-2 right-2">
											<StarIcon className="w-3 h-3 text-amber-400 fill-amber-400" />
										</div>
									)}

									{/* Content */}
									<div className="flex items-start gap-3">
										<div
											className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
												item.type === 'image'
													? 'bg-pink-500/20'
													: 'bg-blue-500/20'
											}`}
										>
											{item.type === 'image' ? (
												<PhotoIcon className="w-4 h-4 text-pink-400" />
											) : (
												<DocumentTextIcon className="w-4 h-4 text-blue-400" />
											)}
										</div>

										<div className="flex-1 min-w-0">
											{item.type === 'image' ? (
												<img
													src={item.content}
													alt={t('imageAlt')}
													className="max-h-20 rounded-(--desktop-radius) border border-(--desktop-border-subtle)"
												/>
											) : (
												<p className="text-sm text-(--desktop-text-primary) break-all whitespace-pre-wrap">
													{truncateText(item.content, 150)}
												</p>
											)}

											<div
												className="mt-2 flex items-center gap-2 text-xs text-(--desktop-text-dim)"
												data-time-refresh={timeRefreshKey}
											>
												<ClockIcon className="w-3 h-3" />
												<span>
													{formatDesktopRelativeTimeAgo(
														item.timestamp,
														tRelative
													)}
												</span>
											</div>
										</div>
									</div>

									{/* Hover actions */}
									<div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
										<DesktopChromeTooltip
											content={item.pinned ? t('unpin') : t('pin')}
											placement="top"
											offsetExtra={4}
										>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													togglePin(item.id);
												}}
												className={cn(
													'rounded p-1.5 transition-colors hover:bg-(--desktop-surface-soft-hover)',
													DESKTOP_CHROME_FOCUS_VISIBLE,
													item.pinned
														? 'text-amber-400'
														: 'text-(--desktop-text-muted) hover:text-amber-400'
												)}
											>
												<MapPinIcon className="h-3.5 w-3.5" />
											</button>
										</DesktopChromeTooltip>
										<DesktopChromeTooltip
											content={t('delete')}
											placement="top"
											offsetExtra={4}
										>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													deleteItem(item.id);
												}}
												className={cn(
													'rounded p-1.5 text-(--desktop-text-muted) transition-colors hover:bg-(--desktop-surface-soft-hover) hover:text-[color-mix(in_srgb,rgb(248_113_113)_80%,var(--desktop-text-primary))]',
													DESKTOP_CHROME_FOCUS_VISIBLE
												)}
											>
												<TrashIcon className="h-3.5 w-3.5" />
											</button>
										</DesktopChromeTooltip>
									</div>
								</m.div>
							))}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between border-t border-(--desktop-border-subtle) px-4 py-2 text-xs text-(--desktop-text-dim)">
					<span>{t('clickToPaste')}</span>
					<span className="font-medium text-[rgb(var(--desktop-accent-rgb)/0.95)]">
						Win+V
					</span>
				</div>
				{embedded ? (
					<SpotlightGuideModal
						open={guideOpen}
						onClose={() => setGuideOpen(false)}
						rootId={CLIPBOARD_GUIDE_ROOT_ID}
						steps={guideSteps}
						audioLocalStorageKey={CLIPBOARD_GUIDE_AUDIO_LS_KEY}
						tourAudioFolder={CLIPBOARD_GUIDE_TOUR_FOLDER}
						labels={guideLabels}
						dialogTitleId="clipboard-guide-title"
					/>
				) : null}
			</div>
		);

		// Embedded mode
		if (embedded) {
			return content;
		}

		// Modal mode
		return (
			<AnimatePresence>
				<m.div
					initial={reduceMotion ? false : { opacity: 0 }}
					animate={reduceMotion ? false : { opacity: 1 }}
					exit={reduceMotion ? undefined : { opacity: 0 }}
					transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
					className={`fixed inset-0 ${DESKTOP_OVERLAY.backdrop}`}
					style={{ zIndex: DESKTOP_Z_INDEX.MODAL }}
					onClick={onClose}
				/>
				<m.div
					initial={reduceMotion ? false : { opacity: 0, scale: 0.98, y: 12 }}
					animate={reduceMotion ? false : { opacity: 1, scale: 1, y: 0 }}
					exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98, y: 12 }}
					transition={
						reduceMotion
							? { duration: 0 }
							: { type: 'spring', stiffness: 420, damping: 32 }
					}
					className={cn(
						'fixed top-1/2 left-1/2 h-[min(500px,calc(100vh-3rem))] w-[min(400px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2',
						getDesktopShellPanelClassName(shellWindowStyle, 'strong')
					)}
					style={{ zIndex: DESKTOP_Z_INDEX.MODAL_CONTENT }}
					data-desktop-shell-keyboard-surface=""
				>
					{content}
				</m.div>
			</AnimatePresence>
		);
	}
);

ClipboardManager.displayName = 'ClipboardManager';

export default ClipboardManager;
