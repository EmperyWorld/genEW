/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Build **v1 desktop shell snapshot** for `POST …/companion-chat` (`shell_context`) from live window/virtual-desktop state
 * inside the SPA — privacy-trimmed titles, capped window count, aligns with companion `CompanionShellContextIn`.
 *
 * Invariants:
 * - Output JSON-serializable; never throws (returns minimal empty snapshot).
 * - By default, only app + folder windows on **`activeDesktopId`** are listed; **`includeAllVirtualDesktops`** lists every virtual desktop
 *   (subject to ``maxWindows``), always with **`desktop_id`** when known — so companion prompts can differentiate spaces.
 * - Optional **`surface_excerpt`** / **`surface_selection`** / **`surface_listing`** per row mirror **`companionSurfaceExcerpt`**
 *   / **`companionSurfaceSelectionPlain`** / **`companionListingPlain`** (bounded on wire; not persisted server-side beyond the POST body).
 * - Rows are chosen by **`z_index` (desc) after filtering**, then capped at **`maxWindows`** — not by raw `windows` array order — so freshly focused apps are not dropped when many windows exist.
 *
 * Related:
 * - src/pages/Desktop/context/EwaCompanionShellBridgeContext.tsx
 * - EliteEW/api/ewa_platform/schemas/pydantic/companion_chat.py
 */
import type { VirtualDesktop } from '@/pages/Desktop/hooks/useVirtualDesktops';
import type { WindowState } from '@/pages/Desktop/types/desktop.types';

export const EWA_COMPANION_SHELL_SCHEMA_V1 = 1 as const;

export type EwaCompanionShellContextV1 = {
	schema_version: typeof EWA_COMPANION_SHELL_SCHEMA_V1;
	client_surface?: 'desktop' | 'mobile' | 'embedded';
	active_desktop_id: string | null;
	active_window_id: string | null;
	windows: Array<{
		window_id: string;
		app_component: string;
		title: string;
		z_index: number;
		minimized: boolean;
		desktop_id?: string;
		/** Plain excerpt for companion prompts (never persisted on server snapshot). */
		surface_excerpt?: string;
		/** Plain selection for companion prompts (Doc Editor host; never persisted on server snapshot). */
		surface_selection?: string;
		/** Plain listing (filenames/inventories) for companion prompts. */
		surface_listing?: string;
	}>;
};

/** Aligned with `api/services/ewa_companion/shell_context.py` `_TITLE_MAX_LEN`. */
const TITLE_CAP = 120;
/** Must stay aligned with `CompanionShellWindowIn.z_index` (Pydantic ``le``). */
const MAX_Z_INDEX = 2_000_000;
/** Below `CompanionShellWindowIn.surface_excerpt` ``max_length`` (leave margin). */
const SURFACE_EXCERPT_WIRE_MAX = 3600;
/** Same cap order as listing on API schema (minus margin). */
const SURFACE_LISTING_WIRE_MAX = 3600;

function clipCompanionSurfaceExcerpt(raw: unknown): string {
	if (typeof raw !== 'string') return '';
	const s = raw.split('\u0000').join(' ').replace(/\s+/g, ' ').trim();
	if (!s) return '';
	return s.length > SURFACE_EXCERPT_WIRE_MAX
		? `${s.slice(0, SURFACE_EXCERPT_WIRE_MAX - 1).trimEnd()}…`
		: s;
}

function clipCompanionListingPlain(raw: unknown): string {
	if (typeof raw !== 'string') return '';
	let s = raw.split('\u0000').join(' ');
	s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const outLines: string[] = [];
	for (const line of s.split('\n')) {
		let t = line.replaceAll('\t', ' ');
		t = t.replace(/\s+/g, ' ').trim();
		if (!t) continue;
		outLines.push(t.length > 500 ? `${t.slice(0, 499).trimEnd()}…` : t);
	}
	s = outLines.join('\n').trim();
	if (!s) return '';
	return s.length > SURFACE_LISTING_WIRE_MAX
		? `${s.slice(0, SURFACE_LISTING_WIRE_MAX - 1).trimEnd()}…`
		: s;
}

function clipCompanionSurfaceSelection(raw: unknown): string {
	return clipCompanionListingPlain(raw);
}

export function sanitizeWindowTitleForCompanion(title: unknown): string {
	if (typeof title !== 'string') return '';
	const s = title.split('\u0000').join(' ').replace(/\s+/g, ' ').trim();
	const redacted = s.replace(
		/\(?\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b\)?/g,
		'[redacted]'
	);
	return redacted.length > TITLE_CAP
		? `${redacted.slice(0, TITLE_CAP - 1).trim()}…`
		: redacted;
}

function windowDesktopMap(desktops: VirtualDesktop[]): Map<string, string> {
	const m = new Map<string, string>();
	for (const d of desktops) {
		for (const wid of d.windows ?? []) {
			m.set(wid, d.id);
		}
	}
	return m;
}

export function buildEwaCompanionShellContextSnapshot(opts: {
	allWindows: WindowState[];
	desktops: VirtualDesktop[];
	activeDesktopId: string | null | undefined;
	activeWindowId: string | null | undefined;
	/**
	 * When true, include app + folder windows on **every** virtual desktop (with `desktop_id` when known).
	 * Default false — only the active desktop’s windows (legacy behavior for tests and narrow snapshots).
	 */
	includeAllVirtualDesktops?: boolean;
	maxWindows?: number;
}): EwaCompanionShellContextV1 {
	const maxW = opts.maxWindows ?? 40;
	const deskMap = windowDesktopMap(opts.desktops ?? []);
	const activeDesk = opts.activeDesktopId?.trim().slice(0, 128) || null;
	const activeWin = opts.activeWindowId?.trim().slice(0, 128) || null;
	const allDesktops = opts.includeAllVirtualDesktops === true;

	const eligible: WindowState[] = [];
	for (const w of opts.allWindows) {
		if (w.type !== 'app' && w.type !== 'folder') continue;
		const rawId = typeof w.id === 'string' ? w.id : '';
		const wid = rawId.trim();
		if (!wid) continue;
		const deskId = deskMap.get(rawId);
		if (!allDesktops) {
			if (activeDesk && deskId && String(deskId) !== activeDesk) continue;
			if (!deskId && activeDesk) continue;
		}
		eligible.push(w);
	}
	eligible.sort((a, b) => {
		const za = Number.isFinite(a.zIndex) ? Math.trunc(a.zIndex) : 0;
		const zb = Number.isFinite(b.zIndex) ? Math.trunc(b.zIndex) : 0;
		if (zb !== za) return zb - za;
		const ida = typeof a.id === 'string' ? a.id : '';
		const idb = typeof b.id === 'string' ? b.id : '';
		return ida.localeCompare(idb);
	});

	const rows: EwaCompanionShellContextV1['windows'] = [];
	for (const w of eligible.slice(0, maxW)) {
		const rawId = typeof w.id === 'string' ? w.id : '';
		const wid = rawId.trim();
		const deskId = deskMap.get(rawId);
		let zRaw = Number.isFinite(w.zIndex) ? Math.trunc(w.zIndex) : 0;
		zRaw = Math.max(0, Math.min(zRaw, MAX_Z_INDEX));
		const comp =
			w.type === 'folder'
				? 'DesktopFolder'
				: (w.appComponent || '').trim().slice(0, 96);
		const excerpt =
			w.type === 'app'
				? clipCompanionSurfaceExcerpt(w.initialPayload?.companionSurfaceExcerpt)
				: '';
		const listing = clipCompanionListingPlain(
			w.initialPayload?.companionListingPlain
		);
		const selection =
			w.type === 'app'
				? clipCompanionSurfaceSelection(
						w.initialPayload?.companionSurfaceSelectionPlain
					)
				: '';
		rows.push({
			window_id: wid.slice(0, 128),
			app_component: comp,
			title: sanitizeWindowTitleForCompanion(w.title),
			z_index: zRaw,
			minimized: Boolean(w.isMinimized),
			...(deskId ? { desktop_id: String(deskId).trim().slice(0, 128) } : {}),
			...(excerpt ? { surface_excerpt: excerpt } : {}),
			...(selection ? { surface_selection: selection } : {}),
			...(listing ? { surface_listing: listing } : {}),
		});
	}
	rows.sort((a, b) => {
		const dz = (b.z_index ?? 0) - (a.z_index ?? 0);
		if (dz !== 0) return dz;
		return a.window_id.localeCompare(b.window_id);
	});

	return {
		schema_version: EWA_COMPANION_SHELL_SCHEMA_V1,
		active_desktop_id: activeDesk,
		active_window_id: activeWin,
		windows: rows.slice(0, maxW),
	};
}

/** Minimal shell snapshot for mobile embedded companion (no desktop window manager). */
export function buildMobileEwaCompanionShellContext(): EwaCompanionShellContextV1 {
	return {
		schema_version: EWA_COMPANION_SHELL_SCHEMA_V1,
		client_surface: 'mobile',
		active_desktop_id: null,
		active_window_id: null,
		windows: [],
	};
}
