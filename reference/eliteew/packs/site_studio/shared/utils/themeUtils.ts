import { themePresetMap, themePresets } from '@constants/themePresets';
import type { ThemeId } from '@constants/themePresets';

const FALLBACK_THEME = themePresets[0];

export const applyThemeVariables = (themeId: ThemeId) => {
	const theme = themePresetMap.get(themeId) ?? FALLBACK_THEME;
	const root = document.documentElement;
	const body = document.body;

	body.dataset.theme = theme.id;

	Object.entries(theme.variables).forEach(([key, value]) => {
		root.style.setProperty(key, value);
	});
};

export const updateEffectClasses = (effects: {
	ambientParticles: boolean;
	softGlow: boolean;
	animatedTransitions: boolean;
}) => {
	const { ambientParticles, softGlow, animatedTransitions } = effects;
	const body = document.body;

	body.classList.toggle('effect-soft-glow', softGlow);
	body.classList.toggle('effect-no-motion', !animatedTransitions);
	body.classList.toggle('effect-ambient-disabled', !ambientParticles);
};

type FontFamily =
	| 'manrope-playfair'
	| 'inter-georgia'
	| 'roboto-merriweather'
	| 'lora-crimson'
	| 'montserrat-lora';

const fontMap: Record<FontFamily, { display: string; body: string }> = {
	'manrope-playfair': {
		display: "'Playfair Display', serif",
		body: "'Manrope', 'Inter', sans-serif",
	},
	'inter-georgia': {
		display: 'Georgia, serif',
		body: "'Inter', sans-serif",
	},
	'roboto-merriweather': {
		display: "'Merriweather', serif",
		body: "'Roboto', sans-serif",
	},
	'lora-crimson': {
		display: "'Crimson Text', serif",
		body: "'Lora', serif",
	},
	'montserrat-lora': {
		display: "'Lora', serif",
		body: "'Montserrat', sans-serif",
	},
};

export const applyFontFamily = (fontId: FontFamily) => {
	const root = document.documentElement;
	const fonts = fontMap[fontId] || fontMap['manrope-playfair'];

	root.style.setProperty('--font-family-display', fonts.display);
	root.style.setProperty('--font-family-sans', fonts.body);
	document.body.dataset.font = fontId;
};
