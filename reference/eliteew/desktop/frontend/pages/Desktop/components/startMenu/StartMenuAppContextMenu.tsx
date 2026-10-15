/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Portal context menu for a Start Menu app card (open, new window, pin, workspace).
 *
 * Invariants:
 * - Renders only when appCtx and a computed position are available.
 * - System apps never expose pin/unpin actions.
 *
 * Related:
 * - ../StartMenu.tsx
 * - ../../utils/desktopUi.ts
 */

import type { RefObject } from 'react';
import type { TFunction } from 'i18next';
import { m } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
	ComputerDesktopIcon,
	PlayIcon,
	Squares2X2Icon,
	SquaresPlusIcon,
} from '@heroicons/react/24/outline';
import { DESKTOP_INTERACTIVE, DESKTOP_LUCIDE } from '../../constants';
import type { DesktopIconStyle } from '../../../../types/profile';
import type { StoreAppResponse } from '../../services/desktopApi';
import type { DesktopItem } from '../../types/desktop.types';
import type { DesktopExpansionDiscoveryState } from '../../types/desktopExpansion.types';
import { getAppStoreWindowInstanceCap } from '../../utils/appStoreWindowPolicy';
import { isSystemDesktopApp } from '../../utils/desktopAppRegistry';
import {
	getContextMenuPositionFromCursor,
	getDesktopPortalShellProps,
	isBrowserContextMenuAllowedTarget,
} from '../../utils/desktopUi';
import { DesktopAppBadge } from '../../utils/desktopVisualSystem';
import type { OpenWindowOptions } from '../../hooks/useWindowManager';
import {
	DesktopAppMenuDivider,
	DesktopAppMenuHeader,
	DesktopAppMenuItem,
	DesktopAppMenuSectionLabel,
	DesktopAppMenuSurface,
} from '../DesktopAppChrome';

export type StartMenuAppCtx = {
	x: number;
	y: number;
	app: DesktopItem;
};

type Props = {
	appCtx: StartMenuAppCtx;
	menuRef: RefObject<HTMLDivElement | null>;
	reduceMotion: boolean | undefined;
	portalStackBase: number;
	t: TFunction<'desktopUi'>;
	iconStyle: DesktopIconStyle;
	desktopAppIdSet: Set<string>;
	storeApps?: StoreAppResponse[];
	onPinAppToDesktop?: (app: DesktopItem) => void;
	onUnpinAppFromDesktop?: (app: DesktopItem) => void;
	expansionState?: DesktopExpansionDiscoveryState;
	onOpenAppInWorkspace?: (app: DesktopItem, workspaceProfileId: string) => void;
	openAppFromStart: (app: DesktopItem) => void;
	recordRecentForActiveDesktop: (appId: string) => void;
	recordRecentApp: (appId: string, desktopId: string | null) => void;
	startMenuActiveDesktopId?: string;
	onOpenApp: (app: DesktopItem, options?: OpenWindowOptions) => void;
	onClose: () => void;
	onDismiss: () => void;
};

function estimateAppCtxMenuHeight(
	app: DesktopItem,
	opts: {
		storeApps?: StoreAppResponse[];
		desktopAppIdSet: Set<string>;
		onPinAppToDesktop?: (app: DesktopItem) => void;
		onUnpinAppFromDesktop?: (app: DesktopItem) => void;
		expansionState?: DesktopExpansionDiscoveryState;
		onOpenAppInWorkspace?: (
			app: DesktopItem,
			workspaceProfileId: string
		) => void;
	}
): number {
	const storeRow = opts.storeApps?.find((s) => s.app_id === app.id);
	const { allowsMultipleInstances } = getAppStoreWindowInstanceCap(
		storeRow ?? {}
	);
	const onDesk = opts.desktopAppIdSet.has(app.id);
	let h = 124;
	if (allowsMultipleInstances) h += 44;
	if (opts.onPinAppToDesktop && !isSystemDesktopApp(app)) {
		h += 52;
		if (onDesk && opts.onUnpinAppFromDesktop) h += 44;
	}
	const n = Math.min(opts.expansionState?.workspaceProfiles.length ?? 0, 12);
	if (n > 0 && opts.onOpenAppInWorkspace) h += 40 + n * 40;
	return Math.min(520, h);
}

export function StartMenuAppContextMenu({
	appCtx,
	menuRef,
	reduceMotion,
	portalStackBase,
	t,
	iconStyle,
	desktopAppIdSet,
	storeApps,
	onPinAppToDesktop,
	onUnpinAppFromDesktop,
	expansionState,
	onOpenAppInWorkspace,
	openAppFromStart,
	recordRecentForActiveDesktop,
	recordRecentApp,
	startMenuActiveDesktopId,
	onOpenApp,
	onClose,
	onDismiss,
}: Props) {
	if (typeof document === 'undefined') return null;

	const appCtxMenuHeight = estimateAppCtxMenuHeight(appCtx.app, {
		storeApps,
		desktopAppIdSet,
		onPinAppToDesktop,
		onUnpinAppFromDesktop,
		expansionState,
		onOpenAppInWorkspace,
	});
	const appCtxPosition = getContextMenuPositionFromCursor({
		clientX: appCtx.x,
		clientY: appCtx.y,
		menuWidth: 280,
		menuHeight: appCtxMenuHeight,
	});
	const startAppCtxPortalShell = getDesktopPortalShellProps();
	const a = appCtx.app;
	const storeRow = storeApps?.find((s) => s.app_id === a.id);
	const { allowsMultipleInstances } = getAppStoreWindowInstanceCap(
		storeRow ?? {}
	);
	const onDesk = desktopAppIdSet.has(a.id);

	return createPortal(
		<m.div
			ref={menuRef}
			data-theme={startAppCtxPortalShell?.theme}
			role="menu"
			aria-label={t('startMenu.appContextLabel')}
			initial={
				reduceMotion === true
					? { opacity: 0 }
					: { opacity: 0, scale: 0.96, y: 4 }
			}
			animate={
				reduceMotion === true ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
			}
			transition={
				reduceMotion === true
					? { duration: 0.12 }
					: { type: 'spring', stiffness: 420, damping: 32 }
			}
			className="fixed text-(--desktop-text-primary)"
			style={{
				...(startAppCtxPortalShell?.style ?? {}),
				left: appCtxPosition.x,
				top: appCtxPosition.y,
				zIndex: portalStackBase,
			}}
			onContextMenu={(e) => {
				if (isBrowserContextMenuAllowedTarget(e.target)) return;
				e.preventDefault();
				e.stopPropagation();
			}}
		>
			<DesktopAppMenuSurface className="min-w-[240px] max-h-[min(70vh,520px)] max-w-[min(92vw,300px)] overflow-y-auto overflow-x-hidden py-0 ring-1 ring-(--desktop-border-menu)">
				<DesktopAppMenuHeader
					leading={
						<DesktopAppBadge
							appComponent={appCtx.app.appComponent}
							icon={appCtx.app.icon}
							variant="start"
							className="relative h-9 w-9 shadow-(--desktop-shadow-soft)"
							iconStyle={iconStyle}
						/>
					}
					title={appCtx.app.name}
					subtitle={
						desktopAppIdSet.has(appCtx.app.id)
							? t('startMenu.onDesktop')
							: t('startMenu.notOnDesktop')
					}
				/>
				<div className="px-1 py-1.5">
					<DesktopAppMenuItem
						type="button"
						role="menuitem"
						className={DESKTOP_INTERACTIVE.focusRing}
						icon={
							<PlayIcon
								className={DESKTOP_LUCIDE.md}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						}
						onClick={() => {
							openAppFromStart(appCtx.app);
							onDismiss();
						}}
					>
						{t('startMenu.openApp')}
					</DesktopAppMenuItem>
					{allowsMultipleInstances ? (
						<DesktopAppMenuItem
							type="button"
							role="menuitem"
							className={DESKTOP_INTERACTIVE.focusRing}
							icon={
								<SquaresPlusIcon
									className={DESKTOP_LUCIDE.md}
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							}
							onClick={() => {
								recordRecentForActiveDesktop(a.id);
								onOpenApp(a, { forceNew: true });
								onDismiss();
								onClose();
							}}
						>
							{t('startMenu.newWindow')}
						</DesktopAppMenuItem>
					) : null}
					{onPinAppToDesktop && !isSystemDesktopApp(a) ? (
						<>
							<DesktopAppMenuDivider className="mx-1.5" />
							{onDesk && onUnpinAppFromDesktop ? (
								<DesktopAppMenuItem
									type="button"
									role="menuitem"
									className={DESKTOP_INTERACTIVE.focusRing}
									icon={
										<ComputerDesktopIcon
											className={DESKTOP_LUCIDE.md}
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
									}
									onClick={() => {
										onUnpinAppFromDesktop(a);
										onDismiss();
									}}
								>
									{t('startMenu.unpinFromDesktop')}
								</DesktopAppMenuItem>
							) : (
								<DesktopAppMenuItem
									type="button"
									role="menuitem"
									className={DESKTOP_INTERACTIVE.focusRing}
									icon={
										<ComputerDesktopIcon
											className={DESKTOP_LUCIDE.md}
											strokeWidth={DESKTOP_LUCIDE.stroke}
										/>
									}
									disabled={onDesk}
									onClick={() => {
										if (onDesk) {
											onDismiss();
											return;
										}
										onPinAppToDesktop(a);
										onDismiss();
									}}
								>
									{onDesk
										? t('startMenu.alreadyOnDesktop')
										: t('startMenu.pinToDesktop')}
								</DesktopAppMenuItem>
							)}
						</>
					) : null}
					{expansionState &&
					onOpenAppInWorkspace &&
					expansionState.workspaceProfiles.length > 0 ? (
						<>
							<DesktopAppMenuDivider className="mx-1.5" />
							<DesktopAppMenuSectionLabel className="px-3 pt-1.5 pb-0.5">
								{t('startMenu.openInWorkspaceSection')}
							</DesktopAppMenuSectionLabel>
							<div className="max-h-[220px] overflow-y-auto">
								{expansionState.workspaceProfiles.slice(0, 12).map((pr) => (
									<DesktopAppMenuItem
										key={pr.id}
										type="button"
										role="menuitem"
										className={DESKTOP_INTERACTIVE.focusRing}
										icon={
											<Squares2X2Icon
												className={DESKTOP_LUCIDE.md}
												strokeWidth={DESKTOP_LUCIDE.stroke}
											/>
										}
										onClick={() => {
											recordRecentApp(
												a.id,
												pr.desktopId?.trim() ?? startMenuActiveDesktopId ?? null
											);
											onOpenAppInWorkspace(a, pr.id);
											onDismiss();
											onClose();
										}}
									>
										{pr.name}
									</DesktopAppMenuItem>
								))}
							</div>
						</>
					) : null}
				</div>
			</DesktopAppMenuSurface>
		</m.div>,
		document.body
	);
}
