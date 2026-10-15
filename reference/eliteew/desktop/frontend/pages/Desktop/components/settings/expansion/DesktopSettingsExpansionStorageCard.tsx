/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Storage map card in expansion settings.
 *
 * Invariants:
 * - Lazy-loaded from `DesktopSettingsExpansionSection`.
 * - Field rows link to tab/anchor targets via `onStorageMapFieldNavigate`.
 *
 * Related:
 * - `desktopSettingsExpansionSection.types.ts`
 * - `DesktopChromeTooltip.tsx`
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { getDesktopShellToolbarClusterInsetControlClassName } from '../../../utils/desktopVisualSystem';
import { resolveStorageMapFieldNavigateTarget } from '../../../utils/desktopSettingsStorageMapNavigation';
import { DESKTOP_INTERACTIVE, DESKTOP_TYPOGRAPHY } from '../../../constants';
import { SettingsFormCard } from '../DesktopSettingsFormCard';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import type { ExpansionCardBaseProps } from './desktopSettingsExpansionSection.types';
import { DesktopSettingsExpansionSaveErrorBanner } from './DesktopSettingsExpansionSaveErrorBanner';

export function DesktopSettingsExpansionStorageCard({
	expansionSettings,
	shell,
	onStorageMapFieldNavigate,
}: ExpansionCardBaseProps) {
	const { t } = useTranslation('desktopUi');
	return (
		<details className="group rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/40">
			<summary
				className={cn(
					'cursor-pointer list-none px-4 py-3 text-sm font-semibold text-(--desktop-text-primary) marker:content-none',
					DESKTOP_INTERACTIVE.focusRing
				)}
			>
				<span className="inline-flex items-center gap-2">
					{t('settingsPanel.cardStorageMapCollapsedTitle')}
					<span className="text-xs font-normal text-(--desktop-text-dim)">
						(
						{t('settingsPanel.cardStorageMapFieldCount', {
							count: expansionSettings.storageMap.reduce(
								(sum, row) => sum + row.fields.length,
								0
							),
						})}
						)
					</span>
				</span>
			</summary>
			<div className="border-t border-(--desktop-border-subtle) p-1 pt-0">
				<SettingsFormCard
					title={t('settingsPanel.cardStorageMapTitle')}
					windowStyle={shell.windowStyle}
				>
					<DesktopSettingsExpansionSaveErrorBanner
						prefix={t('settingsPanel.expansionSaveError')}
						error={expansionSettings.error}
					/>
					<div className="grid gap-3 lg:grid-cols-2">
						{expansionSettings.storageMap.map((row) => (
							<div
								key={row.id}
								className={cn(
									getDesktopShellToolbarClusterInsetControlClassName(
										shell.windowStyle
									),
									'rounded-xl px-3 py-3'
								)}
							>
								<div className="flex items-center justify-between gap-2">
									<p className="text-sm font-semibold text-(--desktop-text-primary)">
										{row.label}
									</p>
									<span className={DESKTOP_TYPOGRAPHY.shellMeta10}>
										{t(`settingsPanel.storageBucket.${row.bucket}`)}
										{' · '}
										{t('settingsPanel.storageMapFieldCount', {
											count: row.fields.length,
										})}
									</span>
								</div>
								<p className={cn(DESKTOP_TYPOGRAPHY.caption, 'mt-1')}>
									{row.description}
								</p>
								<ul
									className={cn(
										DESKTOP_TYPOGRAPHY.captionInherit,
										'mt-2 max-h-28 list-none space-y-0.5 overflow-y-auto pl-0 text-(--desktop-text-dim)'
									)}
									aria-label={t('settingsPanel.storageMapFieldsListAria', {
										bucket: row.label,
									})}
								>
									{row.fields.map((field) => {
										const target = resolveStorageMapFieldNavigateTarget(
											row.bucket,
											field
										);
										const canNavigate =
											Boolean(target) && Boolean(onStorageMapFieldNavigate);
										return (
											<li key={field}>
												{canNavigate && target ? (
													<DesktopChromeTooltip
														content={t('settingsPanel.storageMapFieldGoTo', {
															field,
														})}
														placement="top"
														offsetExtra={4}
													>
														<button
															type="button"
															className={cn(
																'rounded px-1 py-0.5 text-left font-mono text-[10px] text-(--desktop-text-dim) underline-offset-2 hover:text-(--desktop-text-primary) hover:underline',
																DESKTOP_INTERACTIVE.focusRing
															)}
															aria-controls={target.elementId}
															data-testid={`desktop-settings-storage-map-field-${row.bucket}-${field}`}
															onClick={() =>
																onStorageMapFieldNavigate?.(target)
															}
														>
															{field}
														</button>
													</DesktopChromeTooltip>
												) : (
													<code className="font-mono text-[10px]">{field}</code>
												)}
											</li>
										);
									})}
								</ul>
							</div>
						))}
					</div>
				</SettingsFormCard>
			</div>
		</details>
	);
}
