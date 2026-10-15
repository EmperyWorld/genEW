import type { DesktopWindowStyle } from '@/types/profile';

import type { AccentColorId } from '../context/DesktopStateContext';

const HEX6 = /^#?[0-9a-f]{6}$/i;
const HEX3 = /^#?[0-9a-f]{3}$/i;

const PRESET_NAMES = new Set<string>([
	'pink',
	'purple',
	'blue',
	'green',
	'orange',
	'cyan',
	'gray',
	'steel',
	'charcoal',
]);

export function normalizeHex6(input: string): string {
	const t = input.trim();
	if (HEX6.test(t)) {
		const h = t.startsWith('#') ? t : `#${t}`;
		return h.toLowerCase();
	}
	if (HEX3.test(t)) {
		const raw = (t.startsWith('#') ? t.slice(1) : t).toLowerCase();
		const e = raw
			.split('')
			.map((c) => c + c)
			.join('');
		return `#${e}`;
	}
	return '#a855f7';
}

export function hexToRgbSpaceString(hex: string): string {
	const h = normalizeHex6(hex).slice(1);
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	return `${r} ${g} ${b}`;
}

export function rgbSpaceStringToHex(rgb: string): string {
	const parts = rgb
		.trim()
		.split(/\s+/)
		.map((x) => Number.parseInt(x, 10));
	if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
		return '#a855f7';
	}
	const [r, g, b] = parts.map((n) => Math.max(0, Math.min(255, n))) as [
		number,
		number,
		number,
	];
	return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export function parseDesktopAccentFromApi(raw: string | undefined | null): {
	id: AccentColorId;
	customHex: string;
} {
	const t = (raw ?? 'purple').trim().toLowerCase();
	if (HEX6.test(t) || HEX3.test(t)) {
		return { id: 'custom', customHex: normalizeHex6(t) };
	}
	const id = (PRESET_NAMES.has(t) ? t : 'purple') as AccentColorId;
	return {
		id,
		customHex: '#a855f7',
	};
}

export function rgbToHsv(
	r: number,
	g: number,
	b: number
): { h: number; s: number; v: number } {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const d = max - min;
	let h = 0;
	if (d > 1e-6) {
		if (max === rn) {
			h = ((gn - bn) / d) % 6;
		} else if (max === gn) {
			h = (bn - rn) / d + 2;
		} else {
			h = (rn - gn) / d + 4;
		}
		h *= 60;
		if (h < 0) h += 360;
	}
	const s = max < 1e-6 ? 0 : d / max;
	const v = max;
	return { h, s, v };
}

export function hsvToRgb(
	h: number,
	s: number,
	v: number
): { r: number; g: number; b: number } {
	const hh = ((h % 360) + 360) % 360;
	const c = v * s;
	const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
	const m = v - c;
	let r1 = 0;
	let g1 = 0;
	let b1 = 0;
	if (hh < 60) {
		r1 = c;
		g1 = x;
	} else if (hh < 120) {
		r1 = x;
		g1 = c;
	} else if (hh < 180) {
		g1 = c;
		b1 = x;
	} else if (hh < 240) {
		g1 = x;
		b1 = c;
	} else if (hh < 300) {
		r1 = x;
		b1 = c;
	} else {
		r1 = c;
		b1 = x;
	}
	return {
		r: Math.round((r1 + m) * 255),
		g: Math.round((g1 + m) * 255),
		b: Math.round((b1 + m) * 255),
	};
}

export function hsvToHex(h: number, s: number, v: number): string {
	const { r, g, b } = hsvToRgb(h, s, v);
	return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Канонический акцент для стиля рамки окна (согласован с пресетами `DESKTOP_WINDOW_FRAME_STYLES`):
 * стекло — лёд, нуар — холодный свет, бумага — сепия, премиум — золото и т.д.
 */
const DESKTOP_WINDOW_STYLE_ACCENT_HEX: Record<DesktopWindowStyle, string> = {
	glass: '#22d3ee',
	framed: '#6366f1',
	minimal: '#94a3b8',
	noir: '#e2e8f0',
	neon: '#06b6d4',
	paper: '#8b5a2b',
	aurora: '#a855f7',
	chameleon: '#a78bfa',
	premium: '#d4af6a',
};

export function desktopAccentRgbSpaceFromWindowStyle(
	style: DesktopWindowStyle
): string {
	const hex = DESKTOP_WINDOW_STYLE_ACCENT_HEX[style] ?? '#22d3ee';
	return hexToRgbSpaceString(hex);
}
