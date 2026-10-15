/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * App collections and content shortcuts card.
 *
 * Invariants:
 * - Lazy-loaded from `DesktopSettingsExpansionSection`.
 *
 * Related:
 * - `desktopSettingsExpansionSection.types.ts`
 * - `DesktopChromeTooltip.tsx`
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import {
	DesktopAppButton,
	DESKTOP_CHROME_FOCUS_VISIBLE,
} from '../../DesktopAppChrome';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import { DESKTOP_TYPOGRAPHY } from '../../../constants';
import { DESKTOP_APP_COLLECTION_TEMPLATES } from '../../../constants/desktopAppCollectionTemplates';
import { buildDesktopSettingsFieldElementId } from '../../../utils/desktopSettingsFieldElementIds';
import { SettingsFormCard } from '../DesktopSettingsFormCard';
import type { ExpansionSettingsSectionProps } from './desktopSettingsExpansionSection.types';
import {
	ExpansionCounters,
	ExpansionList,
} from './desktopSettingsExpansionLists';

export function DesktopSettingsExpansionDiscoveryCard({
	expansionSettings,
	shell,
	savedFilterShortcutDraft,
	setSavedFilterShortcutDraft,
}: Pick<
	ExpansionSettingsSectionProps,
	| 'expansionSettings'
	| 'shell'
	| 'savedFilterShortcutDraft'
	| 'setSavedFilterShortcutDraft'
>) {
	const { t } = useTranslation('desktopUi');
	return (
		<SettingsFormCard
			id={buildDesktopSettingsFieldElementId('shell_state', 'app_collections')}
			title={t('settingsPanel.cardAppContentDiscoveryTitle')}
			windowStyle={shell.windowStyle}
		>
			<ExpansionCounters
				shell={shell}
				items={[
					{
						label: t('settingsPanel.expansionCounterAppCollections'),
						value: expansionSettings.appCollections.length,
					},
					{
						label: t('settingsPanel.expansionCounterContentShortcuts'),
						value: expansionSettings.contentShortcuts.length,
					},
				]}
			/>
			<div className="flex min-w-0 flex-wrap gap-2">
				{(
					[
						{
							key: 'addCollection',
							label: t('settingsPanel.expansionAddAppCollection'),
							onClick: () => void expansionSettings.addAppCollection(),
							disabled: expansionSettings.isSaving,
						},
						{
							key: 'addShortcut',
							label: t('settingsPanel.expansionAddContentShortcut'),
							onClick: () => void expansionSettings.addContentShortcut(),
							disabled: expansionSettings.isSaving,
						},
						{
							key: 'addSavedFilter',
							label: t('settingsPanel.expansionAddSavedFilterContentShortcut'),
							onClick: () => {
								const m = savedFilterShortcutDraft.filesBrowseMode;
								void expansionSettings.addSavedFilterContentShortcut({
									label: savedFilterShortcutDraft.label,
									searchQuery:
										savedFilterShortcutDraft.searchQuery || undefined,
									filterType: savedFilterShortcutDraft.filterType || undefined,
									filterVisibility:
										savedFilterShortcutDraft.filterVisibility || undefined,
									filterCompanyId:
										savedFilterShortcutDraft.filterCompanyId || undefined,
									filterProjectId:
										savedFilterShortcutDraft.filterProjectId || undefined,
									filterFolderId:
										savedFilterShortcutDraft.filterFolderId || undefined,
									filesBrowseMode: m || undefined,
									explorerFolderTarget:
										savedFilterShortcutDraft.explorerFolderTarget || undefined,
								});
								setSavedFilterShortcutDraft({
									label: '',
									searchQuery: '',
									filterType: '',
									filterVisibility: '',
									filterCompanyId: '',
									filterProjectId: '',
									filterFolderId: '',
									filesBrowseMode: '',
									explorerFolderTarget: '',
								});
							},
							disabled:
								expansionSettings.isSaving ||
								!savedFilterShortcutDraft.label.trim(),
						},
					] as const
				).map(({ key, label, onClick, disabled }) => (
					<DesktopChromeTooltip
						key={key}
						content={label}
						placement="top"
						offsetExtra={4}
					>
						<DesktopAppButton
							type="button"
							variant="neutral"
							onClick={onClick}
							disabled={disabled}
						>
							{label}
						</DesktopAppButton>
					</DesktopChromeTooltip>
				))}
			</div>
			<div className="mt-4 grid gap-2 rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-panel-strong) p-3 sm:grid-cols-2">
				<label className="sm:col-span-2 flex flex-col gap-1">
					<span
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'text-(--desktop-text-secondary)'
						)}
					>
						{t('settingsPanel.expansionSavedFilterLabelField')}
					</span>
					<input
						type="text"
						className={cn(
							'rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1.5 text-sm text-(--desktop-text-primary)',
							DESKTOP_CHROME_FOCUS_VISIBLE
						)}
						value={savedFilterShortcutDraft.label}
						onChange={(e) =>
							setSavedFilterShortcutDraft((p) => ({
								...p,
								label: e.target.value,
							}))
						}
						placeholder={t(
							'settingsPanel.expansionSavedFilterLabelPlaceholder'
						)}
					/>
				</label>
				<label className="flex flex-col gap-1">
					<span
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'text-(--desktop-text-secondary)'
						)}
					>
						{t('settingsPanel.expansionSavedFilterSearchField')}
					</span>
					<input
						type="text"
						className={cn(
							'rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1.5 text-sm',
							DESKTOP_CHROME_FOCUS_VISIBLE
						)}
						value={savedFilterShortcutDraft.searchQuery}
						onChange={(e) =>
							setSavedFilterShortcutDraft((p) => ({
								...p,
								searchQuery: e.target.value,
							}))
						}
					/>
				</label>
				<label className="flex flex-col gap-1">
					<span
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'text-(--desktop-text-secondary)'
						)}
					>
						{t('settingsPanel.expansionSavedFilterBrowseModeField')}
					</span>
					<select
						className={cn(
							'rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1.5 text-sm',
							DESKTOP_CHROME_FOCUS_VISIBLE
						)}
						value={savedFilterShortcutDraft.filesBrowseMode}
						onChange={(e) =>
							setSavedFilterShortcutDraft((p) => ({
								...p,
								filesBrowseMode: e.target.value as
									| ''
									| 'catalog'
									| 'explorer'
									| 'all_files',
							}))
						}
					>
						<option value="">
							{t('settingsPanel.expansionSavedFilterBrowseModeDefault')}
						</option>
						<option value="explorer">
							{t('settingsPanel.expansionSavedFilterBrowseModeExplorer')}
						</option>
						<option value="catalog">
							{t('settingsPanel.expansionSavedFilterBrowseModeCatalog')}
						</option>
						<option value="all_files">
							{t('settingsPanel.expansionSavedFilterBrowseModeAllFiles')}
						</option>
					</select>
				</label>
				<label className="flex flex-col gap-1">
					<span
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'text-(--desktop-text-secondary)'
						)}
					>
						{t('settingsPanel.expansionSavedFilterTypeField')}
					</span>
					<input
						type="text"
						className={cn(
							'rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1.5 text-sm',
							DESKTOP_CHROME_FOCUS_VISIBLE
						)}
						value={savedFilterShortcutDraft.filterType}
						onChange={(e) =>
							setSavedFilterShortcutDraft((p) => ({
								...p,
								filterType: e.target.value,
							}))
						}
						placeholder="all"
					/>
				</label>
				<label className="flex flex-col gap-1">
					<span
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'text-(--desktop-text-secondary)'
						)}
					>
						{t('settingsPanel.expansionSavedFilterVisibilityField')}
					</span>
					<input
						type="text"
						className={cn(
							'rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1.5 text-sm',
							DESKTOP_CHROME_FOCUS_VISIBLE
						)}
						value={savedFilterShortcutDraft.filterVisibility}
						onChange={(e) =>
							setSavedFilterShortcutDraft((p) => ({
								...p,
								filterVisibility: e.target.value,
							}))
						}
						placeholder="all"
					/>
				</label>
				<label className="flex flex-col gap-1">
					<span
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'text-(--desktop-text-secondary)'
						)}
					>
						{t('settingsPanel.expansionSavedFilterCompanyIdField')}
					</span>
					<input
						type="text"
						className={cn(
							'rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1.5 text-sm',
							DESKTOP_CHROME_FOCUS_VISIBLE
						)}
						value={savedFilterShortcutDraft.filterCompanyId}
						onChange={(e) =>
							setSavedFilterShortcutDraft((p) => ({
								...p,
								filterCompanyId: e.target.value,
							}))
						}
					/>
				</label>
				<label className="flex flex-col gap-1">
					<span
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'text-(--desktop-text-secondary)'
						)}
					>
						{t('settingsPanel.expansionSavedFilterProjectIdField')}
					</span>
					<input
						type="text"
						className={cn(
							'rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1.5 text-sm',
							DESKTOP_CHROME_FOCUS_VISIBLE
						)}
						value={savedFilterShortcutDraft.filterProjectId}
						onChange={(e) =>
							setSavedFilterShortcutDraft((p) => ({
								...p,
								filterProjectId: e.target.value,
							}))
						}
					/>
				</label>
				<label className="flex flex-col gap-1">
					<span
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'text-(--desktop-text-secondary)'
						)}
					>
						{t('settingsPanel.expansionSavedFilterFolderIdField')}
					</span>
					<input
						type="text"
						className={cn(
							'rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1.5 text-sm',
							DESKTOP_CHROME_FOCUS_VISIBLE
						)}
						value={savedFilterShortcutDraft.filterFolderId}
						onChange={(e) =>
							setSavedFilterShortcutDraft((p) => ({
								...p,
								filterFolderId: e.target.value,
							}))
						}
					/>
				</label>
				<label className="sm:col-span-2 flex flex-col gap-1">
					<span
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'text-(--desktop-text-secondary)'
						)}
					>
						{t('settingsPanel.expansionSavedFilterExplorerTargetField')}
					</span>
					<input
						type="text"
						className={cn(
							'rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-2 py-1.5 text-sm',
							DESKTOP_CHROME_FOCUS_VISIBLE
						)}
						value={savedFilterShortcutDraft.explorerFolderTarget}
						onChange={(e) =>
							setSavedFilterShortcutDraft((p) => ({
								...p,
								explorerFolderTarget: e.target.value,
							}))
						}
						placeholder={t(
							'settingsPanel.expansionSavedFilterExplorerTargetPlaceholder'
						)}
					/>
				</label>
			</div>
			<p
				className={cn(
					DESKTOP_TYPOGRAPHY.captionInherit,
					'mt-3 text-(--desktop-text-dim)'
				)}
			>
				{t('settingsPanel.expansionAppCollectionTemplatesHint')}
			</p>
			<div className="flex min-w-0 flex-wrap gap-2 mt-2">
				{DESKTOP_APP_COLLECTION_TEMPLATES.map((tpl) => {
					const label = t(
						`settingsPanel.expansionAppCollectionTemplate.${tpl.id}.label`
					);
					return (
						<DesktopChromeTooltip
							key={tpl.id}
							content={label}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="sm"
								disabled={expansionSettings.isSaving}
								onClick={() =>
									void expansionSettings.addAppCollectionFromTemplate(tpl.id)
								}
							>
								{label}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					);
				})}
			</div>
			<div className="grid gap-3 lg:grid-cols-2">
				<ExpansionList
					title={t('settingsPanel.expansionSavedAppCollections')}
					emptyLabel={t('settingsPanel.expansionEmptyAppCollections')}
					items={expansionSettings.appCollections.map((collection) => ({
						id: collection.id,
						title: collection.name,
						description:
							collection.description ??
							t('settingsPanel.expansionAppCollectionSummary', {
								apps: collection.appIds.length,
							}),
						onRemove: () =>
							void expansionSettings.removeAppCollection(collection.id),
					}))}
					shell={shell}
				/>
				<div
					id={buildDesktopSettingsFieldElementId(
						'shell_state',
						'content_shortcuts'
					)}
					className="scroll-mt-20"
					aria-hidden
				/>
				<ExpansionList
					title={t('settingsPanel.expansionSavedContentShortcuts')}
					emptyLabel={t('settingsPanel.expansionEmptyContentShortcuts')}
					items={expansionSettings.contentShortcuts.map((shortcut) => ({
						id: shortcut.id,
						title: shortcut.label,
						description: t(
							`settingsPanel.contentShortcutType.${shortcut.type}`,
							{ defaultValue: shortcut.type }
						),
						onRemove: () =>
							void expansionSettings.removeContentShortcut(shortcut.id),
					}))}
					shell={shell}
				/>
			</div>
		</SettingsFormCard>
	);
}
