/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Confirm how to apply a saved window layout preset — replace windows on the active desktop or add new ones.
 *
 * Invariants:
 * - Focus trap via ModalAdvanced; no hotkeys beyond standard dialog behavior.
 *
 * Related:
 * - `applyDesktopWindowLayoutPresetWindows.ts`, `DesktopWorkspaceContent.tsx`
 * - DesktopChromeTooltip.tsx
 */

import * as React from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalAdvanced } from '@/components/ui/ModalAdvanced';
import type { DesktopWindowLayoutPreset } from '../types/desktopExpansion.types';
import { DesktopAppButton } from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

export interface DesktopWindowLayoutPresetApplyDialogProps {
	isOpen: boolean;
	preset: DesktopWindowLayoutPreset | null;
	openWindowCount: number;
	onClose: () => void;
	onReplace: (preset: DesktopWindowLayoutPreset) => void;
	onAdd: (preset: DesktopWindowLayoutPreset) => void;
}

export const DesktopWindowLayoutPresetApplyDialog: React.FC<DesktopWindowLayoutPresetApplyDialogProps> =
	memo(({ isOpen, preset, openWindowCount, onClose, onReplace, onAdd }) => {
		const { t } = useTranslation('desktopUi');

		if (!preset) {
			return null;
		}

		return (
			<ModalAdvanced
				isOpen={isOpen}
				onClose={onClose}
				title={t('settingsPanel.expansionLayoutApplyDialogTitle')}
				size="md"
				variant="desktop"
			>
				<div className="space-y-4">
					<p className="text-sm text-(--desktop-text-muted)">
						{t('settingsPanel.expansionLayoutApplyDialogBody', {
							name: preset.name,
							windows: preset.windows.length,
							openCount: openWindowCount,
						})}
					</p>
					<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
						<DesktopChromeTooltip
							content={t('settingsPanel.expansionLayoutApplyDialogCancel')}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="neutral"
								onClick={onClose}
							>
								{t('settingsPanel.expansionLayoutApplyDialogCancel')}
							</DesktopAppButton>
						</DesktopChromeTooltip>
						<DesktopChromeTooltip
							content={t('settingsPanel.expansionLayoutApplyDialogAdd')}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="neutral"
								onClick={() => onAdd(preset)}
							>
								{t('settingsPanel.expansionLayoutApplyDialogAdd')}
							</DesktopAppButton>
						</DesktopChromeTooltip>
						<DesktopChromeTooltip
							content={t('settingsPanel.expansionLayoutApplyDialogReplace')}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="accent"
								onClick={() => onReplace(preset)}
							>
								{t('settingsPanel.expansionLayoutApplyDialogReplace')}
							</DesktopAppButton>
						</DesktopChromeTooltip>
					</div>
				</div>
			</ModalAdvanced>
		);
	});

DesktopWindowLayoutPresetApplyDialog.displayName =
	'DesktopWindowLayoutPresetApplyDialog';
