/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Reusable expansion list widgets (workspaces, presets, counters).
 *
 * Invariants:
 * - `ExpansionList` and workspace profile list virtualize rows when count exceeds 8.
 *
 * Related:
 * - `DesktopSettingsExpansionSection.tsx`
 * - `DesktopChromeTooltip.tsx`
 */

import { VirtualVariableList } from '@/components/shared/VirtualList';
import { cn } from '@/utils/cn';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useDesktopRecentApps } from '../../../hooks/useDesktopRecentApps';
import type { DesktopExpansionSettings } from '../../../types/desktopExpansion.types';
import type { SettingsCenterVirtualDesktopRow } from '../../../types/desktopSettingsCenterBridge.types';
import type { DesktopItem } from '../../../types/desktop.types';
import { getDesktopShellToolbarClusterInsetControlClassName } from '../../../utils/desktopVisualSystem';
import { DESKTOP_INTERACTIVE, DESKTOP_TYPOGRAPHY } from '../../../constants';
import {
	DesktopAppButton,
	DESKTOP_APP_STYLE_CONTRACT,
} from '../../DesktopAppChrome';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import { WorkspaceProfileExpansionRow } from './desktopSettingsExpansionWorkspaceProfileRow';
import type {
	DesktopSettingsShellHelpers,
	DesktopSettingsWorkspaceProfilesShellContext,
} from '../desktopSettingsShared.types';

const EXPANSION_LIST_VIRTUALIZE_THRESHOLD = 8;
const EXPANSION_LIST_VIRTUAL_HEIGHT_PX = 320;
const EXPANSION_LIST_ROW_ESTIMATE_PX = 56;
const EXPANSION_LIST_ROW_WITH_DESC_ESTIMATE_PX = 84;
const EXPANSION_WORKSPACE_PROFILE_VIRTUALIZE_THRESHOLD = 8;
const EXPANSION_WORKSPACE_PROFILE_VIRTUAL_HEIGHT_PX = 480;
const EXPANSION_WORKSPACE_PROFILE_ROW_BASE_ESTIMATE_PX = 120;
const EXPANSION_WORKSPACE_PROFILE_ROW_EDITOR_ESTIMATE_PX = 280;

export type ExpansionListItem = {
	id: string;
	title: string;
	description?: string;
	onApply?: () => void;
	onRemove: () => void;
};

function ExpansionListRow({
	item,
	applyLabel,
	removeLabel,
}: {
	item: ExpansionListItem;
	applyLabel: string;
	removeLabel: string;
}) {
	return (
		<div className="rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<DesktopChromeTooltip
						content={
							item.description
								? `${item.title}\n${item.description}`
								: item.title
						}
						placement="top"
						offsetExtra={4}
					>
						<p className="truncate text-sm font-medium text-(--desktop-text-primary)">
							{item.title}
						</p>
					</DesktopChromeTooltip>
					{item.description ? (
						<p className={cn(DESKTOP_TYPOGRAPHY.caption, 'mt-0.5')}>
							{item.description}
						</p>
					) : null}
				</div>
				<div className="flex shrink-0 items-center gap-1">
					{item.onApply ? (
						<DesktopChromeTooltip
							content={applyLabel}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="sm"
								onClick={item.onApply}
							>
								{applyLabel}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					) : null}
					<DesktopChromeTooltip
						content={removeLabel}
						placement="top"
						offsetExtra={4}
					>
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="icon"
							onClick={item.onRemove}
							aria-label={removeLabel}
							className="h-8 min-h-8 w-8 min-w-8"
						>
							<XMarkIcon className="size-4" aria-hidden />
						</DesktopAppButton>
					</DesktopChromeTooltip>
				</div>
			</div>
		</div>
	);
}

export function WorkspaceProfilesExpansionList({
	expansionSettings,
	shell,
	editorContext,
	workspaceProfilesShellContext,
	profileAppCatalog,
}: {
	expansionSettings: DesktopExpansionSettings;
	shell: DesktopSettingsShellHelpers;
	editorContext?: {
		virtualDesktops: SettingsCenterVirtualDesktopRow[];
		globalWallpaper: string;
	};
	workspaceProfilesShellContext?: DesktopSettingsWorkspaceProfilesShellContext;
	profileAppCatalog: DesktopItem[];
}) {
	const { t } = useTranslation('desktopUi');
	const { recentIds, recentIdsByDesktop } = useDesktopRecentApps();
	const itemCatalog = useMemo(() => {
		const m = new Map<string, DesktopItem>();
		for (const it of profileAppCatalog) {
			if (it.type === 'app' && it.id) m.set(it.id, it);
		}
		return m;
	}, [profileAppCatalog]);
	const fieldClass = cn(
		DESKTOP_APP_STYLE_CONTRACT.searchField,
		'w-full rounded-lg px-3 py-2 text-sm',
		DESKTOP_INTERACTIVE.inputFocus
	);
	const profiles = expansionSettings.workspaceProfiles;
	return (
		<div
			className={cn(
				getDesktopShellToolbarClusterInsetControlClassName(shell.windowStyle),
				'rounded-xl px-3 py-3'
			)}
		>
			<div className="mb-2 flex items-center justify-between gap-2">
				<p className="text-sm font-semibold text-(--desktop-text-primary)">
					{t('settingsPanel.expansionSavedWorkspaces')}
				</p>
				<span className={DESKTOP_TYPOGRAPHY.shellMeta10}>
					{profiles.length}
				</span>
			</div>
			{profiles.length === 0 ? (
				<p className={DESKTOP_TYPOGRAPHY.caption}>
					{t('settingsPanel.expansionEmptyWorkspaces')}
				</p>
			) : profiles.length > EXPANSION_WORKSPACE_PROFILE_VIRTUALIZE_THRESHOLD ? (
				<VirtualVariableList
					items={profiles}
					height={EXPANSION_WORKSPACE_PROFILE_VIRTUAL_HEIGHT_PX}
					className="pr-1"
					estimateSize={() =>
						(editorContext
							? EXPANSION_WORKSPACE_PROFILE_ROW_EDITOR_ESTIMATE_PX
							: EXPANSION_WORKSPACE_PROFILE_ROW_BASE_ESTIMATE_PX) +
						(workspaceProfilesShellContext ? 56 : 0)
					}
					renderItem={(profile) => (
						<div className="pb-2">
							<WorkspaceProfileExpansionRow
								profile={profile}
								expansionSettings={expansionSettings}
								fieldClass={fieldClass}
								editorContext={editorContext}
								workspaceProfilesShellContext={workspaceProfilesShellContext}
								itemCatalog={itemCatalog}
								recentIds={recentIds}
								recentIdsByDesktop={recentIdsByDesktop}
							/>
						</div>
					)}
				/>
			) : (
				<div className="space-y-2">
					{profiles.map((profile) => (
						<WorkspaceProfileExpansionRow
							key={profile.id}
							profile={profile}
							expansionSettings={expansionSettings}
							fieldClass={fieldClass}
							editorContext={editorContext}
							workspaceProfilesShellContext={workspaceProfilesShellContext}
							itemCatalog={itemCatalog}
							recentIds={recentIds}
							recentIdsByDesktop={recentIdsByDesktop}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export function ExpansionList({
	title,
	emptyLabel,
	items,
	shell,
}: {
	title: string;
	emptyLabel: string;
	items: ExpansionListItem[];
	shell: DesktopSettingsShellHelpers;
}) {
	const { t } = useTranslation('desktopUi');
	const applyLabel = t('settingsPanel.expansionApply');
	const removeLabel = t('settingsPanel.expansionRemove');
	const useVirtualList = items.length > EXPANSION_LIST_VIRTUALIZE_THRESHOLD;

	return (
		<div
			className={cn(
				getDesktopShellToolbarClusterInsetControlClassName(shell.windowStyle),
				'rounded-xl px-3 py-3'
			)}
		>
			<div className="mb-2 flex items-center justify-between gap-2">
				<p className="text-sm font-semibold text-(--desktop-text-primary)">
					{title}
				</p>
				<span className={DESKTOP_TYPOGRAPHY.shellMeta10}>{items.length}</span>
			</div>
			{items.length === 0 ? (
				<p className={DESKTOP_TYPOGRAPHY.caption}>{emptyLabel}</p>
			) : useVirtualList ? (
				<VirtualVariableList
					items={items}
					height={EXPANSION_LIST_VIRTUAL_HEIGHT_PX}
					className="pr-1"
					estimateSize={(index) =>
						items[index]?.description
							? EXPANSION_LIST_ROW_WITH_DESC_ESTIMATE_PX
							: EXPANSION_LIST_ROW_ESTIMATE_PX
					}
					renderItem={(item) => (
						<div className="pb-2">
							<ExpansionListRow
								item={item}
								applyLabel={applyLabel}
								removeLabel={removeLabel}
							/>
						</div>
					)}
				/>
			) : (
				<div className="space-y-2">
					{items.map((item) => (
						<ExpansionListRow
							key={item.id}
							item={item}
							applyLabel={applyLabel}
							removeLabel={removeLabel}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export function ExpansionCounters({
	shell,
	items,
}: {
	shell: DesktopSettingsShellHelpers;
	items: { label: string; value: number }[];
}) {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{items.map((item) => (
				<div key={item.label} className={shell.statTileClass}>
					<div
						className={cn(
							DESKTOP_TYPOGRAPHY.caption,
							'uppercase tracking-wider'
						)}
					>
						{item.label}
					</div>
					<div className="text-lg font-semibold text-(--desktop-text-primary)">
						{item.value}
					</div>
				</div>
			))}
		</div>
	);
}
