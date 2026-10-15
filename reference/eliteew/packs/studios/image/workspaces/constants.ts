/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared constants for Image Studio workspaces (size/rotate/style presets, variant counts).
 *
 * Invariants:
 * - ROTATE_MODES values must match API rotate mode keys (SSOT on backend).
 * - STYLE_PRESETS promptSuffix is appended client-side to the generation prompt.
 *
 * Related:
 * - documentation/product/IMAGE-STUDIO.md
 * - api/services/image_studio/rotate_modes.py
 */

export const SIZE_PRESETS = [
	{ w: 512, h: 512, label: '512×512' },
	{ w: 768, h: 768, label: '768×768' },
	{ w: 1024, h: 1024, label: '1024×1024' },
	{ w: 1024, h: 768, label: '1024×768' },
	{ w: 1280, h: 720, label: '1280×720' },
] as const;

export const ROTATE_MODES: {
	value: string;
	labelRu: string;
	labelEn: string;
}[] = [
	{ value: 'close_up', labelRu: 'Крупный план', labelEn: 'Close-up' },
	{ value: 'wide', labelRu: 'Широкий план', labelEn: 'Wide shot' },
	{ value: 'angle45_right', labelRu: '45° вправо', labelEn: '45° right' },
	{ value: 'angle90_right', labelRu: '90° вправо', labelEn: '90° right' },
	{ value: 'aerial', labelRu: 'Вид сверху', labelEn: 'Aerial' },
	{ value: 'low', labelRu: 'Нижний ракурс', labelEn: 'Low angle' },
	{ value: 'angle45_left', labelRu: '45° влево', labelEn: '45° left' },
	{ value: 'angle90_left', labelRu: '90° влево', labelEn: '90° left' },
	{ value: 'all', labelRu: 'Все ракурсы', labelEn: 'All angles' },
];

export interface StylePreset {
	id: string;
	labelRu: string;
	labelEn: string;
	/** Empty for "none" — no suffix appended. */
	promptSuffix: string;
}

export const STYLE_PRESETS: readonly StylePreset[] = [
	{
		id: 'none',
		labelRu: 'Без стиля',
		labelEn: 'No style',
		promptSuffix: '',
	},
	{
		id: 'cinematic',
		labelRu: 'Кино',
		labelEn: 'Cinematic',
		promptSuffix: ', cinematic lighting, dramatic composition, film still',
	},
	{
		id: 'watercolor',
		labelRu: 'Акварель',
		labelEn: 'Watercolor',
		promptSuffix: ', watercolor painting, soft washes, paper texture',
	},
	{
		id: 'photo',
		labelRu: 'Фото',
		labelEn: 'Photo',
		promptSuffix: ', photorealistic, natural light, sharp detail',
	},
	{
		id: 'illustration',
		labelRu: 'Иллюстрация',
		labelEn: 'Illustration',
		promptSuffix: ', digital illustration, clean lines, vivid colors',
	},
	{
		id: 'anime',
		labelRu: 'Аниме',
		labelEn: 'Anime',
		promptSuffix: ', anime style, expressive eyes, cel shading',
	},
	{
		id: 'oil',
		labelRu: 'Масло',
		labelEn: 'Oil paint',
		promptSuffix: ', oil painting, visible brushstrokes, rich pigments',
	},
] as const;

/** Allowed multi-variant counts for sequential text-to-image. */
export const VARIANT_COUNTS = [2, 3, 4] as const;

export type VariantCount = (typeof VARIANT_COUNTS)[number];

export const T2I_EXAMPLES = [
	'Закат над морем, мягкий свет, акварельный стиль',
	'Киберпанк-город ночью, неоновые вывески, отражения в лужах',
	'Уютная кофейня, утренний свет из окна, детализированная иллюстрация',
] as const;

export const STYLE_PRESET_STORAGE_KEY = 'eliteew.imageStudio.stylePreset.v1';

export const HISTORY_FILTER_TAGS = [
	'all',
	'text_to_image',
	'image_edit',
	'rotate_image',
] as const;

export type HistoryFilterTag = (typeof HISTORY_FILTER_TAGS)[number];
