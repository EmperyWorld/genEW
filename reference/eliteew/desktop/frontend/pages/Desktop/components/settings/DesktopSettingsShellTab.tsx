/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shell behavior tab (widgets, VD jump links) for Desktop Settings Center.
 *
 * Invariants:
 * - Sticky sub-nav scrolls to section anchors within the tab.
 *
 * Related:
 * - `settings/expansion/DesktopSettingsExpansionShellCluster.tsx`
 * - `DesktopSettingsPanel.tsx`
 */

import { cn } from '@/utils/cn';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'framer-motion';
import { DESKTOP_SETTINGS_SHELL_ANCHORS } from '../../constants/desktopSettingsShellAnchors';
import { DESKTOP_CHROME_FOCUS_VISIBLE } from '../DesktopAppChrome';
import { DesktopSettingsExpansionShellCluster } from './expansion/DesktopSettingsExpansionShellCluster';
import type {
	DesktopSettingsShellHelpers,
	DesktopSettingsVisualLabels,
	DesktopSettingsWorkspaceProfilesShellContext,
	SavedFilterContentShortcutDraftState,
} from './desktopSettingsShared.types';
import type { Dispatch, SetStateAction } from 'react';
import { type DesktopWidgetsStyle } from '@/types/profile';
import type { WidgetsPanelPosition } from '../../types/desktop.types';
import type { DesktopExpansionSettings } from '../../types/desktopExpansion.types';
import type { DesktopSettingsCenterBridge } from '../../types/desktopSettingsCenterBridge.types';
import type { SettingsNavigateTarget } from '../../utils/desktopSettingsStorageMapNavigation';

interface ShellSectionProps {
	desktopOpenAppsMaximized: boolean;
	onDesktopOpenAppsMaximizedChange: (value: boolean) => void;
	desktopFloatingWidgetVisible: boolean;
	onDesktopFloatingWidgetVisibleChange: (value: boolean) => void;
	desktopWidgetsStyle: DesktopWidgetsStyle;
	onDesktopWidgetsStyleChange: (value: DesktopWidgetsStyle) => void;
	showWidgetsPanel: boolean;
	onShowWidgetsPanelChange: (value: boolean) => void;
	widgetsPanelPosition: WidgetsPanelPosition;
	onWidgetsPanelPositionChange: (value: WidgetsPanelPosition) => void;
	compactWidgets: boolean;
	onCompactWidgetsChange: (value: boolean) => void;
	expansionSettings: DesktopExpansionSettings;
	settingsCenterBridge: DesktopSettingsCenterBridge;
	shell: DesktopSettingsShellHelpers;
	visualLabels: DesktopSettingsVisualLabels;
	workspaceProfilesShellContext?: DesktopSettingsWorkspaceProfilesShellContext;
	onStorageMapFieldNavigate?: (target: SettingsNavigateTarget) => void;
	savedFilterShortcutDraft: SavedFilterContentShortcutDraftState;
	setSavedFilterShortcutDraft: Dispatch<
		SetStateAction<SavedFilterContentShortcutDraftState>
	>;
	onScrollToShellAnchor?: (domId: string) => void;
}

export const DesktopSettingsShellTab: FC<ShellSectionProps> = (props) => {
	const { t } = useTranslation('desktopUi');
	const reduceMotion = useReducedMotion();
	const scrollToShellAnchor = useCallback(
		(domId: string) => {
			const el = document.getElementById(domId);
			if (!el) return;
			el.scrollIntoView({
				behavior: reduceMotion ? 'auto' : 'smooth',
				block: 'start',
			});
		},
		[reduceMotion]
	);

	const shellJumpEntries = useMemo(
		() =>
			[
				{
					id: DESKTOP_SETTINGS_SHELL_ANCHORS.workspaces,
					label: t('settingsPanel.shellJumpWorkspaces'),
				},
				{
					id: DESKTOP_SETTINGS_SHELL_ANCHORS.windows,
					label: t('settingsPanel.shellJumpWindows'),
				},
				{
					id: DESKTOP_SETTINGS_SHELL_ANCHORS.apps,
					label: t('settingsPanel.shellJumpApps'),
				},
				{
					id: DESKTOP_SETTINGS_SHELL_ANCHORS.menuMode,
					label: t('settingsPanel.shellJumpMenuMode'),
				},
				{
					id: DESKTOP_SETTINGS_SHELL_ANCHORS.sync,
					label: t('settingsPanel.shellJumpSync'),
				},
				{
					id: DESKTOP_SETTINGS_SHELL_ANCHORS.advanced,
					label: t('settingsPanel.shellJumpAdvanced'),
				},
			] as const,
		[t]
	);

	return (
		<section
			aria-labelledby="shell-heading"
			className="space-y-5"
			data-testid="desktop-settings-shell-tab"
		>
			<h3 id="shell-heading" className="sr-only">
				{t('settingsPanel.sectionShellTitle')}
			</h3>

			<nav
				className="sticky top-0 z-10 -mx-5 mb-2 flex flex-wrap gap-1 border-b border-(--desktop-border-subtle)/80 bg-[color-mix(in_srgb,var(--desktop-surface-panel)_94%,transparent)] px-5 py-2 backdrop-blur-md supports-backdrop-filter:bg-[color-mix(in_srgb,var(--desktop-surface-panel)_88%,transparent)]"
				aria-label={t('settingsPanel.shellJumpNavAria')}
			>
				{shellJumpEntries.map((entry) => (
					<button
						key={entry.id}
						type="button"
						onClick={() => scrollToShellAnchor(entry.id)}
						className={cn(
							'rounded-lg px-3 py-1.5 text-xs font-medium outline-none transition-colors',
							DESKTOP_CHROME_FOCUS_VISIBLE,
							'text-(--desktop-text-secondary) hover:bg-(--desktop-surface-soft-hover) hover:text-(--desktop-text-primary)'
						)}
					>
						{entry.label}
					</button>
				))}
			</nav>

			<DesktopSettingsExpansionShellCluster
				{...props}
				onScrollToShellAnchor={scrollToShellAnchor}
			/>
		</section>
	);
};
