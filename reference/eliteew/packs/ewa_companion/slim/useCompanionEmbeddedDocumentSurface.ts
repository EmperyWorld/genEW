/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Open companion ``document_editor`` output surface from server desktop actions (U8.3 slice 10).
 *
 * Invariants:
 * - No-op when neither ``unifiedContentId`` nor ``initialHtml`` is present after trim.
 * - Persists surface per principal via ``saveCompanionOutputSurfaceState``.
 *
 * Related:
 * - src/features/ewa/companionUx/useCompanionActionDispatch.ts
 * - src/features/ewa/companionOutputSurface/companionOutputSurfaceState.ts
 */

import { type Dispatch, type SetStateAction, useCallback } from 'react';

import { saveCompanionOutputSurfaceState } from '@/features/ewa/companionOutputSurface/companionOutputSurfaceState';
import type { CompanionOutputSurfaceState } from '@/features/ewa/companionOutputSurface/types';

export type CompanionEmbeddedDocumentSurfaceInput = {
	unifiedContentId?: string | null;
	title?: string | null;
	initialHtml?: string | null;
	rationale?: string | null;
};

export type UseCompanionEmbeddedDocumentSurfaceOptions = {
	principalId: string;
	setOutputSurface: Dispatch<SetStateAction<CompanionOutputSurfaceState>>;
};

export function useCompanionEmbeddedDocumentSurface({
	principalId,
	setOutputSurface,
}: UseCompanionEmbeddedDocumentSurfaceOptions) {
	const openEmbeddedDocumentSurface = useCallback(
		(input: CompanionEmbeddedDocumentSurfaceInput) => {
			const unifiedContentId = input.unifiedContentId?.trim();
			const initialHtml = input.initialHtml?.trim();
			if (!unifiedContentId && !initialHtml) return;
			const next: CompanionOutputSurfaceState = {
				mode: 'document_editor',
				payload: {
					source: 'companion_action',
					...(unifiedContentId ? { unifiedContentId } : {}),
					...(input.title?.trim() ? { title: input.title.trim() } : {}),
					...(initialHtml ? { initialHtml } : {}),
					...(input.rationale?.trim()
						? { rationale: input.rationale.trim() }
						: {}),
				},
			};
			setOutputSurface(next);
			saveCompanionOutputSurfaceState(principalId, next);
		},
		[principalId, setOutputSurface]
	);

	return { openEmbeddedDocumentSurface };
}
