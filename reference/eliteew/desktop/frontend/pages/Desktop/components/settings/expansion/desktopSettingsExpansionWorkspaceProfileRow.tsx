/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Editable workspace profile row for expansion settings lists.
 *
 * Invariants:
 * - Shared by plain and virtualized workspace profile lists.
 *
 * Related:
 * - `desktopSettingsExpansionLists.tsx`
 * - `DesktopChromeTooltip.tsx`
 */

import { cn } from '@/utils/cn';
import { useTranslation } from 'react-i18next';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type {
	DesktopExpansionSettings,
	DesktopWorkspaceProfile,
} from '../../../types/desktopExpansion.types';
import type { SettingsCenterVirtualDesktopRow } from '../../../types/desktopSettingsCenterBridge.types';
import type { DesktopItem } from '../../../types/desktop.types';
import {
	effectiveRecentIdsForWorkspaceProfile,
	filterWindowsOnVirtualDesktop,
	recentAppNamesForWorkspaceProfile,
	resolveWorkspaceProfileTargetDesktopId,
	summarizeOpenWindowsForDisplay,
} from '../../../utils/desktopWorkspaceProfileLiveDisplay';
import { DESKTOP_TYPOGRAPHY } from '../../../constants';
import { DesktopAppButton } from '../../DesktopAppChrome';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import type { DesktopSettingsWorkspaceProfilesShellContext } from '../desktopSettingsShared.types';

export type WorkspaceProfileExpansionRowProps = {
	profile: DesktopWorkspaceProfile;
	expansionSettings: DesktopExpansionSettings;
	fieldClass: string;
	editorContext?: {
		virtualDesktops: SettingsCenterVirtualDesktopRow[];
		globalWallpaper: string;
	};
	workspaceProfilesShellContext?: DesktopSettingsWorkspaceProfilesShellContext;
	itemCatalog: Map<string, DesktopItem>;
	recentIds: string[];
	recentIdsByDesktop: Record<string, string[]>;
};

export function WorkspaceProfileExpansionRow({
	profile,
	expansionSettings,
	fieldClass,
	editorContext,
	workspaceProfilesShellContext,
	itemCatalog,
	recentIds,
	recentIdsByDesktop,
}: WorkspaceProfileExpansionRowProps) {
	const { t } = useTranslation('desktopUi');
	return (
		<div
			className={cn(
				'rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2',
				workspaceProfilesShellContext &&
					profile.desktopId &&
					profile.desktopId === workspaceProfilesShellContext.activeDesktopId
					? 'ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.35)]'
					: ''
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0 flex-1 space-y-2">
					{workspaceProfilesShellContext &&
					profile.desktopId &&
					profile.desktopId ===
						workspaceProfilesShellContext.activeDesktopId ? (
						<p
							className={cn(
								DESKTOP_TYPOGRAPHY.caption,
								'text-[rgb(var(--desktop-accent-rgb)/0.95)]'
							)}
						>
							{t('settingsPanel.expansionLiveThisDesktop')}
						</p>
					) : null}
					<label className="block space-y-1">
						<span className={DESKTOP_TYPOGRAPHY.caption}>
							{t('settingsPanel.expansionProfileNameLabel')}
						</span>
						<input
							type="text"
							defaultValue={profile.name}
							disabled={expansionSettings.isSaving}
							onBlur={(e) => {
								const v = e.currentTarget.value.trim();
								if (v && v !== profile.name) {
									void expansionSettings.patchWorkspaceProfile(profile.id, {
										name: v,
									});
								}
							}}
							className={fieldClass}
						/>
					</label>
					<label className="block space-y-1">
						<span className={DESKTOP_TYPOGRAPHY.caption}>
							{t('settingsPanel.expansionProfileDescLabel')}
						</span>
						<input
							type="text"
							defaultValue={profile.description ?? ''}
							disabled={expansionSettings.isSaving}
							onBlur={(e) => {
								const raw = e.currentTarget.value;
								const nextDesc = raw.trim() || undefined;
								const prev = profile.description ?? undefined;
								if (nextDesc !== prev) {
									void expansionSettings.patchWorkspaceProfile(profile.id, {
										description: raw,
									});
								}
							}}
							className={fieldClass}
						/>
					</label>
					{editorContext ? (
						<>
							<label className="block space-y-1">
								<span className={DESKTOP_TYPOGRAPHY.caption}>
									{t('settingsPanel.expansionProfileDesktopLabel')}
								</span>
								<select
									className={fieldClass}
									disabled={expansionSettings.isSaving}
									value={profile.desktopId ?? ''}
									onChange={(e) =>
										void expansionSettings.patchWorkspaceProfile(profile.id, {
											desktopId: e.target.value || undefined,
										})
									}
								>
									<option value="">
										{t('settingsPanel.expansionProfileDesktopUnset')}
									</option>
									{editorContext.virtualDesktops.map((d) => (
										<option key={d.id} value={d.id}>
											{d.name}
										</option>
									))}
								</select>
							</label>
							<label className="block space-y-1">
								<span className={DESKTOP_TYPOGRAPHY.caption}>
									{t('settingsPanel.expansionProfileWallpaperLabel')}
								</span>
								<div className="flex flex-wrap items-center gap-2">
									<input
										type="text"
										defaultValue={profile.wallpaper ?? ''}
										disabled={expansionSettings.isSaving}
										onBlur={(e) => {
											const raw = e.currentTarget.value;
											const nextWp = raw.trim() || undefined;
											const prev = profile.wallpaper ?? undefined;
											if (nextWp !== prev) {
												void expansionSettings.patchWorkspaceProfile(
													profile.id,
													{ wallpaper: raw }
												);
											}
										}}
										className={cn(fieldClass, 'min-w-0 flex-1')}
									/>
									<DesktopChromeTooltip
										content={t(
											'settingsPanel.expansionProfileWallpaperUseGlobal'
										)}
										placement="top"
										offsetExtra={4}
									>
										<DesktopAppButton
											type="button"
											variant="ghost"
											size="sm"
											disabled={
												expansionSettings.isSaving ||
												!editorContext.globalWallpaper.trim()
											}
											onClick={() =>
												void expansionSettings.patchWorkspaceProfile(
													profile.id,
													{
														wallpaper: editorContext.globalWallpaper.trim(),
													}
												)
											}
										>
											{t('settingsPanel.expansionProfileWallpaperUseGlobal')}
										</DesktopAppButton>
									</DesktopChromeTooltip>
								</div>
							</label>
						</>
					) : null}
					<p className={cn(DESKTOP_TYPOGRAPHY.caption, 'pt-0.5')}>
						{t('settingsPanel.expansionWorkspaceSummary', {
							apps: profile.appIds.length,
							folders: profile.folderItemIds.length,
						})}
					</p>
					{workspaceProfilesShellContext ? (
						<div className="space-y-1 border-t border-(--desktop-border-subtle) pt-2">
							{(() => {
								const target = resolveWorkspaceProfileTargetDesktopId(
									profile,
									workspaceProfilesShellContext.activeDesktopId
								);
								if (!target) return null;
								const wins = filterWindowsOnVirtualDesktop(
									workspaceProfilesShellContext.windows,
									workspaceProfilesShellContext.getWindowsOnDesktop,
									target
								);
								const sum = summarizeOpenWindowsForDisplay(wins, 4);
								const effectiveRecent = effectiveRecentIdsForWorkspaceProfile(
									recentIds,
									recentIdsByDesktop,
									profile,
									workspaceProfilesShellContext.activeDesktopId
								);
								const recentNames = recentAppNamesForWorkspaceProfile(
									effectiveRecent,
									profile,
									itemCatalog,
									4
								);
								const listSep = t('settingsPanel.expansionLiveListSep');
								let openCaption: string;
								if (sum.totalCount === 0) {
									openCaption = t('settingsPanel.expansionLiveOpenWindowsNone');
								} else if (sum.visibleCount === 0) {
									openCaption = t(
										'settingsPanel.expansionLiveOpenWindowsAllMinimized',
										{ count: sum.minimizedCount }
									);
								} else {
									const minimizedSuffix =
										sum.minimizedCount > 0
											? t('settingsPanel.expansionLiveMinimizedSuffix', {
													count: sum.minimizedCount,
												})
											: '';
									openCaption = t(
										'settingsPanel.expansionLiveOpenWindowsLine',
										{
											titles: sum.visibleTitles.join(listSep),
											minimizedSuffix,
										}
									);
								}
								return (
									<>
										<p className={DESKTOP_TYPOGRAPHY.caption}>{openCaption}</p>
										{recentNames.length > 0 ? (
											<p className={DESKTOP_TYPOGRAPHY.caption}>
												{t('settingsPanel.expansionLiveRecentLine', {
													names: recentNames.join(listSep),
												})}
											</p>
										) : null}
									</>
								);
							})()}
						</div>
					) : null}
				</div>
				<DesktopChromeTooltip
					content={t('settingsPanel.expansionRemove')}
					placement="top"
					offsetExtra={4}
				>
					<DesktopAppButton
						type="button"
						variant="ghost"
						size="icon"
						onClick={() =>
							void expansionSettings.removeWorkspaceProfile(profile.id)
						}
						disabled={expansionSettings.isSaving}
						aria-label={t('settingsPanel.expansionRemove')}
						className="h-8 min-h-8 w-8 min-w-8 shrink-0"
					>
						<XMarkIcon className="size-4" aria-hidden />
					</DesktopAppButton>
				</DesktopChromeTooltip>
			</div>
		</div>
	);
}
