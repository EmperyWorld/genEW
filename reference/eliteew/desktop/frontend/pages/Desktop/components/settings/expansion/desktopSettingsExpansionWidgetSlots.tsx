/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * DnD widget slot rows for expansion settings.
 *
 * Invariants:
 * - Slot order persists via `DesktopExpansionSettings.reorderWidgetSlots`.
 *
 * Related:
 * - `DesktopSettingsExpansionWidgetPanelCard.tsx`
 * - `DesktopChromeTooltip.tsx`
 */

import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from '@dnd-kit/core';
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/utils/cn';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
	Bars2Icon,
	ChevronDownIcon,
	ChevronUpIcon,
} from '@heroicons/react/24/outline';
import type { DesktopWindowStyle } from '@/types/profile';
import type {
	DesktopExpansionSettings,
	DesktopWidgetLayoutSlot,
	DesktopWorkspaceProfile,
} from '../../../types/desktopExpansion.types';
import { DESKTOP_LUCIDE, DESKTOP_TYPOGRAPHY } from '../../../constants';
import {
	DESKTOP_CHROME_FOCUS_VISIBLE,
	DesktopNativeSelect,
} from '../../DesktopAppChrome';
import { DesktopChromeTooltip } from '../../DesktopChromeTooltip';
import {
	buildDesktopWidgetSlotHelpText,
	buildDesktopWidgetSlotLabel,
	resolveDesktopWidgetSlotTypeId,
} from './desktopSettingsWidgetSlotCopy';

export function SortableWidgetSlotRow({
	slot,
	index,
	total,
	label,
	helpText,
	disabled,
	perWorkspace,
	workspaceProfiles,
	windowStyle,
	segmentClusterClass,
	segmentTabClass,
	onToggleEnabled,
	onToggleMode,
	onMoveUp,
	onMoveDown,
	onWorkspaceChange,
}: {
	slot: DesktopWidgetLayoutSlot;
	index: number;
	total: number;
	label: string;
	helpText?: string;
	disabled: boolean;
	perWorkspace: boolean;
	workspaceProfiles: DesktopWorkspaceProfile[];
	windowStyle: DesktopWindowStyle;
	segmentClusterClass: string;
	segmentTabClass: (active: boolean) => string;
	onToggleEnabled: () => void;
	onToggleMode: () => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onWorkspaceChange: (nextProfileId: string | undefined) => void;
}) {
	const { t } = useTranslation('desktopUi');
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: slot.id, disabled });
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};
	const workspaceSelectId = `desktop-settings-widget-slot-workspace-${slot.id}`;

	return (
		<li
			ref={setNodeRef}
			style={style}
			className={cn(
				'group rounded-2xl border px-3 py-3 transition-[border-color,background-color,box-shadow] duration-200 motion-reduce:transition-none',
				slot.enabled
					? 'border-[rgb(var(--desktop-accent-rgb)/0.42)] bg-[rgb(var(--desktop-accent-rgb)/0.09)] shadow-[0_10px_28px_rgba(0,0,0,0.14)]'
					: 'border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/85',
				!disabled &&
					'hover:border-(--desktop-border-strong) hover:bg-(--desktop-surface-soft)',
				isDragging &&
					'z-10 opacity-95 shadow-lg ring-1 ring-[rgb(var(--desktop-accent-rgb)/0.35)]'
			)}
		>
			<div className="flex items-start gap-2.5">
				<DesktopChromeTooltip
					content={t('settingsPanel.widgetsPanel.slotOrderHint')}
					placement="top"
					offsetExtra={4}
				>
					<button
						type="button"
						className={cn(
							'-m-0.5 mt-0.5 shrink-0 cursor-grab touch-none rounded-lg p-1.5 text-(--desktop-text-muted) transition-colors hover:bg-(--desktop-surface-panel) hover:text-(--desktop-text-secondary)',
							DESKTOP_CHROME_FOCUS_VISIBLE,
							disabled && 'pointer-events-none opacity-45'
						)}
						aria-label={t('settingsPanel.widgetsPanel.slotOrderHint')}
						disabled={disabled}
						{...attributes}
						{...listeners}
					>
						<Bars2Icon
							className="size-4"
							strokeWidth={DESKTOP_LUCIDE.stroke}
							aria-hidden
						/>
					</button>
				</DesktopChromeTooltip>
				<div className="min-w-0 flex-1 space-y-2.5">
					<div className="flex flex-wrap items-start justify-between gap-2">
						<div className="flex min-w-0 flex-wrap items-center gap-2">
							<span className="text-sm font-semibold text-(--desktop-text-primary)">
								{label}
							</span>
							{helpText ? (
								<p
									className={cn(
										DESKTOP_TYPOGRAPHY.captionInherit,
										'w-full basis-full text-(--desktop-text-dim)'
									)}
								>
									{helpText}
								</p>
							) : null}
							<DesktopChromeTooltip
								content={
									slot.enabled
										? t('settingsPanel.widgetSlotEnabled')
										: t('settingsPanel.widgetSlotDisabled')
								}
								placement="top"
								offsetExtra={4}
							>
								<button
									type="button"
									aria-pressed={slot.enabled}
									onClick={onToggleEnabled}
									disabled={disabled}
									className={cn(
										'rounded-full px-2.5 py-0.5 font-semibold uppercase tracking-wide transition-colors',
										DESKTOP_TYPOGRAPHY.shellMeta10,
										DESKTOP_CHROME_FOCUS_VISIBLE,
										slot.enabled
											? 'bg-[rgb(var(--desktop-accent-rgb)/0.28)] text-(--desktop-text-primary)'
											: 'border border-(--desktop-border-subtle) bg-(--desktop-surface-panel) text-(--desktop-text-dim)',
										disabled && 'pointer-events-none opacity-45'
									)}
								>
									{slot.enabled
										? t('settingsPanel.widgetSlotEnabled')
										: t('settingsPanel.widgetSlotDisabled')}
								</button>
							</DesktopChromeTooltip>
						</div>
						<div className="flex shrink-0 gap-0.5">
							<DesktopChromeTooltip
								content={t('settingsPanel.widgetsPanel.moveSlotUp')}
								placement="top"
								offsetExtra={4}
							>
								<button
									type="button"
									onClick={onMoveUp}
									disabled={disabled || index <= 0}
									aria-label={t('settingsPanel.widgetsPanel.moveSlotUp')}
									className={cn(
										'rounded-lg p-1.5 text-(--desktop-text-muted) transition-colors hover:bg-(--desktop-surface-panel) hover:text-(--desktop-text-secondary)',
										DESKTOP_CHROME_FOCUS_VISIBLE,
										(disabled || index <= 0) && 'pointer-events-none opacity-35'
									)}
								>
									<ChevronUpIcon
										className="size-4"
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								</button>
							</DesktopChromeTooltip>
							<DesktopChromeTooltip
								content={t('settingsPanel.widgetsPanel.moveSlotDown')}
								placement="top"
								offsetExtra={4}
							>
								<button
									type="button"
									onClick={onMoveDown}
									disabled={disabled || index >= total - 1}
									aria-label={t('settingsPanel.widgetsPanel.moveSlotDown')}
									className={cn(
										'rounded-lg p-1.5 text-(--desktop-text-muted) transition-colors hover:bg-(--desktop-surface-panel) hover:text-(--desktop-text-secondary)',
										DESKTOP_CHROME_FOCUS_VISIBLE,
										(disabled || index >= total - 1) &&
											'pointer-events-none opacity-35'
									)}
								>
									<ChevronDownIcon
										className="size-4"
										strokeWidth={DESKTOP_LUCIDE.stroke}
									/>
								</button>
							</DesktopChromeTooltip>
						</div>
					</div>
					<fieldset className={cn(segmentClusterClass, 'min-w-0 border-0 p-0')}>
						<legend className="sr-only">
							{t('settingsPanel.widgetSlotToggleMode')}
						</legend>
						<DesktopChromeTooltip
							content={t('settingsPanel.widgetSlotModeCompact')}
							placement="top"
							offsetExtra={4}
						>
							<button
								type="button"
								aria-pressed={slot.mode === 'compact'}
								disabled={disabled}
								onClick={() => {
									if (slot.mode !== 'compact') onToggleMode();
								}}
								className={segmentTabClass(slot.mode === 'compact')}
							>
								{t('settingsPanel.widgetSlotModeCompact')}
							</button>
						</DesktopChromeTooltip>
						<DesktopChromeTooltip
							content={t('settingsPanel.widgetSlotModeExpanded')}
							placement="top"
							offsetExtra={4}
						>
							<button
								type="button"
								aria-pressed={slot.mode === 'expanded'}
								disabled={disabled}
								onClick={() => {
									if (slot.mode !== 'expanded') onToggleMode();
								}}
								className={segmentTabClass(slot.mode === 'expanded')}
							>
								{t('settingsPanel.widgetSlotModeExpanded')}
							</button>
						</DesktopChromeTooltip>
					</fieldset>
					{perWorkspace ? (
						<label
							htmlFor={workspaceSelectId}
							className={cn(
								DESKTOP_TYPOGRAPHY.caption,
								'block text-(--desktop-text-dim)'
							)}
						>
							{t('settingsPanel.widgetsPanel.workspaceBinding')}
							<DesktopNativeSelect
								id={workspaceSelectId}
								shellFrame={windowStyle}
								className="mt-1.5"
								value={slot.workspaceProfileId ?? ''}
								disabled={disabled}
								onChange={(e) =>
									onWorkspaceChange(
										e.target.value.trim() ? e.target.value : undefined
									)
								}
							>
								<option value="">
									{t('settingsPanel.widgetsPanel.workspaceGlobal')}
								</option>
								{workspaceProfiles.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</DesktopNativeSelect>
						</label>
					) : null}
				</div>
			</div>
		</li>
	);
}

export function SortableWidgetSlotsBlock({
	expansionSettings,
	perWorkspace,
	windowStyle,
	segmentClusterClass,
	segmentTabClass,
}: {
	expansionSettings: DesktopExpansionSettings;
	perWorkspace: boolean;
	windowStyle: DesktopWindowStyle;
	segmentClusterClass: string;
	segmentTabClass: (active: boolean) => string;
}) {
	const { t } = useTranslation('desktopUi');
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);
	const slots = expansionSettings.widgetsLayout.slots;
	const ids = useMemo(() => slots.map((s) => s.id), [slots]);

	const onDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			if (!over || active.id === over.id) return;
			const oldIndex = slots.findIndex((s) => s.id === active.id);
			const newIndex = slots.findIndex((s) => s.id === over.id);
			if (oldIndex < 0 || newIndex < 0) return;
			void expansionSettings.reorderWidgetSlots(oldIndex, newIndex);
		},
		[expansionSettings, slots]
	);

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragEnd={onDragEnd}
		>
			<SortableContext items={ids} strategy={verticalListSortingStrategy}>
				<p
					className={cn(
						DESKTOP_TYPOGRAPHY.captionInherit,
						'text-(--desktop-text-dim)'
					)}
				>
					{t('settingsPanel.widgetsPanel.slotOrderHint')}
				</p>
				<ul className="mt-2.5 flex flex-col gap-2.5">
					{slots.map((slot, index) => {
						const slotTypeId = resolveDesktopWidgetSlotTypeId(slot);
						return (
							<SortableWidgetSlotRow
								key={slot.id}
								slot={slot}
								index={index}
								total={slots.length}
								label={buildDesktopWidgetSlotLabel(t, slotTypeId)}
								helpText={buildDesktopWidgetSlotHelpText(t, slotTypeId)}
								disabled={expansionSettings.isSaving}
								perWorkspace={perWorkspace}
								workspaceProfiles={expansionSettings.workspaceProfiles}
								windowStyle={windowStyle}
								segmentClusterClass={segmentClusterClass}
								segmentTabClass={segmentTabClass}
								onToggleEnabled={() =>
									void expansionSettings.toggleWidgetSlot(slot.id)
								}
								onToggleMode={() =>
									void expansionSettings.toggleWidgetSlotMode(slot.id)
								}
								onMoveUp={() =>
									void expansionSettings.moveWidgetSlotStep(slot.id, 'up')
								}
								onMoveDown={() =>
									void expansionSettings.moveWidgetSlotStep(slot.id, 'down')
								}
								onWorkspaceChange={(next) =>
									void expansionSettings.setWidgetSlotWorkspaceProfile(
										slot.id,
										next
									)
								}
							/>
						);
					})}
				</ul>
			</SortableContext>
		</DndContext>
	);
}
