/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shell sync preferences (clock, quiet mode, timezone) in Settings Center sync section.
 *
 * Invariants:
 * - Persists via `settingsCenterBridge.syncPrefs` → coalesced shell writer.
 *
 * Related:
 * - `DesktopSettingsShellTab.tsx`, `DesktopTaskbarShellPrefsContext.tsx`
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { DESKTOP_INTERACTIVE } from '../../constants';
import { DESKTOP_SHELL_TIMEZONE_OPTIONS } from '../../constants/desktopShellTimezoneOptions';
import { buildDesktopSettingsFieldElementId } from '../../utils/desktopSettingsFieldElementIds';
import type { DesktopSettingsCenterSyncPrefs } from '../../types/desktopSettingsCenterBridge.types';
import { useDesktopShellSyncIdleIconPref } from '../../hooks/useDesktopShellSyncIdleIconPref';
import type { DesktopSettingsShellHelpers } from './desktopSettingsShared.types';
import { SettingsFormCard } from './DesktopSettingsFormCard';

type DesktopSettingsShellSyncPrefsCardProps = {
	syncPrefs: DesktopSettingsCenterSyncPrefs;
	shell: DesktopSettingsShellHelpers;
};

export function DesktopSettingsShellSyncPrefsCard({
	syncPrefs,
	shell,
}: DesktopSettingsShellSyncPrefsCardProps) {
	const { t } = useTranslation('desktopUi');
	const { showIdleSyncIcon, setShowIdleSyncIcon } =
		useDesktopShellSyncIdleIconPref();
	return (
		<SettingsFormCard
			title={t('settingsPanel.syncPrefsCardTitle')}
			windowStyle={shell.windowStyle}
		>
			<div className="grid gap-3 sm:grid-cols-2">
				<label
					id={buildDesktopSettingsFieldElementId(
						'shell_state',
						'clock_show_seconds'
					)}
					className="inline-flex cursor-pointer items-center gap-2 text-sm text-(--desktop-text-secondary) scroll-mt-20"
				>
					<input
						type="checkbox"
						className={shell.checkboxClass}
						checked={syncPrefs.showSeconds}
						onChange={(event) =>
							syncPrefs.onShowSecondsChange(event.target.checked)
						}
					/>
					{t('settingsPanel.syncPrefsClockSeconds')}
				</label>
				<label
					id={buildDesktopSettingsFieldElementId('shell_state', 'quiet_mode')}
					className="inline-flex cursor-pointer items-center gap-2 text-sm text-(--desktop-text-secondary) scroll-mt-20"
				>
					<input
						type="checkbox"
						className={shell.checkboxClass}
						checked={syncPrefs.quietMode}
						onChange={(event) =>
							syncPrefs.onQuietModeChange(event.target.checked)
						}
					/>
					<span>{t('settingsPanel.syncPrefsQuietMode')}</span>
				</label>
			</div>
			<label
				id={buildDesktopSettingsFieldElementId('shell_state', 'timezone')}
				className="mt-3 block scroll-mt-20 text-sm text-(--desktop-text-secondary)"
				htmlFor="desktop-settings-sync-timezone"
			>
				{t('settingsPanel.syncPrefsTimezone')}
				<select
					id="desktop-settings-sync-timezone"
					data-testid="desktop-settings-sync-timezone"
					className={cn(
						'mt-1 w-full max-w-md rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2 text-sm text-(--desktop-text-primary)',
						DESKTOP_INTERACTIVE.inputFocus
					)}
					value={syncPrefs.timezone}
					onChange={(event) => syncPrefs.onTimezoneChange(event.target.value)}
				>
					{DESKTOP_SHELL_TIMEZONE_OPTIONS.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</label>
			<p className="mt-2 text-xs leading-relaxed text-(--desktop-text-dim)">
				{t('settingsPanel.syncPrefsQuietModeHint')}
			</p>
			<label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-(--desktop-text-secondary)">
				<input
					type="checkbox"
					className={shell.checkboxClass}
					checked={showIdleSyncIcon}
					onChange={(event) => setShowIdleSyncIcon(event.target.checked)}
				/>
				<span>{t('settingsPanel.syncPrefsShowIdleSyncIcon')}</span>
			</label>
			<p className="mt-1 text-xs leading-relaxed text-(--desktop-text-dim)">
				{t('settingsPanel.syncPrefsShowIdleSyncIconHint')}
			</p>
		</SettingsFormCard>
	);
}
