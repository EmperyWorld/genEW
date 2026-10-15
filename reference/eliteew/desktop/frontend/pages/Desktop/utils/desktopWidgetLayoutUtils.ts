/**
 * Нормализация и фильтрация {@link DesktopWidgetsLayout} для панели виджетов и API shell_state.
 */

import type { WidgetsPanelPosition } from '../types/desktop.types';
import type {
	DesktopWidgetLayoutSlot,
	DesktopWidgetsLayout,
	DesktopWidgetsSlotPlacement,
	DesktopWorkspaceProfile,
} from '../types/desktopExpansion.types';

/** Ширина карточки слота в layout px (согласовано с `w-80` панели). */
export const WIDGET_SLOT_CARD_WIDTH_LAYOUT = 320;
export const WIDGET_SLOT_GAP_PX = 12;
export const WIDGET_WORK_MARGIN_PX = 16;

export function estimateWidgetSlotHeight(
	type: DesktopWidgetLayoutSlot['type'],
	compact: boolean
): number {
	switch (type) {
		case 'now-playing':
			return compact ? 112 : 204;
		case 'recent-content':
		case 'project-shortcuts':
			return compact ? 118 : 200;
		case 'notifications':
			return compact ? 108 : 148;
		case 'ewdesk':
			return compact ? 72 : 96;
		case 'favorites':
			return compact ? 104 : 176;
		default:
			return compact ? 96 : 168;
	}
}

/**
 * Стартовые координаты для включения свободной раскладки (раскладка «колонкой» от якоря).
 */
export function computeInitialFreeSlotPositions(
	slots: DesktopWidgetLayoutSlot[],
	panelPosition: WidgetsPanelPosition,
	workWidth: number,
	workHeight: number,
	panelOffset: { x: number; y: number },
	compactWidgetsGlobal: boolean
): Record<string, { x: number; y: number }> {
	const cardW = WIDGET_SLOT_CARD_WIDTH_LAYOUT;
	const gap = WIDGET_SLOT_GAP_PX;
	const margin = WIDGET_WORK_MARGIN_PX;
	const enabled = slots.filter((s) => s.enabled);
	let x0 = margin + panelOffset.x;
	let y0 = margin + panelOffset.y;
	if (panelPosition === 'top-right' || panelPosition === 'bottom-right') {
		x0 = workWidth - margin - cardW + panelOffset.x;
	}
	if (panelPosition === 'bottom-left' || panelPosition === 'bottom-right') {
		const totalH = enabled.reduce(
			(acc, s) =>
				acc +
				estimateWidgetSlotHeight(
					s.type,
					compactWidgetsGlobal || s.mode === 'compact'
				) +
				gap,
			0
		);
		y0 = workHeight - margin - totalH + panelOffset.y;
	}
	const out: Record<string, { x: number; y: number }> = {};
	let y = y0;
	for (const s of enabled) {
		const h = estimateWidgetSlotHeight(
			s.type,
			compactWidgetsGlobal || s.mode === 'compact'
		);
		out[s.id] = { x: x0, y };
		y += h + gap;
	}
	return out;
}

export function clampWidgetPositionInWorkArea(
	pos: { x: number; y: number },
	workWidth: number,
	workHeight: number,
	cardW: number,
	cardH: number,
	pad: number
): { x: number; y: number } {
	const maxX = Math.max(pad, workWidth - cardW - pad);
	const maxY = Math.max(pad, workHeight - cardH - pad);
	return {
		x: Math.round(Math.min(maxX, Math.max(pad, pos.x))),
		y: Math.round(Math.min(maxY, Math.max(pad, pos.y))),
	};
}

export function normalizedSlotPlacement(
	raw: unknown
): DesktopWidgetsSlotPlacement {
	return raw === 'free' ? 'free' : 'stacked';
}

export const DEFAULT_WIDGET_SLOTS: DesktopWidgetLayoutSlot[] = [
	{ id: 'notes', type: 'notes', enabled: true, mode: 'compact' },
	{ id: 'todos', type: 'todos', enabled: true, mode: 'compact' },
	{ id: 'favorites', type: 'favorites', enabled: true, mode: 'compact' },
	{ id: 'ewdesk', type: 'ewdesk', enabled: true, mode: 'compact' },
	{
		id: 'notifications',
		type: 'notifications',
		enabled: true,
		mode: 'compact',
	},
	{ id: 'now-playing', type: 'now-playing', enabled: true, mode: 'compact' },
	{
		id: 'project-shortcuts',
		type: 'project-shortcuts',
		enabled: true,
		mode: 'compact',
	},
	{
		id: 'recent-content',
		type: 'recent-content',
		enabled: true,
		mode: 'compact',
	},
];

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSlotPosition(
	raw: unknown
): { x: number; y: number } | undefined {
	if (!isObjectRecord(raw)) return undefined;
	const x = Number(raw.x);
	const y = Number(raw.y);
	if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
	return { x, y };
}

export function normalizeWidgetsLayout(raw: unknown): DesktopWidgetsLayout {
	if (!isObjectRecord(raw)) {
		return { slots: DEFAULT_WIDGET_SLOTS, perWorkspace: false };
	}
	const slotPlacement = normalizedSlotPlacement(raw.slotPlacement);
	const mappedSlotsBase: DesktopWidgetLayoutSlot[] = Array.isArray(raw.slots)
		? raw.slots.filter(isObjectRecord).map((slot) => {
				const type = String(slot.type ?? slot.id ?? 'notes');
				const fallback = DEFAULT_WIDGET_SLOTS.find(
					(defaultSlot) =>
						defaultSlot.id === slot.id || defaultSlot.type === type
				);
				const base = fallback ?? DEFAULT_WIDGET_SLOTS[0];
				const mode: DesktopWidgetLayoutSlot['mode'] =
					slot.mode === 'expanded' ? 'expanded' : 'compact';
				return {
					...base,
					id: String(slot.id ?? base.id ?? type),
					enabled: slot.enabled !== false,
					mode,
					position:
						slotPlacement === 'free'
							? normalizeSlotPosition(slot.position)
							: undefined,
					workspaceProfileId:
						typeof slot.workspaceProfileId === 'string'
							? slot.workspaceProfileId
							: undefined,
				};
			})
		: [...DEFAULT_WIDGET_SLOTS];
	const mappedSlots = mergeMissingDefaultWidgetSlots(
		mappedSlotsBase.length > 0 ? mappedSlotsBase : [...DEFAULT_WIDGET_SLOTS]
	);
	const panelOffset = normalizeSlotPosition(raw.panelOffset);
	return {
		slots: mappedSlots.length > 0 ? mappedSlots : DEFAULT_WIDGET_SLOTS,
		perWorkspace: raw.perWorkspace === true,
		...(slotPlacement === 'free' ? { slotPlacement: 'free' as const } : {}),
		...(panelOffset ? { panelOffset } : {}),
	};
}

/**
 * При `perWorkspace`: слот без `workspaceProfileId` — глобальный;
 * с id — только если профиль есть и его `desktopId` пустой или совпадает с активным столом.
 */
export function filterDesktopWidgetSlots(
	layout: DesktopWidgetsLayout,
	activeDesktopId: string,
	workspaceProfiles: DesktopWorkspaceProfile[]
): DesktopWidgetLayoutSlot[] {
	const enabled = layout.slots.filter((s) => s.enabled);
	if (!layout.perWorkspace) {
		return enabled;
	}
	const byId = new Map(workspaceProfiles.map((p) => [p.id, p]));
	return enabled.filter((slot) => {
		const pid = slot.workspaceProfileId?.trim();
		if (!pid) return true;
		const profile = byId.get(pid);
		if (!profile) return false;
		const bound = profile.desktopId?.trim();
		if (!bound) return true;
		return bound === activeDesktopId;
	});
}

/** Append default slots missing from persisted `widgets_layout` (forward-compat). */
export function mergeMissingDefaultWidgetSlots(
	slots: DesktopWidgetLayoutSlot[]
): DesktopWidgetLayoutSlot[] {
	const existing = new Set(slots.map((slot) => slot.id));
	const missing = DEFAULT_WIDGET_SLOTS.filter((slot) => !existing.has(slot.id));
	return missing.length > 0 ? [...slots, ...missing] : slots;
}

export function reorderWidgetSlotsByIndex(
	slots: DesktopWidgetLayoutSlot[],
	fromIndex: number,
	toIndex: number
): DesktopWidgetLayoutSlot[] {
	if (
		fromIndex === toIndex ||
		fromIndex < 0 ||
		toIndex < 0 ||
		fromIndex >= slots.length ||
		toIndex >= slots.length
	) {
		return slots;
	}
	const next = [...slots];
	const [removed] = next.splice(fromIndex, 1);
	next.splice(toIndex, 0, removed);
	return next;
}
