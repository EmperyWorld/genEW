/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Legacy (production-stable) Start Menu body — preserved as Mode A of the multimodal
 * menu orchestrator. Behavior must stay identical to the pre-orchestrator Пуск.
 *
 * Invariants:
 * - Default tab is «Categories» (`categories`).
 * - Autofocus search only on pointer-first devices (`shouldAutofocusDesktopShellSearch`).
 * - Panel root is `flex flex-col overflow-hidden` with scrollable `flex-1 min-h-0 overflow-y-auto`.
 * - Outside dismiss ignores Start button and ~320 ms after open (Quest ghost mousedown).
 * - Desktop pin badge toggles desktop icon (same callbacks as context menu).
 * - Keyboard: `useStartMenuKeyboard` + `unwindStartMenuEscapeLayer`; capture Escape via `useShellCaptureEscape`.
 * - Plain mount/unmount for panel + app grid (no Framer) for RDP-safe paint.
 *
 * Related:
 * - `StartMenu.tsx` (orchestrator), `types/desktopStartMenu.ts`
 * - `startMenu/*` structural modules
 */

import { cn } from '@/utils/cn';
import { useDesktopShellMotionPrefs } from '../context/DesktopShellMotionPrefsContext';
import * as React from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../contexts/AuthContext';
import {
	DESKTOP_LUCIDE,
	DESKTOP_TYPOGRAPHY,
	DESKTOP_Z_INDEX,
} from '../constants';
import { useDesktopWindowPortalStackBase } from '../context/DesktopWindowPortalStackContext';
import { useDismissibleFloatingMenu } from '../hooks/useDismissibleFloatingMenu';
import { formatShortcutKeysForPlatform } from '../hooks/useKeyboardShortcuts';
import { useShellCaptureEscape } from '../hooks/useShellCaptureKeyboard';
import { useDesktopPopoverOpenGuard } from '../hooks/useDesktopPopoverOpenGuard';
import { useDesktopRecentApps } from '../hooks/useDesktopRecentApps';
import type { DesktopItem } from '../types/desktop.types';
import type { StartMenuTab } from '../types/desktopStartMenu';
import { buildDesktopLibraryDiscoverySlices } from '../utils/desktopDiscoveryModel';
import { useDesktopShellSearchFocusOnVisible } from '../hooks/useDesktopShellSearchFocusOnVisible';
import { shouldCloseStartMenuOnOutsidePointer } from '../utils/desktopShellOutsideDismiss';
import { preloadDesktopApp } from '../utils/preloadDesktopApp';
import { isBrowserContextMenuAllowedTarget } from '../utils/desktopUi';
import { getDesktopShellPanelClassName } from '../utils/desktopVisualSystem';
import {
	MagnifyingGlassIcon,
	Squares2X2Icon,
} from '@heroicons/react/24/outline';

import {
	DesktopAppEmptyState,
	DesktopAppSectionLabel,
} from './DesktopAppChrome';
import { StartMenuAppContextMenu } from './startMenu/StartMenuAppContextMenu';
import { StartMenuAppGrid } from './startMenu/StartMenuAppGrid';
import { StartMenuFooterChrome } from './startMenu/StartMenuFooterChrome';
import { StartMenuRecentDiscovery } from './startMenu/StartMenuRecentDiscovery';
import { StartMenuSearchHeader } from './startMenu/StartMenuSearchHeader';
import { StartMenuTabStrip } from './startMenu/StartMenuTabStrip';
import { StartMenuWorkExpansion } from './startMenu/StartMenuWorkExpansion';
import { useStartMenuAppCatalog } from './startMenu/useStartMenuAppCatalog';
import { useStartMenuDisclosure } from './startMenu/useStartMenuDisclosure';
import { useStartMenuKeyboard } from './startMenu/useStartMenuKeyboard';
import type { StartMenuProps } from './startMenu/startMenuShared.types';

export type { StartMenuProps };

const COLS_DEFAULT = 5;

/** Extra density over shell-panel — overlay, without replacing `frame` bg via twMerge. */
const START_MENU_PANEL_SCRIM =
	'pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--desktop-surface-panel-strong)_22%,transparent)]';

export const StartMenuLegacy: React.FC<StartMenuProps> = memo(
	({
		isOpen,
		onClose,
		apps,
		desktopItems = [],
		onOpenApp,
		onWallpaper,
		onAppStore,
		onPowerOff,
		onOpenProfile,
		onOpenAdmin,
		onPinAppToDesktop,
		onUnpinAppFromDesktop,
		onOpenAppInWorkspace,
		recentFiles = [],
		recentLibraryOpened = [],
		recentLibraryAdded = [],
		recentLibraryGenerated = [],
		recentLibraryUploaded = [],
		recentLibraryProjects = [],
		recentContentFeedLoading = false,
		recentContentFeedError = null,
		recentContentFeedLoadedAt = null,
		hasRecentContentFeedItems = false,
		onRefetchRecentContentFeed,
		onOpenShellWorkspacesSettings,
		startMenuIntent,
		onOpenRecentFile,
		onRemoveRecentFile,
		startMenuActiveDesktopId,
		storeApps,
		desktopAppIds = [],
		iconStyle = 'glass',
		shellWindowStyle = 'glass',
		expansionState,
		expansionLaunchActions,
		startMenuVirtualDesktops = [],
		startMenuGlobalWallpaper = '',
		resumeWindows = [],
		onResumeOpenWindow,
		startMenuWorkspaceContextWindows = [],
		getWindowsOnDesktop,
	}) => {
		const { t } = useTranslation('desktopUi');
		const { user } = useAuth();
		const commandPaletteShortcutLabel = useMemo(
			() =>
				formatShortcutKeysForPlatform(t('shortcuts.shell.commandPalette.keys')),
			[t]
		);
		const portalStackBase = useDesktopWindowPortalStackBase();
		const { recentIds, recentIdsByDesktop, recordRecentApp } =
			useDesktopRecentApps();
		const recordRecentForActiveDesktop = useCallback(
			(appId: string) => {
				recordRecentApp(appId, startMenuActiveDesktopId ?? null);
			},
			[recordRecentApp, startMenuActiveDesktopId]
		);
		const [search, setSearch] = useState('');
		const [activeTab, setActiveTab] = useState<StartMenuTab>('categories');
		const [cols, setCols] = useState(COLS_DEFAULT);
		const {
			showMoreTabs,
			setShowMoreTabs,
			showLibraryDiscovery,
			setShowLibraryDiscovery,
			showWorkAdvanced,
			setShowWorkAdvanced,
		} = useStartMenuDisclosure(
			isOpen,
			startMenuIntent,
			setActiveTab,
			setSearch
		);
		const [showShortcuts, setShowShortcuts] = useState(false);
		const [appCtx, setAppCtx] = useState<{
			x: number;
			y: number;
			app: DesktopItem;
		} | null>(null);
		const ref = useRef<HTMLDivElement>(null);
		const inputRef = useRef<HTMLInputElement>(null);
		const startAppMenuRef = useRef<HTMLDivElement>(null);
		const startMenuOutsideClickGuardRef = useDesktopPopoverOpenGuard(isOpen);
		const { reduceMotion } = useDesktopShellMotionPrefs();

		const libraryDiscovery = useMemo(
			() =>
				buildDesktopLibraryDiscoverySlices({
					recentFiles,
					recentLibraryOpened,
					recentLibraryAdded,
					recentLibraryGenerated,
					recentLibraryUploaded,
					recentLibraryProjects,
				}),
			[
				recentFiles,
				recentLibraryOpened,
				recentLibraryAdded,
				recentLibraryGenerated,
				recentLibraryUploaded,
				recentLibraryProjects,
			]
		);
		const recentDocumentsUnified = libraryDiscovery.recentDocumentsUnified;
		const shellRecentFileIdSet = useMemo(
			() => new Set(recentFiles.map((f) => f.id)),
			[recentFiles]
		);

		useEffect(() => {
			const updateCols = () => {
				setCols(
					window.innerWidth >= 768 ? 5 : window.innerWidth >= 640 ? 4 : 3
				);
			};
			updateCols();
			window.addEventListener('resize', updateCols);
			return () => window.removeEventListener('resize', updateCols);
		}, []);

		const {
			appsById,
			contentManagerApp,
			workspaceItemCatalog,
			filteredApps,
			appsByCategory,
			sortedCategories,
			appsToShow,
			hasWorkItems,
			desktopAppIdSet,
			canToggleDesktopPin,
			toggleAppDesktopPin,
			recommendedAppsFiltered,
		} = useStartMenuAppCatalog({
			apps,
			desktopItems,
			search,
			t,
			activeTab,
			recentIds,
			expansionState,
			startMenuActiveDesktopId,
			desktopAppIds,
			onPinAppToDesktop,
			onUnpinAppFromDesktop,
		});

		useEffect(() => {
			if (isOpen) return;
			setShowShortcuts(false);
		}, [isOpen]);

		const { handleKeyDown, captureEscapeOnLayer } = useStartMenuKeyboard({
			panelRef: ref,
			appCtx,
			setAppCtx,
			search,
			setSearch,
			showWorkAdvanced,
			setShowWorkAdvanced,
			showLibraryDiscovery,
			setShowLibraryDiscovery,
			showMoreTabs,
			setShowMoreTabs,
			showShortcuts,
			setShowShortcuts,
			onClose,
			activeTab,
			cols,
		});

		const closeAppContextMenu = useCallback(() => setAppCtx(null), []);

		useDismissibleFloatingMenu({
			isOpen: Boolean(appCtx),
			menuRef: startAppMenuRef,
			onClose: closeAppContextMenu,
			escapeCapture: true,
			focusFirstMenuItem: true,
		});

		useShellCaptureEscape(isOpen && !appCtx, onClose, {
			onLayer: captureEscapeOnLayer,
		});

		const openAppFromStart = useCallback(
			(app: DesktopItem) => {
				recordRecentForActiveDesktop(app.id);
				onOpenApp(app);
				onClose();
			},
			[onClose, onOpenApp, recordRecentForActiveDesktop]
		);

		const preloadAppChunkOnHover = useCallback((app: DesktopItem) => {
			void preloadDesktopApp(app.appComponent);
		}, []);

		const handleAppContextMenu = useCallback(
			(e: React.MouseEvent, app: DesktopItem) => {
				e.preventDefault();
				e.stopPropagation();
				setAppCtx({ x: e.clientX, y: e.clientY, app });
			},
			[]
		);

		const handleAppMouseDown = useCallback(
			(e: React.MouseEvent, app: DesktopItem) => {
				if (e.button !== 2) return;
				e.preventDefault();
				e.stopPropagation();
				setAppCtx({ x: e.clientX, y: e.clientY, app });
			},
			[]
		);

		useEffect(() => {
			const handleClick = (e: MouseEvent) => {
				if (
					!shouldCloseStartMenuOnOutsidePointer({
						openClickGuardActive: startMenuOutsideClickGuardRef.current,
						target: e.target as Element,
						panelRoot: ref.current,
						appContextMenuRoot: startAppMenuRef.current,
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

		useDesktopShellSearchFocusOnVisible(inputRef, isOpen);

		useEffect(() => {
			if (!isOpen) setSearch('');
		}, [isOpen]);

		useEffect(() => {
			if (!isOpen) setAppCtx(null);
		}, [isOpen]);

		if (!isOpen) return null;

		const isSearchEmpty =
			Boolean(search.trim()) &&
			activeTab !== 'work' &&
			(activeTab === 'categories'
				? filteredApps.length === 0
				: appsToShow.length === 0);
		const isWorkEmpty = activeTab === 'work' && !hasWorkItems;
		const recentOverviewEmpty =
			activeTab === 'recent' &&
			!search.trim() &&
			appsToShow.length === 0 &&
			!libraryDiscovery.hasAnyLibraryRows &&
			resumeWindows.length === 0 &&
			recommendedAppsFiltered.length === 0 &&
			!recentContentFeedLoading;
		const emptyTitle = isSearchEmpty
			? t('startMenu.emptySearchTitle')
			: activeTab === 'recent'
				? t('startMenu.emptyRecentTitle')
				: activeTab === 'work'
					? t('startMenu.emptyWorkTitle')
					: activeTab === 'pinned'
						? t('startMenu.emptyPinnedTitle')
						: t('startMenu.emptySearchTitle');
		const emptyDescription = isSearchEmpty
			? t('startMenu.emptySearchDescription')
			: recentOverviewEmpty
				? t('startMenu.emptyRecentDiscoveryDescription')
				: t('startMenu.emptyDefaultDescription');

		return (
			<div
				id="start-menu-panel"
				ref={ref}
				data-taskbar-interactive="true"
				data-desktop-shell-keyboard-surface=""
				role="dialog"
				aria-modal="true"
				aria-label={t('startMenu.dialogLabel')}
				className={cn(
					getDesktopShellPanelClassName(shellWindowStyle, 'strong'),
					'isolate absolute min-h-0 flex flex-col',
					// Mobile: full-width sheet above compact taskbar (h-12) — fixed height budget so flex-1 scroll works
					'max-sm:inset-x-0 max-sm:bottom-12 max-sm:left-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0',
					'max-sm:h-[calc(100dvh-3rem)] max-sm:max-h-[calc(100dvh-3rem)]',
					// sm+: nearly full-bleed card with ~2cm side margins
					'sm:bottom-20 sm:left-[2cm] sm:right-[2cm] sm:w-auto sm:max-w-none sm:translate-x-0 sm:max-h-[min(720px,calc(100dvh-6rem))]',
					// After shell preset `rounded-[var(--desktop-radius-shell)]` so the bottom sheet keeps flat bottom on phones
					'max-sm:rounded-b-none max-sm:rounded-t-2xl'
				)}
				style={{
					zIndex: DESKTOP_Z_INDEX.PANEL,
				}}
				onKeyDown={handleKeyDown}
				onPointerDownCapture={(e) => {
					if (e.button !== 2) return;
					const target = e.target as HTMLElement;
					const appButton = target.closest<HTMLElement>('[data-start-app-id]');
					if (!appButton) return;
					const appId = appButton.dataset.startAppId;
					if (!appId) return;
					const app = appsById.get(appId);
					if (!app) return;
					e.preventDefault();
					e.stopPropagation();
					setAppCtx({ x: e.clientX, y: e.clientY, app });
				}}
				onContextMenu={(e) => {
					if (isBrowserContextMenuAllowedTarget(e.target)) return;
					e.preventDefault();
					e.stopPropagation();
				}}
			>
				<div aria-hidden className={START_MENU_PANEL_SCRIM} />
				<StartMenuSearchHeader
					inputRef={inputRef}
					search={search}
					setSearch={setSearch}
					t={t}
				/>

				<StartMenuTabStrip
					activeTab={activeTab}
					showMoreTabs={showMoreTabs}
					setActiveTab={setActiveTab}
					setShowMoreTabs={setShowMoreTabs}
					t={t}
				/>

				{/* Apps Grid or Grouped */}
				<div className="relative z-1 min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y bg-[color-mix(in_srgb,var(--desktop-surface-panel)_14%,transparent)] px-4 pb-4 max-sm:px-3 max-sm:pb-3">
					{activeTab === 'work' ? (
						<StartMenuWorkExpansion
							t={t}
							onClose={onClose}
							showWorkAdvanced={showWorkAdvanced}
							setShowWorkAdvanced={setShowWorkAdvanced}
							expansionState={expansionState}
							expansionLaunchActions={expansionLaunchActions}
							startMenuVirtualDesktops={startMenuVirtualDesktops}
							startMenuGlobalWallpaper={startMenuGlobalWallpaper}
							workspaceItemCatalog={workspaceItemCatalog}
							recentIds={recentIds}
							recentIdsByDesktop={recentIdsByDesktop}
							startMenuWorkspaceContextWindows={
								startMenuWorkspaceContextWindows
							}
							getWindowsOnDesktop={getWindowsOnDesktop}
							startMenuActiveDesktopId={startMenuActiveDesktopId}
						/>
					) : activeTab === 'categories' ? (
						<div className="space-y-5">
							{sortedCategories.map((cat) => (
								<section key={cat}>
									<div className="flex items-center gap-2 mb-3">
										<Squares2X2Icon
											className={DESKTOP_LUCIDE.md}
											aria-hidden
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
										<div className="min-w-0">
											<DesktopAppSectionLabel
												className={cn(
													DESKTOP_TYPOGRAPHY.body,
													'desktop-shell-display-text font-semibold tracking-wide'
												)}
											>
												{t(`appCategories.${cat}`, { defaultValue: cat })}
											</DesktopAppSectionLabel>
											{(() => {
												const hint = t(`appCategoryHints.${cat}`, {
													defaultValue: '',
												});
												return hint.trim() ? (
													<p
														className={cn(
															DESKTOP_TYPOGRAPHY.caption,
															'text-(--desktop-text-muted) mt-0.5 leading-snug'
														)}
													>
														{hint}
													</p>
												) : null;
											})()}
										</div>
									</div>
									<StartMenuAppGrid
										apps={appsByCategory.get(cat) ?? []}
										search={search}
										iconStyle={iconStyle}
										desktopAppIdSet={desktopAppIdSet}
										canToggleDesktopPin={canToggleDesktopPin}
										t={t}
										openAppFromStart={openAppFromStart}
										onOpenAppContext={(app, x, y) => setAppCtx({ app, x, y })}
										onAppContextMenu={handleAppContextMenu}
										onAppMouseDown={handleAppMouseDown}
										onPreloadApp={preloadAppChunkOnHover}
										toggleAppDesktopPin={toggleAppDesktopPin}
									/>
								</section>
							))}
						</div>
					) : (
						<>
							<StartMenuRecentDiscovery
								activeTab={activeTab}
								t={t}
								search={search}
								onClose={onClose}
								showLibraryDiscovery={showLibraryDiscovery}
								setShowLibraryDiscovery={setShowLibraryDiscovery}
								setShowMoreTabs={setShowMoreTabs}
								setActiveTab={setActiveTab}
								recentContentFeedLoading={recentContentFeedLoading}
								recentContentFeedError={recentContentFeedError}
								hasRecentContentFeedItems={hasRecentContentFeedItems}
								recentContentFeedLoadedAt={recentContentFeedLoadedAt}
								onRefetchRecentContentFeed={onRefetchRecentContentFeed}
								contentManagerApp={contentManagerApp}
								onOpenShellWorkspacesSettings={onOpenShellWorkspacesSettings}
								resumeWindows={resumeWindows}
								onResumeOpenWindow={onResumeOpenWindow}
								recommendedAppsFiltered={recommendedAppsFiltered}
								openAppFromStart={openAppFromStart}
								iconStyle={iconStyle}
								libraryDiscovery={libraryDiscovery}
								recentDocumentsUnified={recentDocumentsUnified}
								onOpenRecentFile={onOpenRecentFile}
								onRemoveRecentFile={onRemoveRecentFile}
								shellRecentFileIdSet={shellRecentFileIdSet}
							/>
							<StartMenuAppGrid
								apps={appsToShow}
								search={search}
								iconStyle={iconStyle}
								desktopAppIdSet={desktopAppIdSet}
								canToggleDesktopPin={canToggleDesktopPin}
								t={t}
								openAppFromStart={openAppFromStart}
								onOpenAppContext={(app, x, y) => setAppCtx({ app, x, y })}
								onAppContextMenu={handleAppContextMenu}
								onAppMouseDown={handleAppMouseDown}
								onPreloadApp={preloadAppChunkOnHover}
								toggleAppDesktopPin={toggleAppDesktopPin}
							/>
						</>
					)}

					{/* Empty state */}
					{(isWorkEmpty ||
						(activeTab === 'categories' && filteredApps.length === 0) ||
						recentOverviewEmpty ||
						(activeTab === 'pinned' && appsToShow.length === 0) ||
						(activeTab === 'all' && appsToShow.length === 0)) && (
						<div className="py-10">
							<DesktopAppEmptyState
								icon={
									<MagnifyingGlassIcon
										className="h-7 w-7 text-(--desktop-text-dim)"
										aria-hidden
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								}
								title={emptyTitle}
								description={emptyDescription}
							/>
						</div>
					)}
				</div>

				{appCtx ? (
					<StartMenuAppContextMenu
						appCtx={appCtx}
						menuRef={startAppMenuRef}
						reduceMotion={reduceMotion}
						portalStackBase={portalStackBase}
						t={t}
						iconStyle={iconStyle}
						desktopAppIdSet={desktopAppIdSet}
						storeApps={storeApps}
						onPinAppToDesktop={onPinAppToDesktop}
						onUnpinAppFromDesktop={onUnpinAppFromDesktop}
						expansionState={expansionState}
						onOpenAppInWorkspace={onOpenAppInWorkspace}
						openAppFromStart={openAppFromStart}
						recordRecentForActiveDesktop={recordRecentForActiveDesktop}
						recordRecentApp={recordRecentApp}
						startMenuActiveDesktopId={startMenuActiveDesktopId}
						onOpenApp={onOpenApp}
						onClose={onClose}
						onDismiss={() => setAppCtx(null)}
					/>
				) : null}

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

StartMenuLegacy.displayName = 'StartMenuLegacy';

export default StartMenuLegacy;
