/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Sync status, persist queue, and diagnostics card in shell tab.
 *
 * Invariants:
 * - Expansion PATCH errors surface via `DesktopSettingsExpansionSaveErrorBanner`.
 *
 * Related:
 * - `DesktopSettingsExpansionShellCluster.tsx`
 */

import { cn } from '@/utils/cn';
import { useTranslation } from 'react-i18next';
import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	CloudIcon,
	DocumentTextIcon,
	ExclamationCircleIcon,
	LifebuoyIcon,
	NumberedListIcon,
} from '@heroicons/react/24/outline';
import {
	DesktopAppButton,
	DESKTOP_APP_STYLE_CONTRACT,
} from '../../DesktopAppChrome';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import { buildDesktopSettingsFieldElementId } from '../../../utils/desktopSettingsFieldElementIds';
import type { DesktopExpansionSettings } from '../../../types/desktopExpansion.types';
import type { DesktopSettingsCenterBridge } from '../../../types/desktopSettingsCenterBridge.types';
import { SettingsFormCard } from '../DesktopSettingsFormCard';
import { SettingsInlineAlert } from '../desktopSettingsSharedUi';
import { DesktopSettingsExpansionSaveErrorBanner } from './DesktopSettingsExpansionSaveErrorBanner';
import type { DesktopSettingsShellHelpers } from '../desktopSettingsShared.types';
import { translateDesktopStorageSyncError } from '../../../utils/desktopStorageSyncError';

export function DesktopSettingsExpansionShellSyncDataCard({
	settingsCenterBridge,
	expansionSettings,
	shell,
}: {
	settingsCenterBridge: DesktopSettingsCenterBridge;
	expansionSettings: DesktopExpansionSettings;
	shell: DesktopSettingsShellHelpers;
}) {
	const { t } = useTranslation('desktopUi');

	return (
		<SettingsFormCard
			id={buildDesktopSettingsFieldElementId(
				'shell_state',
				'persist_patch_queue'
			)}
			title={t('settingsPanel.settingsCenterSyncTitle')}
			windowStyle={shell.windowStyle}
		>
			<div className="space-y-4">
				{settingsCenterBridge.sync.tabConflictDetected ? (
					<SettingsInlineAlert
						tone="warning"
						icon={<ExclamationCircleIcon className="size-4" aria-hidden />}
						className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
					>
						<span>{t('settingsPanel.settingsCenterTabConflict')}</span>
						<DesktopChromeTooltip
							content={t('settingsPanel.settingsCenterTabConflictDismiss')}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="ghost"
								onClick={() => settingsCenterBridge.sync.clearTabConflict()}
							>
								{t('settingsPanel.settingsCenterTabConflictDismiss')}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					</SettingsInlineAlert>
				) : null}
				{settingsCenterBridge.sync.storageError ? (
					<SettingsInlineAlert tone="error">
						{translateDesktopStorageSyncError(
							settingsCenterBridge.sync.storageError,
							t
						)}
					</SettingsInlineAlert>
				) : null}
				{!settingsCenterBridge.sync.isOnline ? (
					<SettingsInlineAlert
						tone="warning"
						icon={<CloudIcon className="size-4" aria-hidden />}
					>
						{t('settingsPanel.settingsCenterOfflineHint')}
					</SettingsInlineAlert>
				) : null}
				{settingsCenterBridge.sync.persistPatchFlushFailed ? (
					<SettingsInlineAlert tone="error">
						{t('settingsPanel.settingsCenterPersistFlushFailed', {
							error: settingsCenterBridge.sync.persistPatchFlushFailed,
						})}
					</SettingsInlineAlert>
				) : null}
				<DesktopSettingsExpansionSaveErrorBanner
					prefix={t('settingsPanel.expansionSaveError')}
					error={expansionSettings.error}
				/>
				{settingsCenterBridge.sync.persistQueue.total > 0 ? (
					<SettingsInlineAlert
						tone="warning"
						icon={<NumberedListIcon className="size-4" aria-hidden />}
						className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
						data-testid="desktop-settings-persist-queue-banner"
					>
						<span>
							{t('settingsPanel.settingsCenterPersistQueue', {
								total: settingsCenterBridge.sync.persistQueue.total,
								config: settingsCenterBridge.sync.persistQueue.config,
								shell: settingsCenterBridge.sync.persistQueue.shell,
							})}
						</span>
						{settingsCenterBridge.sync.onFlushPersistQueue ? (
							<DesktopChromeTooltip
								content={t('settingsPanel.settingsCenterPersistQueueFlush')}
								placement="top"
								offsetExtra={4}
							>
								<DesktopAppButton
									type="button"
									variant="ghost"
									size="sm"
									data-testid="desktop-settings-persist-queue-flush"
									disabled={settingsCenterBridge.sync.isSyncing}
									onClick={() =>
										void settingsCenterBridge.sync.onFlushPersistQueue?.()
									}
								>
									<ArrowPathIcon className="size-4" aria-hidden />
									{t('settingsPanel.settingsCenterPersistQueueFlush')}
								</DesktopAppButton>
							</DesktopChromeTooltip>
						) : null}
					</SettingsInlineAlert>
				) : null}

				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
					<div className="flex min-h-9 flex-wrap items-center gap-2 text-xs text-(--desktop-text-dim)">
						{settingsCenterBridge.sync.isSyncing ? (
							<>
								<ArrowPathIcon
									className="size-4 shrink-0 animate-spin"
									aria-hidden
								/>
								{t('settingsPanel.settingsCenterSyncing')}
							</>
						) : (
							<span>{t('settingsPanel.settingsCenterSyncIdle')}</span>
						)}
					</div>
					<DesktopChromeTooltip
						content={t('settingsPanel.settingsCenterRefresh')}
						placement="top"
						offsetExtra={4}
					>
						<DesktopAppButton
							type="button"
							variant="neutral"
							size="sm"
							className="shrink-0 self-start sm:self-center"
							disabled={settingsCenterBridge.sync.isSyncing}
							onClick={() => void settingsCenterBridge.sync.onRefreshAll()}
						>
							<ArrowPathIcon className="size-4" aria-hidden />
							{t('settingsPanel.settingsCenterRefresh')}
						</DesktopAppButton>
					</DesktopChromeTooltip>
				</div>

				{settingsCenterBridge.sync.onExportDiagnosticsSummary ||
				settingsCenterBridge.sync.onExportDiagnosticsFullShell ? (
					<>
						<div
							className="h-px w-full bg-(--desktop-border-subtle)"
							aria-hidden
						/>
						<div
							className={cn(
								'rounded-xl border border-(--desktop-border-subtle)',
								'bg-[color-mix(in_srgb,var(--desktop-surface-soft)_65%,transparent)]',
								'p-3 shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--desktop-text-primary)_6%,transparent)]',
								'sm:p-4'
							)}
						>
							<div className="flex gap-3">
								<div
									className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)"
									aria-hidden
								>
									<LifebuoyIcon className="size-4 text-(--desktop-text-muted)" />
								</div>
								<div className="min-w-0 flex-1 space-y-3">
									<div>
										<p className="text-xs font-semibold uppercase tracking-wide text-(--desktop-text-secondary)">
											{t('settingsPanel.diagnosticsSectionTitle')}
										</p>
										<p
											className={cn(
												DESKTOP_APP_STYLE_CONTRACT.helperText,
												'mt-1 text-[11px] leading-snug text-(--desktop-text-dim)'
											)}
										>
											{t('settingsPanel.diagnosticsSectionSubtitle')}
										</p>
									</div>
									<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
										{settingsCenterBridge.sync.onExportDiagnosticsSummary ? (
											<DesktopChromeTooltip
												content={t('settingsPanel.diagnosticsSummaryExport')}
												placement="top"
												offsetExtra={4}
											>
												<DesktopAppButton
													type="button"
													variant="neutral"
													size="sm"
													className="w-full justify-center sm:w-auto"
													onClick={() => {
														void settingsCenterBridge.sync.onExportDiagnosticsSummary?.();
													}}
												>
													<ArrowDownTrayIcon className="size-4" aria-hidden />
													{t('settingsPanel.diagnosticsSummaryExport')}
												</DesktopAppButton>
											</DesktopChromeTooltip>
										) : null}
										{settingsCenterBridge.sync.onExportDiagnosticsFullShell ? (
											<DesktopChromeTooltip
												content={t('settingsPanel.diagnosticsFullExport')}
												placement="top"
												offsetExtra={4}
											>
												<DesktopAppButton
													type="button"
													variant="ghost"
													size="sm"
													className={cn(
														'w-full justify-center border border-amber-400/35 sm:w-auto',
														'bg-[color-mix(in_srgb,rgb(245_158_11)_12%,var(--desktop-surface-soft))]',
														'text-amber-100/95 hover:bg-[color-mix(in_srgb,rgb(245_158_11)_18%,var(--desktop-surface-soft-hover))]',
														'active:bg-[color-mix(in_srgb,rgb(245_158_11)_22%,var(--desktop-surface-soft-active))]'
													)}
													onClick={() => {
														void settingsCenterBridge.sync.onExportDiagnosticsFullShell?.();
													}}
												>
													<DocumentTextIcon className="size-4" aria-hidden />
													{t('settingsPanel.diagnosticsFullExport')}
												</DesktopAppButton>
											</DesktopChromeTooltip>
										) : null}
									</div>
									{settingsCenterBridge.sync.onExportDiagnosticsSummary ? (
										<p className="text-[11px] leading-relaxed text-(--desktop-text-dim)">
											{t('settingsPanel.diagnosticsSummaryHint')}
										</p>
									) : null}
									{settingsCenterBridge.sync.onExportDiagnosticsFullShell ? (
										<p className="rounded-md border border-amber-400/25 bg-amber-500/[0.07] px-2.5 py-2 text-[10px] leading-snug text-amber-100/85">
											{t('settingsPanel.diagnosticsFullExportHint')}
										</p>
									) : null}
								</div>
							</div>
						</div>
					</>
				) : null}
			</div>
		</SettingsFormCard>
	);
}
