/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Recent-tab discovery content above the app grid: library overview, continue,
 * recommended apps, and library slices with the recent-apps section label.
 *
 * Invariants:
 * - App card grid stays in parent (`StartMenuAppGrid`); this module is discovery only.
 *
 * Related:
 * - ../StartMenu.tsx
 * - ./startMenuPrimitives.tsx
 */

import type * as React from 'react';
import { cn } from '@/utils/cn';
import type { TFunction } from 'i18next';
import {
	ArrowPathIcon,
	ArrowUpTrayIcon,
	ClockIcon,
	FolderIcon,
	PlusIcon,
	SparklesIcon,
	Squares2X2Icon,
} from '@heroicons/react/24/outline';
import type { DesktopIconStyle } from '../../../../types/profile';
import {
	DESKTOP_INTERACTIVE,
	DESKTOP_LUCIDE,
	DESKTOP_TYPOGRAPHY,
} from '../../constants';
import type { StartMenuTab } from '../../types/desktopStartMenu';
import type { DesktopItem, RecentFile } from '../../types/desktop.types';
import type { DesktopLibraryDiscoverySlices } from '../../utils/desktopDiscoveryModel';
import {
	DESKTOP_LIBRARY_FEED_CARD_START_MENU,
	DESKTOP_LIBRARY_FEED_ICON_WRAP_START_MENU,
	DESKTOP_START_MENU_SOFT_SECTION,
} from '../../utils/desktopLibraryFeedCard';
import { DesktopAppButton, DesktopAppSectionLabel } from '../DesktopAppChrome';
import { DesktopAppBadge } from '../../utils/desktopVisualSystem';
import { DesktopChromeTooltip } from '../DesktopChromeTooltip';
import {
	StartMenuListRowButton,
	startMenuFileRowTooltip,
} from './startMenuPrimitives';

export type StartMenuRecentDiscoveryProps = {
	activeTab: StartMenuTab;
	t: TFunction<'desktopUi'>;
	search: string;
	onClose: () => void;
	showLibraryDiscovery: boolean;
	setShowLibraryDiscovery: React.Dispatch<React.SetStateAction<boolean>>;
	setShowMoreTabs: React.Dispatch<React.SetStateAction<boolean>>;
	setActiveTab: (tab: StartMenuTab) => void;
	recentContentFeedLoading: boolean;
	recentContentFeedError: string | null;
	hasRecentContentFeedItems: boolean;
	recentContentFeedLoadedAt: number | null;
	onRefetchRecentContentFeed?: () => void | Promise<void>;
	contentManagerApp?: DesktopItem;
	onOpenShellWorkspacesSettings?: () => void;
	resumeWindows: { id: string; title: string }[];
	onResumeOpenWindow?: (windowId: string) => void;
	recommendedAppsFiltered: DesktopItem[];
	openAppFromStart: (app: DesktopItem) => void;
	iconStyle: DesktopIconStyle;
	libraryDiscovery: DesktopLibraryDiscoverySlices;
	recentDocumentsUnified: RecentFile[];
	onOpenRecentFile?: (file: RecentFile) => void;
	onRemoveRecentFile?: (fileId: string) => void;
	shellRecentFileIdSet: Set<string>;
};

export function StartMenuRecentDiscovery({
	activeTab,
	t,
	search,
	onClose,
	showLibraryDiscovery,
	setShowLibraryDiscovery,
	setShowMoreTabs,
	setActiveTab,
	recentContentFeedLoading,
	recentContentFeedError,
	hasRecentContentFeedItems,
	recentContentFeedLoadedAt,
	onRefetchRecentContentFeed,
	contentManagerApp,
	onOpenShellWorkspacesSettings,
	resumeWindows,
	onResumeOpenWindow,
	recommendedAppsFiltered,
	openAppFromStart,
	iconStyle,
	libraryDiscovery,
	recentDocumentsUnified,
	onOpenRecentFile,
	onRemoveRecentFile,
	shellRecentFileIdSet,
}: StartMenuRecentDiscoveryProps) {
	if (activeTab !== 'recent') {
		return null;
	}

	const recentTabHasContentAboveApps =
		!search.trim() &&
		(resumeWindows.length > 0 ||
			(showLibraryDiscovery &&
				(recommendedAppsFiltered.length > 0 ||
					(Boolean(onOpenRecentFile) && libraryDiscovery.hasAnyLibraryRows))));

	return (
		<>
			<section
				className={cn(
					DESKTOP_TYPOGRAPHY.caption,
					'flex flex-wrap items-center justify-between gap-2 rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2 text-(--desktop-text-muted)'
				)}
			>
				<span>
					{recentContentFeedLoading
						? t('startMenu.libraryFeedLoading')
						: recentContentFeedError
							? t('startMenu.libraryFeedErrorHint')
							: hasRecentContentFeedItems
								? t('startMenu.discoveryOverviewBodyOk')
								: t('startMenu.discoveryOverviewBodyEmpty')}
				</span>
				<DesktopAppButton
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setShowLibraryDiscovery((visible) => !visible)}
					aria-expanded={showLibraryDiscovery}
					aria-controls="start-menu-library-details"
				>
					{showLibraryDiscovery
						? t('startMenu.hideLibraryDetails')
						: t('startMenu.showLibraryDetails')}
				</DesktopAppButton>
			</section>
			{showLibraryDiscovery ? (
				<section
					id="start-menu-library-details"
					className={DESKTOP_LIBRARY_FEED_CARD_START_MENU}
					aria-label={t('startMenu.libraryDetailsSectionAria')}
				>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div className="flex min-w-0 flex-1 gap-3">
							<div
								className={DESKTOP_LIBRARY_FEED_ICON_WRAP_START_MENU}
								aria-hidden
							>
								<Squares2X2Icon
									className={DESKTOP_LUCIDE.sm}
									strokeWidth={DESKTOP_LUCIDE.stroke}
								/>
							</div>
							<div className="min-w-0">
								<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.16em]">
									{t('startMenu.discoveryOverviewTitle')}
								</DesktopAppSectionLabel>
								<p
									className={cn(
										DESKTOP_TYPOGRAPHY.caption,
										'mt-1 text-(--desktop-text-muted)',
										recentContentFeedLoading && 'animate-pulse'
									)}
								>
									{recentContentFeedLoading
										? t('startMenu.libraryFeedLoading')
										: recentContentFeedError
											? t('startMenu.libraryFeedErrorHint')
											: hasRecentContentFeedItems
												? t('startMenu.discoveryOverviewBodyOk')
												: t('startMenu.discoveryOverviewBodyEmpty')}
								</p>
								{recentContentFeedLoadedAt && !recentContentFeedError ? (
									<p
										className={cn(
											DESKTOP_TYPOGRAPHY.caption,
											'mt-0.5 text-(--desktop-text-dim)'
										)}
									>
										{t('startMenu.libraryFeedUpdatedAt', {
											time: new Date(
												recentContentFeedLoadedAt
											).toLocaleString(),
										})}
									</p>
								) : null}
							</div>
						</div>
						<div className="flex shrink-0 flex-wrap gap-2 sm:max-w-[min(100%,20rem)] sm:justify-end">
							{onRefetchRecentContentFeed ? (
								<DesktopAppButton
									type="button"
									variant="ghost"
									size="sm"
									disabled={recentContentFeedLoading}
									onClick={() => {
										void onRefetchRecentContentFeed();
									}}
								>
									<ArrowPathIcon
										className={cn(
											DESKTOP_LUCIDE.sm,
											recentContentFeedLoading && 'animate-spin'
										)}
										strokeWidth={DESKTOP_LUCIDE.stroke}
										aria-hidden
									/>
									<span className="ms-1.5">
										{t('startMenu.refreshLibraryFeed')}
									</span>
								</DesktopAppButton>
							) : null}
							{contentManagerApp ? (
								<DesktopAppButton
									type="button"
									variant="neutral"
									size="sm"
									onClick={() => {
										openAppFromStart(contentManagerApp);
										onClose();
									}}
								>
									{t('startMenu.openContentLibrary')}
								</DesktopAppButton>
							) : null}
							{onOpenShellWorkspacesSettings ? (
								<DesktopAppButton
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => {
										onOpenShellWorkspacesSettings();
										onClose();
									}}
								>
									{t('startMenu.configureWorkspaces')}
								</DesktopAppButton>
							) : null}
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => {
									setShowMoreTabs(true);
									setActiveTab('work');
								}}
							>
								{t('startMenu.goToWorkTab')}
							</DesktopAppButton>
						</div>
					</div>
					{recentContentFeedError ? (
						<p
							className={cn(
								'mt-3 rounded-lg border px-3 py-2 text-sm',
								'border-red-500/25 bg-red-500/6 text-(--desktop-text-primary)'
							)}
							role="alert"
						>
							{recentContentFeedError}
						</p>
					) : null}
				</section>
			) : null}
			{resumeWindows.length > 0 ? (
				<section className={DESKTOP_START_MENU_SOFT_SECTION}>
					<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.16em]">
						{t('startMenu.continueTitle')}
					</DesktopAppSectionLabel>
					<ul className="mt-2 space-y-0.5">
						{resumeWindows.slice(0, 8).map((w) => (
							<li key={w.id}>
								<StartMenuListRowButton
									tooltip={w.title}
									onClick={() => {
										onResumeOpenWindow?.(w.id);
										onClose();
									}}
								>
									<span className="line-clamp-2">{w.title}</span>
								</StartMenuListRowButton>
							</li>
						))}
					</ul>
				</section>
			) : null}
			{showLibraryDiscovery && recommendedAppsFiltered.length > 0 ? (
				<section className={DESKTOP_START_MENU_SOFT_SECTION}>
					<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.16em]">
						{t('startMenu.recommendedForSpaceTitle')}
					</DesktopAppSectionLabel>
					<div className="mt-2 flex flex-wrap gap-2">
						{recommendedAppsFiltered.slice(0, 16).map((app) => (
							<DesktopChromeTooltip
								key={app.id}
								content={app.name}
								placement="top"
								offsetExtra={4}
							>
								<button
									type="button"
									data-start-app-id={app.id}
									className={cn(
										'inline-flex max-w-full items-center gap-2 rounded-xl border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-soft)_90%,var(--desktop-surface-panel)_10%)] px-2.5 py-1.5 text-left text-sm text-(--desktop-text-primary) sm:max-w-56',
										'hover:border-(--desktop-border-strong) hover:bg-(--desktop-surface-soft-hover)',
										DESKTOP_INTERACTIVE.focusRing
									)}
									onClick={() => openAppFromStart(app)}
								>
									<DesktopAppBadge
										appComponent={app.appComponent}
										icon={app.icon}
										variant="start"
										className="h-8 w-8 shrink-0"
										iconStyle={iconStyle}
									/>
									<span className="min-w-0 wrap-anywhere leading-snug">
										{app.name}
									</span>
								</button>
							</DesktopChromeTooltip>
						))}
					</div>
				</section>
			) : null}
			{showLibraryDiscovery &&
			recentDocumentsUnified.length > 0 &&
			onOpenRecentFile ? (
				<section className={DESKTOP_LIBRARY_FEED_CARD_START_MENU}>
					<div className="flex gap-3">
						<div
							className={DESKTOP_LIBRARY_FEED_ICON_WRAP_START_MENU}
							aria-hidden
						>
							<ClockIcon
								className={DESKTOP_LUCIDE.sm}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						</div>
						<div className="min-w-0 flex-1">
							<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.16em]">
								{t('startMenu.recentDocumentsUnifiedTitle')}
							</DesktopAppSectionLabel>
							<ul className="mt-3 space-y-0.5">
								{recentDocumentsUnified.map((f) => (
									<li key={f.id} className="flex items-center gap-1">
										<StartMenuListRowButton
											tooltip={startMenuFileRowTooltip(f.name, f.path)}
											className="min-w-0 flex-1"
											onClick={() => {
												onOpenRecentFile(f);
												onClose();
											}}
										>
											<span className="line-clamp-1 font-medium">{f.name}</span>
											<span
												className={cn(
													DESKTOP_TYPOGRAPHY.caption,
													'line-clamp-1 text-(--desktop-text-muted)'
												)}
											>
												{f.path}
											</span>
										</StartMenuListRowButton>
										{onRemoveRecentFile && shellRecentFileIdSet.has(f.id) ? (
											<DesktopChromeTooltip
												content={t('startMenu.removeRecentFileAria')}
												placement="top"
												offsetExtra={4}
											>
												<button
													type="button"
													className={cn(
														'shrink-0 rounded-lg px-2 py-2 text-(--desktop-text-muted) hover:bg-(--desktop-surface-soft-hover) hover:text-(--desktop-text-secondary)',
														DESKTOP_INTERACTIVE.focusRing
													)}
													aria-label={t('startMenu.removeRecentFileAria')}
													onClick={() => onRemoveRecentFile(f.id)}
												>
													×
												</button>
											</DesktopChromeTooltip>
										) : null}
									</li>
								))}
							</ul>
						</div>
					</div>
				</section>
			) : null}
			{showLibraryDiscovery &&
			libraryDiscovery.projects.length > 0 &&
			onOpenRecentFile ? (
				<section className={DESKTOP_LIBRARY_FEED_CARD_START_MENU}>
					<div className="flex gap-3">
						<div
							className={DESKTOP_LIBRARY_FEED_ICON_WRAP_START_MENU}
							aria-hidden
						>
							<FolderIcon
								className={DESKTOP_LUCIDE.sm}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						</div>
						<div className="min-w-0 flex-1">
							<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.16em]">
								{t('startMenu.recentProjectsTitle')}
							</DesktopAppSectionLabel>
							<ul className="mt-3 space-y-0.5">
								{libraryDiscovery.projects.map((p) => (
									<li key={`proj-${p.id}`}>
										<StartMenuListRowButton
											tooltip={startMenuFileRowTooltip(p.name, p.path)}
											onClick={() => {
												onOpenRecentFile(p);
												onClose();
											}}
										>
											<span className="line-clamp-1 font-medium">{p.name}</span>
											{p.path ? (
												<span
													className={cn(
														DESKTOP_TYPOGRAPHY.caption,
														'line-clamp-1 text-(--desktop-text-muted)'
													)}
												>
													{p.path}
												</span>
											) : null}
										</StartMenuListRowButton>
									</li>
								))}
							</ul>
						</div>
					</div>
				</section>
			) : null}
			{showLibraryDiscovery &&
			libraryDiscovery.generated.length > 0 &&
			onOpenRecentFile ? (
				<section className={DESKTOP_LIBRARY_FEED_CARD_START_MENU}>
					<div className="flex gap-3">
						<div
							className={DESKTOP_LIBRARY_FEED_ICON_WRAP_START_MENU}
							aria-hidden
						>
							<SparklesIcon
								className={DESKTOP_LUCIDE.sm}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						</div>
						<div className="min-w-0 flex-1">
							<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.16em]">
								{t('startMenu.libraryGeneratedTitle')}
							</DesktopAppSectionLabel>
							<ul className="mt-3 space-y-0.5">
								{libraryDiscovery.generated.map((f) => (
									<li key={`gen-${f.id}`}>
										<StartMenuListRowButton
											tooltip={startMenuFileRowTooltip(f.name, f.path)}
											onClick={() => {
												onOpenRecentFile(f);
												onClose();
											}}
										>
											<span className="line-clamp-1 font-medium">{f.name}</span>
											{f.path ? (
												<span
													className={cn(
														DESKTOP_TYPOGRAPHY.caption,
														'line-clamp-1 text-(--desktop-text-muted)'
													)}
												>
													{f.path}
												</span>
											) : null}
										</StartMenuListRowButton>
									</li>
								))}
							</ul>
						</div>
					</div>
				</section>
			) : null}
			{showLibraryDiscovery &&
			libraryDiscovery.uploaded.length > 0 &&
			onOpenRecentFile ? (
				<section className={DESKTOP_LIBRARY_FEED_CARD_START_MENU}>
					<div className="flex gap-3">
						<div
							className={DESKTOP_LIBRARY_FEED_ICON_WRAP_START_MENU}
							aria-hidden
						>
							<ArrowUpTrayIcon
								className={DESKTOP_LUCIDE.sm}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						</div>
						<div className="min-w-0 flex-1">
							<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.16em]">
								{t('startMenu.libraryUploadedTitle')}
							</DesktopAppSectionLabel>
							<ul className="mt-3 space-y-0.5">
								{libraryDiscovery.uploaded.map((f) => (
									<li key={`up-${f.id}`}>
										<StartMenuListRowButton
											tooltip={startMenuFileRowTooltip(f.name, f.path)}
											onClick={() => {
												onOpenRecentFile(f);
												onClose();
											}}
										>
											<span className="line-clamp-1 font-medium">{f.name}</span>
											{f.path ? (
												<span
													className={cn(
														DESKTOP_TYPOGRAPHY.caption,
														'line-clamp-1 text-(--desktop-text-muted)'
													)}
												>
													{f.path}
												</span>
											) : null}
										</StartMenuListRowButton>
									</li>
								))}
							</ul>
						</div>
					</div>
				</section>
			) : null}
			{showLibraryDiscovery &&
			libraryDiscovery.added.length > 0 &&
			onOpenRecentFile ? (
				<section className={DESKTOP_LIBRARY_FEED_CARD_START_MENU}>
					<div className="flex gap-3">
						<div
							className={DESKTOP_LIBRARY_FEED_ICON_WRAP_START_MENU}
							aria-hidden
						>
							<PlusIcon
								className={DESKTOP_LUCIDE.sm}
								strokeWidth={DESKTOP_LUCIDE.stroke}
							/>
						</div>
						<div className="min-w-0 flex-1">
							<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.16em]">
								{t('startMenu.libraryAddedTitle')}
							</DesktopAppSectionLabel>
							<ul className="mt-3 space-y-0.5">
								{libraryDiscovery.added.map((f) => (
									<li key={`added-${f.id}`}>
										<StartMenuListRowButton
											tooltip={startMenuFileRowTooltip(f.name, f.path)}
											onClick={() => {
												onOpenRecentFile(f);
												onClose();
											}}
										>
											<span className="line-clamp-1 font-medium">{f.name}</span>
											{f.path ? (
												<span
													className={cn(
														DESKTOP_TYPOGRAPHY.caption,
														'line-clamp-1 text-(--desktop-text-muted)'
													)}
												>
													{f.path}
												</span>
											) : null}
										</StartMenuListRowButton>
									</li>
								))}
							</ul>
						</div>
					</div>
				</section>
			) : null}
			<div
				className={cn(
					'mb-2',
					recentTabHasContentAboveApps &&
						'mt-1 border-t border-(--desktop-border-subtle) pt-5'
				)}
			>
				<DesktopAppSectionLabel className="desktop-shell-display-text tracking-[0.16em]">
					{search.trim()
						? t('startMenu.matchingAppsSectionTitle')
						: t('startMenu.recentAppsSectionTitle')}
				</DesktopAppSectionLabel>
			</div>
		</>
	);
}
