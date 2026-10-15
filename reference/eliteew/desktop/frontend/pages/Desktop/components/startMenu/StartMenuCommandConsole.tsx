/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Start Menu Command Console mode — search-first launcher using the shared
 * desktop fuzzy ranker (Single Brain with Quick Search).
 *
 * Invariants:
 * - Empty query shows pinned + recent apps (not category wall).
 * - Enter launches selected hit; Escape clears query then closes.
 * - Uses `rankDesktopAppsForQuery` — no local scoring fork.
 * - Plain mount/unmount (no Framer panel motion) for RDP-safe paint.
 *
 * Related:
 * - `../StartMenu.tsx`, `../../utils/desktopLauncherFuzzySearch.ts`
 * - `./startMenuShared.types.ts`, `./StartMenuFooterChrome.tsx`
 */

import { cn } from '@/utils/cn';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../../contexts/AuthContext';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import {
	DESKTOP_INTERACTIVE,
	DESKTOP_TYPOGRAPHY,
	DESKTOP_Z_INDEX,
} from '../../constants';
import { useDesktopPopoverOpenGuard } from '../../hooks/useDesktopPopoverOpenGuard';
import { useDesktopRecentApps } from '../../hooks/useDesktopRecentApps';
import { useDesktopShellSearchFocusOnVisible } from '../../hooks/useDesktopShellSearchFocusOnVisible';
import { formatShortcutKeysForPlatform } from '../../hooks/useKeyboardShortcuts';
import {
	consumeEscapeForSearchClear,
	useShellCaptureEscape,
} from '../../hooks/useShellCaptureKeyboard';
import { shouldCloseStartMenuOnOutsidePointer } from '../../utils/desktopShellOutsideDismiss';
import { rankDesktopAppsForQuery } from '../../utils/desktopLauncherFuzzySearch';
import { getDesktopShellPanelClassName } from '../../utils/desktopVisualSystem';
import { DesktopAppEmptyState } from '../DesktopAppChrome';
import { DesktopAppBadge } from '../../utils/desktopVisualSystem';
import { StartMenuFooterChrome } from './StartMenuFooterChrome';
import { StartMenuSearchHeader } from './StartMenuSearchHeader';
import type { StartMenuProps } from './startMenuShared.types';
import type { DesktopItem } from '../../types/desktop.types';

const START_MENU_PANEL_SCRIM =
	'pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--desktop-surface-panel-strong)_22%,transparent)]';

export const StartMenuCommandConsole: React.FC<StartMenuProps> = memo(
	({
		isOpen,
		onClose,
		apps,
		onOpenApp,
		onWallpaper,
		onAppStore,
		onPowerOff,
		onOpenProfile,
		onOpenAdmin,
		startMenuActiveDesktopId,
		iconStyle = 'glass',
		shellWindowStyle = 'glass',
	}) => {
		const { t } = useTranslation('desktopUi');
		const { user } = useAuth();
		const { recentIds, recordRecentApp } = useDesktopRecentApps();
		const [search, setSearch] = useState('');
		const [selectedIndex, setSelectedIndex] = useState(0);
		const [showShortcuts, setShowShortcuts] = useState(false);
		const ref = useRef<HTMLDivElement>(null);
		const inputRef = useRef<HTMLInputElement>(null);
		const startMenuOutsideClickGuardRef = useDesktopPopoverOpenGuard(isOpen);
		const commandPaletteShortcutLabel = useMemo(
			() =>
				formatShortcutKeysForPlatform(t('shortcuts.shell.commandPalette.keys')),
			[t]
		);

		const appsList = useMemo(
			() => apps.filter((a) => a.type === 'app'),
			[apps]
		);
		const recentApps = useMemo(() => {
			const byId = new Map(appsList.map((a) => [a.id, a] as const));
			return recentIds
				.map((id) => byId.get(id))
				.filter((a): a is DesktopItem => a != null);
		}, [appsList, recentIds]);
		const pinnedApps = useMemo(
			() => appsList.filter((a) => a.isPinned),
			[appsList]
		);

		const hits = useMemo(() => {
			const q = search.trim();
			if (q) {
				return rankDesktopAppsForQuery(q, appsList, recentApps, {
					limit: 24,
				});
			}
			const idle: DesktopItem[] = [];
			const seen = new Set<string>();
			for (const app of [...pinnedApps, ...recentApps]) {
				if (seen.has(app.id)) continue;
				seen.add(app.id);
				idle.push(app);
				if (idle.length >= 12) break;
			}
			return idle.map((item) => ({
				item,
				score: 0,
				matches: [] as string[],
			}));
		}, [appsList, pinnedApps, recentApps, search]);

		const setSearchResetIndex = useCallback((value: string) => {
			setSearch(value);
			setSelectedIndex(0);
		}, []);

		useEffect(() => {
			if (!isOpen) {
				setSearch('');
				setShowShortcuts(false);
				setSelectedIndex(0);
			}
		}, [isOpen]);

		useDesktopShellSearchFocusOnVisible(inputRef, isOpen);

		const openApp = useCallback(
			(app: DesktopItem) => {
				recordRecentApp(app.id, startMenuActiveDesktopId ?? null);
				onOpenApp(app);
				onClose();
			},
			[onClose, onOpenApp, recordRecentApp, startMenuActiveDesktopId]
		);

		useShellCaptureEscape(isOpen, onClose, {
			onLayer: () => {
				if (consumeEscapeForSearchClear(search, () => setSearch(''))) {
					return true;
				}
				if (showShortcuts) {
					setShowShortcuts(false);
					return true;
				}
				return false;
			},
		});

		useEffect(() => {
			const handleClick = (e: MouseEvent) => {
				if (
					!shouldCloseStartMenuOnOutsidePointer({
						openClickGuardActive: startMenuOutsideClickGuardRef.current,
						target: e.target as Element,
						panelRoot: ref.current,
						appContextMenuRoot: null,
					})
				) {
					return;
				}
				onClose();
			};
			if (isOpen) {
				document.addEventListener('mousedown', handleClick);
			}
			return () => document.removeEventListener('mousedown', handleClick);
		}, [isOpen, onClose, startMenuOutsideClickGuardRef]);

		const handleKeyDown = useCallback(
			(e: React.KeyboardEvent) => {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					setSelectedIndex((i) =>
						Math.min(i + 1, Math.max(0, hits.length - 1))
					);
					return;
				}
				if (e.key === 'ArrowUp') {
					e.preventDefault();
					setSelectedIndex((i) => Math.max(i - 1, 0));
					return;
				}
				if (e.key === 'Enter') {
					const hit = hits[selectedIndex];
					if (hit) {
						e.preventDefault();
						openApp(hit.item);
					}
				}
			},
			[hits, openApp, selectedIndex]
		);

		if (!isOpen) return null;

		const empty =
			hits.length === 0 &&
			(Boolean(search.trim()) ||
				(pinnedApps.length === 0 && recentApps.length === 0));

		return (
			<div
				id="start-menu-panel"
				ref={ref}
				data-taskbar-interactive="true"
				data-desktop-shell-keyboard-surface=""
				data-start-menu-mode="command_console"
				role="dialog"
				aria-modal="true"
				aria-label={t('startMenu.commandConsole.dialogLabel')}
				className={cn(
					getDesktopShellPanelClassName(shellWindowStyle, 'strong'),
					'isolate absolute min-h-0 flex flex-col',
					'max-sm:inset-x-0 max-sm:bottom-12 max-sm:left-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0',
					'max-sm:h-[calc(100dvh-3rem)] max-sm:max-h-[calc(100dvh-3rem)]',
					'sm:bottom-20 sm:left-[2cm] sm:right-[2cm] sm:w-auto sm:max-w-none sm:translate-x-0 sm:max-h-[min(720px,calc(100dvh-6rem))]',
					'max-sm:rounded-b-none max-sm:rounded-t-2xl'
				)}
				style={{ zIndex: DESKTOP_Z_INDEX.PANEL }}
				onKeyDown={handleKeyDown}
			>
				<div aria-hidden className={START_MENU_PANEL_SCRIM} />
				<StartMenuSearchHeader
					inputRef={inputRef}
					search={search}
					setSearch={setSearchResetIndex}
					t={t}
				/>
				<div className="relative z-1 min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-3 pt-2">
					{empty ? (
						<DesktopAppEmptyState
							icon={<MagnifyingGlassIcon className="h-8 w-8" aria-hidden />}
							title={
								search.trim()
									? t('startMenu.emptySearchTitle')
									: t('startMenu.commandConsole.emptyIdleTitle')
							}
							description={
								search.trim()
									? t('startMenu.emptySearchDescription')
									: t('startMenu.commandConsole.emptyIdleDescription')
							}
						/>
					) : (
						<ul
							className="space-y-1"
							aria-label={t('startMenu.commandConsole.resultsAria')}
						>
							{hits.map((hit, index) => {
								const active = index === selectedIndex;
								return (
									<li key={hit.item.id}>
										<button
											type="button"
											onClick={() => openApp(hit.item)}
											onMouseEnter={() => setSelectedIndex(index)}
											className={cn(
												'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors',
												DESKTOP_INTERACTIVE.focusRing,
												active
													? 'bg-[rgb(var(--desktop-accent-rgb)/0.16)] text-(--desktop-text-primary)'
													: 'text-(--desktop-text-secondary) hover:bg-(--desktop-surface-soft-hover)'
											)}
										>
											<span className="shrink-0">
												<DesktopAppBadge
													appComponent={hit.item.appComponent}
													icon={hit.item.icon}
													iconStyle={iconStyle}
													variant="panel"
													className="h-10 w-10"
												/>
											</span>
											<span className="min-w-0 flex-1">
												<span
													className={cn(
														DESKTOP_TYPOGRAPHY.body,
														'block truncate font-semibold text-(--desktop-text-primary)'
													)}
												>
													{hit.item.name}
												</span>
												{hit.item.description ? (
													<span
														className={cn(
															DESKTOP_TYPOGRAPHY.meta,
															'block truncate text-(--desktop-text-dim)'
														)}
													>
														{hit.item.description}
													</span>
												) : null}
											</span>
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</div>
				<StartMenuFooterChrome
					shellWindowStyle={shellWindowStyle}
					showShortcuts={showShortcuts}
					setShowShortcuts={setShowShortcuts}
					commandPaletteShortcutLabel={commandPaletteShortcutLabel}
					t={t}
					user={user}
					onClose={onClose}
					onOpenProfile={onOpenProfile}
					onOpenAdmin={onOpenAdmin}
					onAppStore={onAppStore}
					onWallpaper={onWallpaper}
					onPowerOff={onPowerOff}
				/>
			</div>
		);
	}
);

StartMenuCommandConsole.displayName = 'StartMenuCommandConsole';
