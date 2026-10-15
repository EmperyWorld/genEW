/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Video Studio UI re-exports from shared Creative Studio primitives.
 *
 * Related:
 * - studioSharedUi.tsx
 */

import { CreativeStudioGeneratingPreview } from '../CreativeStudio/studioSharedUi';

/** Video Studio generating preview (legacy prop shape). */
export function VideoStudioGeneratingPreview({
	imagePreviewUrl,
}: {
	imagePreviewUrl?: string | null;
}) {
	return (
		<CreativeStudioGeneratingPreview
			statusMessage="Создаём ваш ролик — обычно 2–5 минут"
			overlayImageUrl={imagePreviewUrl}
		/>
	);
}

export {
	STUDIO_SKELETON_MOTION as VIDEO_STUDIO_SKELETON_MOTION,
	CreativeStudioFlowCard as VideoStudioFlowCard,
	CreativeStudioPanelCard as VideoStudioPanelCard,
	CreativeStudioHistoryGridSkeleton as VideoStudioHistoryGridSkeleton,
	CreativeStudioGeneratingPreview,
	CreativeStudioHistoryThumbSkeleton as VideoStudioHistoryThumbSkeleton,
	CreativeStudioVideoHistoryThumb as VideoStudioHistoryThumb,
} from '../CreativeStudio/studioSharedUi';

export type { CreativeStudioFlowCardProps as VideoStudioFlowCardProps } from '../CreativeStudio/studioSharedUi';
export type { CreativeStudioPanelCardProps as VideoStudioPanelCardProps } from '../CreativeStudio/studioSharedUi';
