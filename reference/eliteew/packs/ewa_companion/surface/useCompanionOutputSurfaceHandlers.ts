/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Output surface change + sync handlers extracted from companion chat panel (U8.1).
 *
 * Invariants:
 * - Persists surface per principal in sessionStorage via companionOutputSurfaceState helpers.
 * - Document draft prompt always returns surface to chat mode before focusing composer.
 *
 * Related:
 * - src/features/ewa/EwaCompanionChatPanel.tsx
 */

import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
} from 'react';

import { saveCompanionOutputSurfaceState } from '@/features/ewa/companionOutputSurface/companionOutputSurfaceState';
import {
	coerceCompanionOutputSurface,
	type CompanionOutputSurfaceState,
} from '@/features/ewa/companionOutputSurface/types';
import type { CompanionChatMessageResponse } from '@/services/ewa/ewaCompanionChatApi';

export type UseCompanionOutputSurfaceHandlersOptions = {
	principalId: string;
	setOutputSurface: Dispatch<SetStateAction<CompanionOutputSurfaceState>>;
	updateDraft?: (text: string) => void;
	inputRef?: RefObject<HTMLTextAreaElement | null>;
};

export function useCompanionOutputSurfaceHandlers({
	principalId,
	setOutputSurface,
	updateDraft,
	inputRef,
}: UseCompanionOutputSurfaceHandlersOptions) {
	const handleOutputSurfaceChange = useCallback(
		(next: CompanionOutputSurfaceState) => {
			setOutputSurface(next);
			saveCompanionOutputSurfaceState(principalId, next);
		},
		[principalId, setOutputSurface]
	);

	const syncOutputSurfaceFromResponse = useCallback(
		(out: CompanionChatMessageResponse) => {
			const coerced = coerceCompanionOutputSurface(out.output_surface);
			if (!coerced) return;
			setOutputSurface(coerced);
			saveCompanionOutputSurfaceState(principalId, coerced);
		},
		[principalId, setOutputSurface]
	);

	const handleDocumentSurfaceDraftPrompt = useCallback(
		(text: string) => {
			const next = text.trim();
			if (!next || !updateDraft) return;
			updateDraft(next);
			const chatSurface: CompanionOutputSurfaceState = { mode: 'chat' };
			setOutputSurface(chatSurface);
			saveCompanionOutputSurfaceState(principalId, chatSurface);
			queueMicrotask(() => inputRef?.current?.focus());
		},
		[inputRef, principalId, setOutputSurface, updateDraft]
	);

	return {
		handleOutputSurfaceChange,
		syncOutputSurfaceFromResponse,
		handleDocumentSurfaceDraftPrompt,
	};
}
