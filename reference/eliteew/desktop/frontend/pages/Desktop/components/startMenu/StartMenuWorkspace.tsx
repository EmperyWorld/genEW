/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Start Menu Workspace Dashboard mode — WorkExpansion-first tile surface for
 * workspace profiles, collections, and live desktop context.
 *
 * Invariants:
 * - Reuses `StartMenuWorkExpansion` (no duplicate launch paths).
 * - Advanced work disclosure opens by default for at-a-glance overview.
 * - Plain mount/unmount (no Framer panel motion) for RDP-safe paint.
 *
 * Related:
 * - `../StartMenu.tsx`, `./StartMenuWorkExpansion.tsx`
 * - `./startMenuShared.types.ts`
 */

import { cn } from '@/utils/cn';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../../contexts/AuthContext';
import { DESKTOP_TYPOGRAPHY, DESKTOP_Z_INDEX } from '../../constants';
import { useDesktopPopoverOpenGuard } from '../../hooks/useDesktopPopoverOpenGuard';
import { useDesktopRecentApps } from '../../hooks/useDesktopRecentApps';
import { formatShortcutKeysForPlatform } from '../../hooks/useKeyboardShortcuts';
import { useShellCaptureEscape } from '../../hooks/useShellCaptureKeyboard';
import { shouldCloseStartMenuOnOutsidePointer } from '../../utils/desktopShellOutsideDismiss';
import { getDesktopShellPanelClassName } from '../../utils/desktopVisualSystem';
import type { DesktopItem } from '../../types/desktop.types';
import { StartMenuFooterChrome } from './StartMenuFooterChrome';
import { StartMenuWorkExpansion } from './StartMenuWorkExpansion';
import type { StartMenuProps } from './startMenuShared.types';

const START_MENU_PANEL_SCRIM =
	'pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--desktop-surface-panel-strong)_22%,transparent)]';

export const StartMenuWorkspace: React.FC<StartMenuProps> = memo(
	({
		isOpen,
		onClose,
		apps,
		desktopItems = [],
		onWallpaper,
		onAppStore,
		onPowerOff,
		onOpenProfile,
		onOpenAdmin,
		shellWindowStyle = 'glass',
		expansionState,
		expansionLaunchActions,
		startMenuVirtualDesktops = [],
		startMenuGlobalWallpaper = '',
		startMenuWorkspaceContextWindows = [],
		getWindowsOnDesktop,
		startMenuActiveDesktopId,
	}) => {
		const { t } = useTranslation('desktopUi');
		const { user } = useAuth();
		const { recentIds, recentIdsByDesktop } = useDesktopRecentApps();
		const [showWorkAdvanced, setShowWorkAdvanced] = useState(true);
		const [showShortcuts, setShowShortcuts] = useState(false);
		const ref = useRef<HTMLDivElement>(null);
		const startMenuOutsideClickGuardRef = useDesktopPopoverOpenGuard(isOpen);
		const commandPaletteShortcutLabel = useMemo(
			() =>
				formatShortcutKeysForPlatform(t('shortcuts.shell.commandPalette.keys')),
			[t]
		);

		const workspaceItemCatalog = useMemo(() => {
			const catalog = new Map<string, DesktopItem>();
			for (const a of apps) {
				catalog.set(a.id, a);
			}
			for (const d of desktopItems) {
				if (!catalog.has(d.id)) catalog.set(d.id, d);
			}
			return catalog;
		}, [apps, desktopItems]);

		useEffect(() => {
			if (!isOpen) setShowShortcuts(false);
			else setShowWorkAdvanced(true);
		}, [isOpen]);

		useShellCaptureEscape(isOpen, onClose, {
			onLayer: () => {
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

		const onCloseStable = useCallback(() => onClose(), [onClose]);

		if (!isOpen) return null;

		return (
			<div
				id="start-menu-panel"
				ref={ref}
				data-taskbar-interactive="true"
				data-desktop-shell-keyboard-surface=""
				data-start-menu-mode="workspace_dashboard"
				role="dialog"
				aria-modal="true"
				aria-label={t('startMenu.workspaceDashboard.dialogLabel')}
				className={cn(
					getDesktopShellPanelClassName(shellWindowStyle, 'strong'),
					'isolate absolute min-h-0 flex flex-col',
					'max-sm:inset-x-0 max-sm:bottom-12 max-sm:left-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0',
					'max-sm:h-[calc(100dvh-3rem)] max-sm:max-h-[calc(100dvh-3rem)]',
					'sm:bottom-20 sm:left-[2cm] sm:right-[2cm] sm:w-auto sm:max-w-none sm:translate-x-0 sm:max-h-[min(760px,calc(100dvh-6rem))]',
					'max-sm:rounded-b-none max-sm:rounded-t-2xl'
				)}
				style={{ zIndex: DESKTOP_Z_INDEX.PANEL }}
			>
				<div aria-hidden className={START_MENU_PANEL_SCRIM} />
				<header className="relative z-1 shrink-0 border-b border-(--desktop-border-subtle) px-4 py-3">
					<p
						className={cn(
							DESKTOP_TYPOGRAPHY.title,
							'font-semibold text-(--desktop-text-primary)'
						)}
					>
						{t('startMenu.workspaceDashboard.heading')}
					</p>
					<p
						className={cn(
							DESKTOP_TYPOGRAPHY.meta,
							'mt-0.5 text-(--desktop-text-dim)'
						)}
					>
						{t('startMenu.workspaceDashboard.subheading')}
					</p>
				</header>
				<div className="relative z-1 min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-4 pt-3">
					<StartMenuWorkExpansion
						t={t}
						onClose={onCloseStable}
						showWorkAdvanced={showWorkAdvanced}
						setShowWorkAdvanced={setShowWorkAdvanced}
						expansionState={expansionState}
						expansionLaunchActions={expansionLaunchActions}
						startMenuVirtualDesktops={startMenuVirtualDesktops}
						startMenuGlobalWallpaper={startMenuGlobalWallpaper}
						workspaceItemCatalog={workspaceItemCatalog}
						recentIds={recentIds}
						recentIdsByDesktop={recentIdsByDesktop}
						startMenuWorkspaceContextWindows={startMenuWorkspaceContextWindows}
						getWindowsOnDesktop={getWindowsOnDesktop}
						startMenuActiveDesktopId={startMenuActiveDesktopId}
					/>
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

StartMenuWorkspace.displayName = 'StartMenuWorkspace';
