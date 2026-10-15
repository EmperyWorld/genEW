/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Modal «Свойства» for a desktop item (folder, file, app) with path, size, and dates.
 *
 * Invariants:
 * - Uses `ModalAdvanced` variant desktop for focus trap and shell styling.
 *
 * Related:
 * - DesktopWorkspaceCanvas.tsx · useDesktopWorkspaceHandleAction.ts
 * - DesktopChromeTooltip.tsx
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ModalAdvanced } from '@/components/ui/ModalAdvanced';
import {
	DesktopAppButton,
	DESKTOP_CHROME_FOCUS_VISIBLE,
} from '@/pages/Desktop/components/DesktopAppChrome';
import { DesktopChromeTooltip } from '@/pages/Desktop/components/DesktopChromeTooltip';
import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import type { DesktopAssistantContextAction } from '@/pages/Desktop/types/desktopExpansion.types';
import type { DesktopItem } from '@/pages/Desktop/types/desktop.types';
import { cn } from '@/utils/cn';

function formatSize(
	bytes: number,
	t: (key: string, options?: Record<string, string | number>) => string
): string {
	if (bytes < 1024) return t('itemPropertiesModal.sizeBytes', { value: bytes });
	if (bytes < 1024 * 1024) {
		return t('itemPropertiesModal.sizeKilobytes', {
			value: (bytes / 1024).toFixed(1),
		});
	}
	return t('itemPropertiesModal.sizeMegabytes', {
		value: (bytes / (1024 * 1024)).toFixed(1),
	});
}

function formatDate(
	iso: string | undefined,
	locale: string,
	emptyLabel: string
): string {
	if (!iso) return emptyLabel;
	try {
		return new Date(iso).toLocaleString(locale, {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	} catch {
		return emptyLabel;
	}
}

export interface ItemPropertiesModalProps {
	item: DesktopItem;
	/** Parent folder name for path display (e.g. "Рабочий стол" or parent item name) */
	pathLabel: string;
	onClose: () => void;
	assistantActions?: DesktopAssistantContextAction[];
	onAssistantAction?: (actionId: string) => void;
}

export function ItemPropertiesModal({
	item,
	pathLabel,
	onClose,
	assistantActions = [],
	onAssistantAction,
}: ItemPropertiesModalProps): React.JSX.Element {
	const { t, i18n } = useTranslation('desktopUi');
	const emptyValue = t('itemPropertiesModal.emptyValue');
	const typeLabel =
		t(`itemPropertiesModal.types.${item.type}`, {
			defaultValue: item.type,
		}) ?? item.type;
	const sizeStr =
		item.size != null && item.size >= 0 ? formatSize(item.size, t) : emptyValue;
	const createdStr = formatDate(item.created_at, i18n.language, emptyValue);
	const updatedStr = formatDate(item.updated_at, i18n.language, emptyValue);

	return (
		<ModalAdvanced
			isOpen={true}
			onClose={onClose}
			title={t('itemPropertiesModal.title')}
			size="md"
			variant="desktop"
		>
			<div
				className={cn(
					'space-y-3',
					DESKTOP_TYPOGRAPHY.body,
					'text-(--desktop-text-primary)'
				)}
			>
				<Row label={t('itemPropertiesModal.name')} value={item.name} />
				<Row label={t('itemPropertiesModal.type')} value={typeLabel} />
				<Row label={t('itemPropertiesModal.location')} value={pathLabel} />
				{(item.type === 'file' || item.size != null) && (
					<Row label={t('itemPropertiesModal.size')} value={sizeStr} />
				)}
				<Row label={t('itemPropertiesModal.modified')} value={updatedStr} />
				{item.updated_at !== item.created_at && (
					<Row label={t('itemPropertiesModal.created')} value={createdStr} />
				)}
				{assistantActions.length > 0 && onAssistantAction ? (
					<div className="border-t border-(--desktop-border-subtle)/80 pt-3">
						<p
							className={cn(
								'mb-2 text-xs font-semibold uppercase tracking-wide text-(--desktop-text-tertiary)',
								DESKTOP_TYPOGRAPHY.shellDescriptionToggle
							)}
						>
							{t('windowContextMenu.assistantSection')}
						</p>
						<div
							className={cn(
								'flex flex-wrap gap-1.5',
								DESKTOP_CHROME_FOCUS_VISIBLE
							)}
						>
							{assistantActions.map((a) => {
								const actionLabel = t(
									`settingsPanel.assistantAction.${a.label}`,
									{ defaultValue: a.label }
								);
								return (
									<DesktopChromeTooltip
										key={a.id}
										content={actionLabel}
										placement="top"
										offsetExtra={4}
									>
										<DesktopAppButton
											type="button"
											variant="neutral"
											size="sm"
											className="shrink-0"
											onClick={() => onAssistantAction(a.id)}
										>
											{actionLabel}
										</DesktopAppButton>
									</DesktopChromeTooltip>
								);
							})}
						</div>
					</div>
				) : null}
			</div>
		</ModalAdvanced>
	);
}

function Row({
	label,
	value,
}: {
	label: string;
	value: string;
}): React.JSX.Element {
	return (
		<div className="flex flex-col gap-0.5">
			<span
				className={`text-xs text-(--desktop-text-dim) ${DESKTOP_TYPOGRAPHY.meta}`}
			>
				{label}
			</span>
			<span className={`wrap-break-word ${DESKTOP_TYPOGRAPHY.body}`}>
				{value}
			</span>
		</div>
	);
}
