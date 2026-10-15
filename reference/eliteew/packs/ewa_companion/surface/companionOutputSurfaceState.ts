/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Session persistence for companion output surface mode per principal.
 *
 * Invariants:
 * - Draft builder state is session-only; server ``output_surface`` wins on chat response.
 * - Persisted payload keeps only bounded scalar fields and bounded `file_list.items` rows.
 *
 * Related:
 * - src/features/ewa/EwaCompanionChatPanel.tsx
 */

import type { CompanionOutputSurfaceState } from '@/features/ewa/companionOutputSurface/types';
import { isCompanionOutputSurfaceMode } from '@/features/ewa/companionOutputSurface/types';
import { ewaCompanionDegradeDebug } from '@/features/ewa/ewaCompanionDegradeDebug';

const PREFIX = 'eliteew.ewaCompanion.surface.v1::';
const MAX_FILE_LIST_ITEMS = 40;

function storageKey(principalId: string): string {
	return `${PREFIX}${principalId.trim()}`;
}

function sanitizePayload(raw: unknown): Record<string, unknown> | undefined {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (typeof value === 'string' && value.trim()) {
			out[key] = value.trim();
		} else if (typeof value === 'boolean' || typeof value === 'number') {
			out[key] = value;
		} else if (key === 'items' && Array.isArray(value)) {
			const rows = value.flatMap((item): Record<string, string>[] => {
				if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
				const rec = item as Record<string, unknown>;
				const unifiedContentId =
					typeof rec.unifiedContentId === 'string'
						? rec.unifiedContentId.trim()
						: '';
				if (!unifiedContentId) return [];
				const row: Record<string, string> = { unifiedContentId };
				for (const field of [
					'title',
					'contentType',
					'mimeType',
					'updatedAt',
					'snippet',
				]) {
					const fieldValue = rec[field];
					if (typeof fieldValue === 'string' && fieldValue.trim()) {
						row[field] = fieldValue.trim().slice(0, 500);
					}
				}
				return [row];
			});
			if (rows.length > 0) out.items = rows.slice(0, MAX_FILE_LIST_ITEMS);
		}
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

export function loadCompanionOutputSurfaceState(
	principalId: string
): CompanionOutputSurfaceState {
	if (typeof window === 'undefined') return { mode: 'chat' };
	try {
		const raw = window.sessionStorage.getItem(storageKey(principalId));
		if (!raw) return { mode: 'chat' };
		const parsed = JSON.parse(raw) as {
			mode?: string;
			payload?: unknown;
		};
		if (!isCompanionOutputSurfaceMode(parsed.mode)) return { mode: 'chat' };
		return {
			mode: parsed.mode,
			payload: sanitizePayload(parsed.payload),
		};
	} catch (err) {
		ewaCompanionDegradeDebug(
			'companion_output_surface_load',
			'sessionStorage surface state load failed',
			err
		);
		return { mode: 'chat' };
	}
}

export function saveCompanionOutputSurfaceState(
	principalId: string,
	state: CompanionOutputSurfaceState
): void {
	if (typeof window === 'undefined') return;
	try {
		if (state.mode === 'chat') {
			window.sessionStorage.removeItem(storageKey(principalId));
			return;
		}
		window.sessionStorage.setItem(
			storageKey(principalId),
			JSON.stringify({
				mode: state.mode,
				payload: sanitizePayload(state.payload),
			})
		);
	} catch (err) {
		ewaCompanionDegradeDebug(
			'companion_output_surface_save',
			'sessionStorage surface state save failed',
			err
		);
	}
}
