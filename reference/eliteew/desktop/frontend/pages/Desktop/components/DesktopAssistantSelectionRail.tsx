/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Visible Assistant/GAF quick-action rail when root desktop icons are selected.
 *
 * Invariants:
 * - Marked with `data-assistant-selection-rail` for outside-dismiss of icon selection.
 *
 * Related:
 * - hooks/useDesktopIconSelectionDismiss.ts
 */

import type { DesktopAssistantContextAction } from '../types/desktopExpansion.types';
import { DESKTOP_TYPOGRAPHY, DESKTOP_Z_INDEX } from '../constants';
import {
	DesktopAppButton,
	DESKTOP_CHROME_FOCUS_VISIBLE,
} from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import { cn } from '@/utils/cn';
import * as React from 'react';
import {
	ChatBubbleLeftRightIcon,
	ClipboardDocumentListIcon,
	DocumentTextIcon,
	SparklesIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
const RAIL_ICON: Partial<
	Record<
		DesktopAssistantContextAction['id'],
		React.ComponentType<{ className?: string }>
	>
> = {
	'explain-selection': SparklesIcon,
	'create-task': ClipboardDocumentListIcon,
	'send-to-gaf': ChatBubbleLeftRightIcon,
	'summarize-window': DocumentTextIcon,
};

export interface DesktopAssistantSelectionRailProps {
	actions: DesktopAssistantContextAction[];
	onAction: (actionId: string) => void;
	selectionCount: number;
}

export const DesktopAssistantSelectionRail: React.FC<
	DesktopAssistantSelectionRailProps
> = ({ actions, onAction, selectionCount }) => {
	const { t } = useTranslation('desktopUi');
	if (actions.length === 0) return null;

	return (
		<div
			data-assistant-selection-rail
			className={cn(
				'pointer-events-auto absolute left-1/2 flex max-w-[min(100%,42rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-app)_96%,var(--desktop-bg-primary)_4%)] px-2 py-1.5 shadow-(--desktop-shadow-panel)',
				DESKTOP_CHROME_FOCUS_VISIBLE
			)}
			style={{
				bottom: '4.5rem',
				zIndex: DESKTOP_Z_INDEX.ASSISTANT_SELECTION_RAIL,
			}}
			role="toolbar"
			aria-label={t('selectionAssistantRail.ariaLabel', {
				count: selectionCount,
			})}
		>
			<span
				className={cn(
					'mr-1 hidden max-w-40 truncate text-[10px] font-semibold uppercase tracking-wide text-(--desktop-text-tertiary) sm:inline',
					DESKTOP_TYPOGRAPHY.shellDescriptionToggle
				)}
			>
				<DesktopChromeTooltip
					content={t('selectionAssistantRail.badge', { count: selectionCount })}
					placement="top"
					offsetExtra={4}
				>
					<span className="block truncate">
						{t('selectionAssistantRail.badge', { count: selectionCount })}
					</span>
				</DesktopChromeTooltip>
			</span>
			{actions.map((action) => {
				const Icon = RAIL_ICON[action.id];
				const label = t(`settingsPanel.assistantAction.${action.label}`, {
					defaultValue: action.label,
				});
				return (
					<DesktopChromeTooltip
						key={action.id}
						content={label}
						placement="top"
						offsetExtra={4}
					>
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							className="shrink-0 gap-1"
							onClick={() => onAction(action.id)}
						>
							{Icon ? (
								<Icon className="h-3.5 w-3.5 opacity-90" aria-hidden />
							) : null}
							<span className="max-w-44 truncate">{label}</span>
						</DesktopAppButton>
					</DesktopChromeTooltip>
				);
			})}
		</div>
	);
};
