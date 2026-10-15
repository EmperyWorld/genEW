/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Barrel re-exports for Image Studio workspace modules.
 *
 * Invariants:
 * - Keep public names stable for ImageStudioPage imports.
 *
 * Related:
 * - documentation/product/IMAGE-STUDIO.md
 */

export {
	SIZE_PRESETS,
	ROTATE_MODES,
	STYLE_PRESETS,
	VARIANT_COUNTS,
	T2I_EXAMPLES,
	STYLE_PRESET_STORAGE_KEY,
	HISTORY_FILTER_TAGS,
	type StylePreset,
	type VariantCount,
	type HistoryFilterTag,
} from './constants';

export type {
	ImageStudioResult,
	ImageStudioApiResponse,
	ImageStudioHistoryItem,
	ImageStudioTab,
} from './types';

export {
	ImageStudioTextToImageWorkspace,
	type ImageStudioTextToImageWorkspaceProps,
} from './TextToImageWorkspace';

export {
	ImageStudioEditWorkspace,
	type ImageStudioEditWorkspaceProps,
} from './EditWorkspace';

export {
	ImageStudioRotateWorkspace,
	type ImageStudioRotateWorkspaceProps,
} from './RotateWorkspace';

export {
	ImageStudioHistoryWorkspace,
	type ImageStudioHistoryWorkspaceProps,
} from './HistoryWorkspace';
