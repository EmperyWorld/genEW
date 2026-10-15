/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Work tab body for Start Menu: workspace profiles, collections, shortcuts,
 * assistant actions, and GAF recent chats with progressive advanced disclosure.
 *
 * Invariants:
 * - Launch actions close the menu after navigation; no local expansion state.
 *
 * Related:
 * - ../StartMenu.tsx
 * - ./startMenuPrimitives.tsx
 * - ../GAFChat/gafChatQueryOptions.ts
 */

import type * as React from 'react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/utils/cn';
import type { TFunction } from 'i18next';
import {
	ChatBubbleLeftRightIcon,
	Squares2X2Icon,
} from '@heroicons/react/24/outline';
import { DESKTOP_APP_COLLECTION_TEMPLATES } from '../../constants/desktopAppCollectionTemplates';
import { DESKTOP_WORKSPACE_PROFILE_TEMPLATES } from '../../constants/desktopWorkspaceProfileTemplates';
import { DESKTOP_LUCIDE, DESKTOP_TYPOGRAPHY } from '../../constants';
import type { VirtualDesktop } from '../../hooks/useVirtualDesktops';
import type { DesktopItem, WindowState } from '../../types/desktop.types';
import type {
	DesktopExpansionDiscoveryState,
	DesktopExpansionLaunchActions,
	DesktopWorkspaceProfile,
} from '../../types/desktopExpansion.types';
import { getDesktopExpansionDiscoveryCounts } from '../../utils/desktopDiscoveryModel';
import { isDesktopWallpaperImageRef } from '../../utils/desktopWallpaper';
import {
	effectiveRecentIdsForWorkspaceProfile,
	filterWindowsOnVirtualDesktop,
	recentAppNamesForWorkspaceProfile,
	resolveWorkspaceProfileTargetDesktopId,
	summarizeOpenWindowsForDisplay,
} from '../../utils/desktopWorkspaceProfileLiveDisplay';
import { listChats } from '../GAFChat/api/gafChatApi';
import {
	GAF_CHAT_CHATS_START_MENU_STALE_MS,
	gafChatChatsQueryOptions,
} from '../GAFChat/gafChatQueryOptions';
import { DesktopAppButton, DesktopAppSectionLabel } from '../DesktopAppChrome';
import { DesktopChromeTooltip } from '../DesktopChromeTooltip';
import {
	START_MENU_EXPANSION_CARD_CLASS,
	StartMenuExpansionCardButton,
} from './startMenuPrimitives';

export function startMenuGafChatTooltip(
	title: string,
	preview?: string | null
): string {
	const p = preview?.trim();
	return p ? `${title}\n${p}` : title;
}

export function workspaceProfilePinnedLine(
	profile: DesktopWorkspaceProfile,
	catalog: Map<string, DesktopItem>
): string {
	const parts: string[] = [];
	for (const id of profile.appIds) {
		const it = catalog.get(id);
		if (it) parts.push(it.name);
		if (parts.length >= 5) break;
	}
	for (const id of profile.folderItemIds) {
		if (parts.length >= 5) break;
		const it = catalog.get(id);
		if (it) parts.push(it.name);
	}
	return parts.slice(0, 5).join(' · ');
}

export type DesktopUiT = TFunction<'desktopUi'>;

export function workspaceProfileStartMenuLiveLines(
	t: DesktopUiT,
	profile: DesktopWorkspaceProfile,
	opts: {
		catalog: Map<string, DesktopItem>;
		recentIds: readonly string[];
		recentIdsByDesktop: Readonly<Record<string, readonly string[]>>;
		allWindows: WindowState[];
		getWindowsOnDesktop?: (desktopId: string) => string[] | undefined;
		activeDesktopId?: string;
	}
): { openLine: string | null; recentLine: string | null } {
	const target = resolveWorkspaceProfileTargetDesktopId(
		profile,
		opts.activeDesktopId
	);
	const sep = t('startMenu.workspaceListSep');
	let openLine: string | null = null;
	if (target && opts.getWindowsOnDesktop) {
		const wins = filterWindowsOnVirtualDesktop(
			opts.allWindows,
			opts.getWindowsOnDesktop,
			target
		);
		const sum = summarizeOpenWindowsForDisplay(wins, 3);
		if (sum.totalCount === 0) {
			openLine = t('startMenu.workspaceOpenOnDesktopNone');
		} else if (sum.visibleCount === 0) {
			openLine = t('startMenu.workspaceOpenOnDesktopAllMinimized', {
				count: sum.minimizedCount,
			});
		} else {
			const minimizedSuffix =
				sum.minimizedCount > 0
					? t('settingsPanel.expansionLiveMinimizedSuffix', {
							count: sum.minimizedCount,
						})
					: '';
			openLine = t('startMenu.workspaceOpenOnDesktop', {
				titles: sum.visibleTitles.join(sep),
				minimizedSuffix,
			});
		}
	}
	const effectiveRecent = effectiveRecentIdsForWorkspaceProfile(
		opts.recentIds,
		opts.recentIdsByDesktop,
		profile,
		opts.activeDesktopId
	);
	const recentNames = recentAppNamesForWorkspaceProfile(
		effectiveRecent,
		profile,
		opts.catalog,
		3
	);
	const recentLine =
		recentNames.length > 0
			? t('startMenu.workspaceRecentInSet', {
					names: recentNames.join(sep),
				})
			: null;
	return { openLine, recentLine };
}

export type StartMenuWorkExpansionProps = {
	t: DesktopUiT;
	onClose: () => void;
	showWorkAdvanced: boolean;
	setShowWorkAdvanced: React.Dispatch<React.SetStateAction<boolean>>;
	expansionState?: DesktopExpansionDiscoveryState;
	expansionLaunchActions?: DesktopExpansionLaunchActions;
	startMenuVirtualDesktops: VirtualDesktop[];
	startMenuGlobalWallpaper: string;
	workspaceItemCatalog: Map<string, DesktopItem>;
	recentIds: readonly string[];
	recentIdsByDesktop: Readonly<Record<string, readonly string[]>>;
	startMenuWorkspaceContextWindows: WindowState[];
	getWindowsOnDesktop?: (desktopId: string) => string[] | undefined;
	startMenuActiveDesktopId?: string;
};

export function StartMenuWorkExpansion({
	t,
	onClose,
	showWorkAdvanced,
	setShowWorkAdvanced,
	expansionState,
	expansionLaunchActions,
	startMenuVirtualDesktops,
	startMenuGlobalWallpaper,
	workspaceItemCatalog,
	recentIds,
	recentIdsByDesktop,
	startMenuWorkspaceContextWindows,
	getWindowsOnDesktop,
	startMenuActiveDesktopId,
}: StartMenuWorkExpansionProps) {
	const gafRecentQuery = useQuery({
		...gafChatChatsQueryOptions(),
		queryFn: ({ signal }) => listChats({ signal }),
		enabled: showWorkAdvanced,
		staleTime: GAF_CHAT_CHATS_START_MENU_STALE_MS,
	});
	const gafRecentChats = useMemo(() => {
		const rows = gafRecentQuery.data ?? [];
		return [...rows]
			.sort((a, b) => {
				const ta = a.last_message_at
					? new Date(a.last_message_at).getTime()
					: 0;
				const tb = b.last_message_at
					? new Date(b.last_message_at).getTime()
					: 0;
				return tb - ta;
			})
			.slice(0, 8);
	}, [gafRecentQuery.data]);

	return (
		<div className="space-y-4">
			{(() => {
				const c = getDesktopExpansionDiscoveryCounts(expansionState);
				if (
					!c.workspaceProfilesCount &&
					!c.appCollectionsCount &&
					!c.contentShortcutsCount &&
					!c.assistantActionsEnabledCount
				) {
					return null;
				}
				return (
					<p
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2 text-(--desktop-text-muted)'
						)}
					>
						{t('startMenu.workTabDiscoverySummary', {
							spaces: c.workspaceProfilesCount,
							collections: c.appCollectionsCount,
							shortcuts: c.contentShortcutsCount,
							actions: c.assistantActionsEnabledCount,
						})}
					</p>
				);
			})()}
			<div className="flex justify-start">
				<DesktopAppButton
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setShowWorkAdvanced((visible) => !visible)}
					aria-expanded={showWorkAdvanced}
				>
					{showWorkAdvanced
						? t('startMenu.hideWorkAdvanced')
						: t('startMenu.showWorkAdvanced')}
				</DesktopAppButton>
			</div>
			<section className="rounded-2xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) p-3">
				<div className="mb-3 flex items-center gap-2">
					<Squares2X2Icon
						className={DESKTOP_LUCIDE.md}
						aria-hidden
						strokeWidth={DESKTOP_LUCIDE.stroke}
					/>
					<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.16em]">
						{t('startMenu.workspacesTitle')}
					</DesktopAppSectionLabel>
				</div>
				{showWorkAdvanced &&
				expansionLaunchActions?.onAddWorkspaceProfileFromTemplate ? (
					<>
						<p
							className={cn(
								DESKTOP_TYPOGRAPHY.caption,
								'mb-2 text-(--desktop-text-dim)'
							)}
						>
							{t('settingsPanel.expansionWorkspaceTemplatesHint')}
						</p>
						<div className="mb-3 flex flex-wrap gap-2">
							{DESKTOP_WORKSPACE_PROFILE_TEMPLATES.map((tpl) => (
								<DesktopAppButton
									key={tpl.id}
									type="button"
									variant="ghost"
									size="sm"
									disabled={Boolean(expansionState?.isSaving)}
									onClick={() => {
										expansionLaunchActions.onAddWorkspaceProfileFromTemplate?.(
											tpl.id
										);
										onClose();
									}}
								>
									{t(
										`settingsPanel.expansionWorkspaceTemplate.${tpl.id}.label`
									)}
								</DesktopAppButton>
							))}
						</div>
					</>
				) : null}
				{expansionState?.workspaceProfiles.length ? (
					<div className="grid gap-2 sm:grid-cols-2">
						{expansionState.workspaceProfiles.map((profile) => {
							const vd = profile.desktopId
								? startMenuVirtualDesktops.find(
										(d) => d.id === profile.desktopId
									)
								: undefined;
							const wpResolved =
								profile.wallpaper?.trim() ||
								vd?.wallpaper?.trim() ||
								startMenuGlobalWallpaper.trim() ||
								'';
							const isWpImg = isDesktopWallpaperImageRef(wpResolved);
							const pinnedLine = workspaceProfilePinnedLine(
								profile,
								workspaceItemCatalog
							);
							const { openLine, recentLine } =
								workspaceProfileStartMenuLiveLines(t, profile, {
									catalog: workspaceItemCatalog,
									recentIds,
									recentIdsByDesktop,
									allWindows: startMenuWorkspaceContextWindows,
									getWindowsOnDesktop,
									activeDesktopId: startMenuActiveDesktopId,
								});
							const showThisDesktopBadge = Boolean(
								profile.desktopId &&
									profile.desktopId === startMenuActiveDesktopId
							);
							const pinnedSummary = pinnedLine
								? t('startMenu.workspacePinnedSet', {
										line: pinnedLine,
									})
								: t('startMenu.workspaceSummary', {
										apps: profile.appIds.length,
										folders: profile.folderItemIds.length,
									});
							const workspaceTooltip = [
								profile.name,
								profile.description?.trim(),
								vd
									? t('startMenu.workspaceVirtualDesktop', {
											name: vd.name,
										})
									: null,
								openLine,
								recentLine,
								pinnedSummary,
							]
								.filter(Boolean)
								.join('\n');
							return (
								<DesktopChromeTooltip
									key={profile.id}
									content={workspaceTooltip}
									placement="top"
									offsetExtra={4}
								>
									<button
										type="button"
										className={cn(
											START_MENU_EXPANSION_CARD_CLASS,
											showThisDesktopBadge
												? 'ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.38)]'
												: ''
										)}
										onClick={() => {
											expansionLaunchActions?.onOpenWorkspaceProfile?.(
												profile.id
											);
											onClose();
										}}
									>
										<div className="flex gap-2">
											<div
												className="h-12 w-16 shrink-0 rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-panel)"
												style={
													wpResolved
														? isWpImg
															? {
																	backgroundImage: `url(${wpResolved})`,
																	backgroundSize: 'cover',
																	backgroundPosition: 'center',
																}
															: { background: wpResolved }
														: undefined
												}
												aria-hidden
											/>
											<div className="min-w-0 flex-1">
												<span className="block truncate text-sm font-semibold text-(--desktop-text-primary)">
													{profile.name}
												</span>
												{showThisDesktopBadge ? (
													<span
														className={cn(
															DESKTOP_TYPOGRAPHY.caption,
															'mt-0.5 inline-block rounded-full border border-[rgb(var(--desktop-accent-rgb)/0.35)] bg-[rgb(var(--desktop-accent-rgb)/0.12)] px-2 py-0.5 text-[rgb(var(--desktop-accent-rgb)/0.95)]'
														)}
													>
														{t('startMenu.workspaceThisDesktopBadge')}
													</span>
												) : null}
												{vd ? (
													<span
														className={cn(
															DESKTOP_TYPOGRAPHY.caption,
															'mt-0.5 block truncate'
														)}
													>
														{t('startMenu.workspaceVirtualDesktop', {
															name: vd.name,
														})}
													</span>
												) : null}
												{profile.description ? (
													<span
														className={cn(
															DESKTOP_TYPOGRAPHY.caption,
															'mt-0.5 line-clamp-2'
														)}
													>
														{profile.description}
													</span>
												) : null}
												{openLine ? (
													<span
														className={cn(
															DESKTOP_TYPOGRAPHY.caption,
															'mt-1 block line-clamp-2'
														)}
													>
														{openLine}
													</span>
												) : null}
												{recentLine ? (
													<span
														className={cn(
															DESKTOP_TYPOGRAPHY.caption,
															'mt-0.5 block line-clamp-2'
														)}
													>
														{recentLine}
													</span>
												) : null}
												<span
													className={cn(
														DESKTOP_TYPOGRAPHY.caption,
														'mt-1 block'
													)}
												>
													{pinnedLine
														? t('startMenu.workspacePinnedSet', {
																line: pinnedLine,
															})
														: t('startMenu.workspaceSummary', {
																apps: profile.appIds.length,
																folders: profile.folderItemIds.length,
															})}
												</span>
											</div>
										</div>
									</button>
								</DesktopChromeTooltip>
							);
						})}
					</div>
				) : (
					<p className={DESKTOP_TYPOGRAPHY.caption}>
						{t('startMenu.workspacesEmpty')}
					</p>
				)}
			</section>

			<section className="grid gap-3 md:grid-cols-2">
				<div className="rounded-2xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) p-3">
					<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.16em]">
						{t('startMenu.appCollectionsTitle')}
					</DesktopAppSectionLabel>
					<div className="mt-3 space-y-2">
						{showWorkAdvanced &&
						expansionLaunchActions?.onAddAppCollectionFromTemplate ? (
							<>
								<p
									className={cn(
										DESKTOP_TYPOGRAPHY.caption,
										'mb-2 text-(--desktop-text-dim)'
									)}
								>
									{t('settingsPanel.expansionAppCollectionTemplatesHint')}
								</p>
								<div className="mb-3 flex flex-wrap gap-2">
									{DESKTOP_APP_COLLECTION_TEMPLATES.map((tpl) => (
										<DesktopAppButton
											key={tpl.id}
											type="button"
											variant="ghost"
											size="sm"
											disabled={Boolean(expansionState?.isSaving)}
											onClick={() => {
												expansionLaunchActions.onAddAppCollectionFromTemplate?.(
													tpl.id
												);
												onClose();
											}}
										>
											{t(
												`settingsPanel.expansionAppCollectionTemplate.${tpl.id}.label`
											)}
										</DesktopAppButton>
									))}
								</div>
							</>
						) : null}
						{expansionState?.appCollections.length ? (
							expansionState.appCollections.map((collection) => (
								<StartMenuExpansionCardButton
									key={collection.id}
									tooltip={`${collection.name}\n${t(
										'startMenu.appCollectionSummary',
										{
											apps: collection.appIds.length,
										}
									)}`}
									onClick={() => {
										expansionLaunchActions?.onOpenAppCollection?.(
											collection.id
										);
										onClose();
									}}
								>
									<span className="block text-sm font-medium text-(--desktop-text-primary)">
										{collection.name}
									</span>
									<span className={cn(DESKTOP_TYPOGRAPHY.caption, 'block')}>
										{t('startMenu.appCollectionSummary', {
											apps: collection.appIds.length,
										})}
									</span>
								</StartMenuExpansionCardButton>
							))
						) : (
							<p className={cn(DESKTOP_TYPOGRAPHY.caption, 'mt-2')}>
								{t('startMenu.appCollectionsEmpty')}
							</p>
						)}
					</div>
				</div>
				<div className="rounded-2xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) p-3">
					<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.16em]">
						{t('startMenu.contentShortcutsTitle')}
					</DesktopAppSectionLabel>
					<div className="mt-3 space-y-2">
						{expansionState?.contentShortcuts.length ? (
							expansionState.contentShortcuts.map((shortcut) => (
								<StartMenuExpansionCardButton
									key={shortcut.id}
									tooltip={`${shortcut.label}\n${t(
										`startMenu.contentShortcutType.${shortcut.type}`,
										{ defaultValue: shortcut.type }
									)}`}
									onClick={() => {
										expansionLaunchActions?.onOpenContentShortcut?.(
											shortcut.id
										);
										onClose();
									}}
								>
									<span className="block text-sm font-medium text-(--desktop-text-primary)">
										{shortcut.label}
									</span>
									<span className={cn(DESKTOP_TYPOGRAPHY.caption, 'block')}>
										{t(`startMenu.contentShortcutType.${shortcut.type}`, {
											defaultValue: shortcut.type,
										})}
									</span>
								</StartMenuExpansionCardButton>
							))
						) : (
							<p className={cn(DESKTOP_TYPOGRAPHY.caption, 'mt-2')}>
								{t('startMenu.contentShortcutsEmpty')}
							</p>
						)}
					</div>
				</div>
			</section>

			{showWorkAdvanced ? (
				<>
					<section className="rounded-2xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) p-3">
						<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.16em]">
							{t('startMenu.assistantActionsTitle')}
						</DesktopAppSectionLabel>
						<div className="mt-3 flex flex-wrap gap-2">
							{expansionState?.assistantContextActions
								.filter((action) => action.enabled)
								.map((action) => (
									<DesktopAppButton
										key={action.id}
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => {
											expansionLaunchActions?.onOpenAssistantAction?.(
												action.id
											);
											onClose();
										}}
									>
										{t(`settingsPanel.assistantAction.${action.label}`, {
											defaultValue: action.label,
										})}
									</DesktopAppButton>
								))}
						</div>
					</section>

					{expansionLaunchActions?.onOpenGafChatById ? (
						<section className="rounded-2xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) p-3">
							<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.16em]">
								{t('startMenu.gafRecentTitle')}
							</DesktopAppSectionLabel>
							<div className="mt-3 space-y-2">
								{gafRecentQuery.isFetching && !gafRecentQuery.data?.length ? (
									<p className={cn(DESKTOP_TYPOGRAPHY.caption)}>
										{t('startMenu.gafRecentLoading')}
									</p>
								) : null}
								{gafRecentChats.map((chat) => {
									const title =
										chat.partner.full_name?.trim() ||
										chat.partner.username?.trim() ||
										t('startMenu.gafChatFallback');
									return (
										<StartMenuExpansionCardButton
											key={chat.chat_id}
											tooltip={startMenuGafChatTooltip(
												title,
												chat.last_message_preview
											)}
											onClick={() => {
												expansionLaunchActions.onOpenGafChatById?.(
													chat.chat_id
												);
												onClose();
											}}
										>
											<span className="flex min-w-0 items-center gap-2">
												<ChatBubbleLeftRightIcon
													className="h-4 w-4 shrink-0 text-(--desktop-text-muted)"
													strokeWidth={DESKTOP_LUCIDE.stroke}
													aria-hidden
												/>
												<span className="min-w-0 flex-1 truncate text-sm font-medium text-(--desktop-text-primary)">
													{title}
												</span>
												{chat.unread_count > 0 ? (
													<span
														className={cn(
															DESKTOP_TYPOGRAPHY.small,
															'shrink-0 rounded-full bg-(--desktop-surface-accent) px-2 py-0.5 font-semibold tabular-nums text-(--desktop-text-primary)'
														)}
													>
														{chat.unread_count}
													</span>
												) : null}
											</span>
											{chat.last_message_preview?.trim() ? (
												<span
													className={cn(
														DESKTOP_TYPOGRAPHY.caption,
														'mt-1 line-clamp-2 block pl-6 text-(--desktop-text-muted)'
													)}
												>
													{chat.last_message_preview.trim()}
												</span>
											) : null}
										</StartMenuExpansionCardButton>
									);
								})}
								{!gafRecentQuery.isFetching &&
								gafRecentChats.length === 0 &&
								gafRecentQuery.isFetched ? (
									<p className={cn(DESKTOP_TYPOGRAPHY.caption)}>
										{t('startMenu.gafRecentEmpty')}
									</p>
								) : null}
							</div>
						</section>
					) : null}
				</>
			) : null}
		</div>
	);
}
