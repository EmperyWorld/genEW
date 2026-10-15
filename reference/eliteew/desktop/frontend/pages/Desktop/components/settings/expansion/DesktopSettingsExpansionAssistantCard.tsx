/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Assistant context actions toggles.
 *
 * Invariants:
 * - Lazy-loaded from `DesktopSettingsExpansionSection`.
 *
 * Related:
 * - `DesktopSettingsPanel.tsx`
 * - `DesktopChromeTooltip.tsx`
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import { getDesktopShellToolbarClusterInsetControlClassName } from '../../../utils/desktopVisualSystem';
import { DESKTOP_TYPOGRAPHY } from '../../../constants';
import { buildDesktopSettingsFieldElementId } from '../../../utils/desktopSettingsFieldElementIds';
import { SettingsFormCard } from '../DesktopSettingsFormCard';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import type { ExpansionCardBaseProps } from './desktopSettingsExpansionSection.types';

export function DesktopSettingsExpansionAssistantCard({
	expansionSettings,
	shell,
}: ExpansionCardBaseProps) {
	const { t } = useTranslation('desktopUi');
	const assistantActionLabel = (label: string) =>
		t(`settingsPanel.assistantAction.${label}`, { defaultValue: label });
	return (
		<SettingsFormCard
			id={buildDesktopSettingsFieldElementId(
				'shell_state',
				'assistant_context_actions'
			)}
			title={t('settingsPanel.cardAssistantContextTitle')}
			windowStyle={shell.windowStyle}
		>
			<div className="grid gap-2 sm:grid-cols-2">
				{expansionSettings.assistantContextActions.map((action) => {
					const actionLabel = assistantActionLabel(action.label);
					const sourceLabel = t(
						`settingsPanel.assistantActionSource.${action.source}`
					);
					return (
						<DesktopChromeTooltip
							key={action.id}
							content={`${actionLabel} — ${sourceLabel}`}
							placement="top"
							offsetExtra={4}
						>
							<label
								className={cn(
									getDesktopShellToolbarClusterInsetControlClassName(
										shell.windowStyle
									),
									'flex items-start gap-2 rounded-xl px-3 py-3 text-sm text-(--desktop-text-secondary) cursor-pointer'
								)}
							>
								<input
									type="checkbox"
									className={shell.checkboxClass}
									checked={action.enabled}
									onChange={() =>
										void expansionSettings.toggleAssistantAction(action.id)
									}
								/>
								<span>
									<span className="block font-medium text-(--desktop-text-primary)">
										{actionLabel}
									</span>
									<span className={DESKTOP_TYPOGRAPHY.caption}>
										{sourceLabel}
									</span>
								</span>
							</label>
						</DesktopChromeTooltip>
					);
				})}
			</div>
		</SettingsFormCard>
	);
}
