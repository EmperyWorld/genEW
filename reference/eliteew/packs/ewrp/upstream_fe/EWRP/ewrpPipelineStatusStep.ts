/**
 * Maps EWRP job `status` to the visual pipeline step (4 stages before completion).
 */

export type EwrpPipelineMode = 'idle' | 'running' | 'completed' | 'failed';

export function ewrpPipelineMode(
	status: string | null | undefined
): EwrpPipelineMode {
	const s = (status ?? '').toLowerCase();
	if (s === 'completed') return 'completed';
	if (s === 'failed') return 'failed';
	if (
		s === 'queued' ||
		s === 'generating_content' ||
		s === 'generating_images' ||
		s === 'building_pdf'
	) {
		return 'running';
	}
	return 'idle';
}

/** Active step index 0…3 while running; ignored when not running. */
export function ewrpPipelineActiveStepIndex(
	status: string | null | undefined
): 0 | 1 | 2 | 3 {
	const s = (status ?? '').toLowerCase();
	switch (s) {
		case 'queued':
			return 0;
		case 'generating_content':
			return 1;
		case 'generating_images':
			return 2;
		case 'building_pdf':
			return 3;
		default:
			return 0;
	}
}

/**
 * On failure, infer which step broke using `progress` (best-effort; API has no substage).
 */
export function ewrpPipelineFailedStepIndex(progress: number): 0 | 1 | 2 | 3 {
	const p = Number.isFinite(progress) ? progress : 0;
	if (p < 18) return 0;
	if (p < 45) return 1;
	if (p < 78) return 2;
	return 3;
}
