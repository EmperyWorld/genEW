/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Settings → Shell: Start Menu interface mode (legacy / command / workspace).
 * Self-contained persist via profile.ui.desktop_menu_mode.
 *
 * Invariants:
 * - Default selection is legacy; unknown server values normalize to legacy.
 * - PATCH sends full merged ui prefs object (same pattern as visual prefs).
 *
 * Related:
 * - `pages/Desktop/components/StartMenu.tsx`
 * - `types/profile.ts` (`desktop_menu_mode`)
 */

import { cn } from '@/utils/cn';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useUserPreferencesApp } from '@/contexts/UserPreferencesAppContext';
import profileService from '@/services/profileService';
import {
	DEFAULT_UI_PREFERENCES,
	DESKTOP_MENU_MODE_KEYS,
	normalizeDesktopMenuMode,
	type DesktopMenuMode,
	type UIPreferences,
} from '@/types/profile';
import { log } from '@/utils/logger';
import { DESKTOP_CHROME_FOCUS_VISIBLE } from '../DesktopAppChrome';
import { DESKTOP_TYPOGRAPHY } from '../../constants';
import { buildDesktopSettingsFieldElementId } from '../../utils/desktopSettingsFieldElementIds';
import { SettingsFormCard } from './DesktopSettingsFormCard';
import type { DesktopSettingsShellHelpers } from './desktopSettingsShared.types';

function segmentButtonClass(active: boolean): string {
	return cn(
		'rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors outline-none',
		DESKTOP_CHROME_FOCUS_VISIBLE,
		active
			? 'border-[rgb(var(--desktop-accent-rgb))] bg-[rgb(var(--desktop-accent-rgb)/0.14)] text-(--desktop-text-primary)'
			: 'border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-secondary) hover:border-(--desktop-border-strong) hover:bg-(--desktop-surface-soft-hover)'
	);
}

const MODE_LABEL_KEYS: Record<DesktopMenuMode, string> = {
	legacy: 'settingsPanel.menuMode.legacyLabel',
	command_console: 'settingsPanel.menuMode.commandLabel',
	workspace_dashboard: 'settingsPanel.menuMode.workspaceLabel',
};

const MODE_DESC_KEYS: Record<DesktopMenuMode, string> = {
	legacy: 'settingsPanel.menuMode.legacyDesc',
	command_console: 'settingsPanel.menuMode.commandDesc',
	workspace_dashboard: 'settingsPanel.menuMode.workspaceDesc',
};

export const DesktopSettingsMenuModeCard: FC<{
	shell: DesktopSettingsShellHelpers;
}> = ({ shell }) => {
	const { t } = useTranslation('desktopUi');
	const prefsApp = useUserPreferencesApp();
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const currentMode = useMemo(
		() =>
			normalizeDesktopMenuMode(
				prefsApp?.preferences?.ui?.desktop_menu_mode ??
					DEFAULT_UI_PREFERENCES.desktop_menu_mode
			),
		[prefsApp?.preferences?.ui?.desktop_menu_mode]
	);

	const onSelect = useCallback(
		async (mode: DesktopMenuMode) => {
			if (mode === currentMode || saving) return;
			const baseUi: UIPreferences = {
				...DEFAULT_UI_PREFERENCES,
				...(prefsApp?.preferences?.ui ?? {}),
			};
			const nextUi: UIPreferences = {
				...baseUi,
				desktop_menu_mode: mode,
			};
			setSaving(true);
			setError(null);
			try {
				const updated = await profileService.updatePreferences({ ui: nextUi });
				await prefsApp?.refresh?.(updated);
			} catch (err) {
				log.error(
					'Desktop',
					'Failed to persist desktop_menu_mode',
					err instanceof Error ? err : undefined
				);
				setError(t('settingsPanel.menuMode.saveFailed'));
			} finally {
				setSaving(false);
			}
		},
		[currentMode, prefsApp, saving, t]
	);

	return (
		<SettingsFormCard
			id={buildDesktopSettingsFieldElementId('profile_ui', 'desktop_menu_mode')}
			title={t('settingsPanel.menuMode.title')}
			windowStyle={shell.windowStyle}
		>
			<div className="grid gap-2 sm:grid-cols-3">
				{DESKTOP_MENU_MODE_KEYS.map((mode) => (
					<button
						key={mode}
						type="button"
						disabled={saving}
						onClick={() => void onSelect(mode)}
						aria-pressed={currentMode === mode}
						className={cn(
							segmentButtonClass(currentMode === mode),
							'flex flex-col gap-1 py-3 disabled:opacity-60'
						)}
					>
						<span>{t(MODE_LABEL_KEYS[mode])}</span>
						<span
							className={cn(
								DESKTOP_TYPOGRAPHY.meta,
								'font-normal text-(--desktop-text-dim)'
							)}
						>
							{t(MODE_DESC_KEYS[mode])}
						</span>
					</button>
				))}
			</div>
			{error ? (
				<p
					role="alert"
					className={cn(DESKTOP_TYPOGRAPHY.meta, 'mt-2 text-rose-300')}
				>
					{error}
				</p>
			) : null}
		</SettingsFormCard>
	);
};
