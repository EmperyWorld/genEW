/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Output surface state, document embed bridge, and surface prop assembly for companion chat panel.
 *
 * Invariants:
 * - Surface mode persistence keys stay aligned with companionOutputSurfaceState storage.
 *
 * Related:
 * - src/features/ewa/companionUx/useEwaCompanionChatPanelOrchestration.tsx
 * - src/features/ewa/companionOutputSurface/useCompanionOutputSurfaceHandlers.ts
 */

import { useCompanionEmbeddedDocumentSurface } from '@/features/ewa/companionUx/useCompanionEmbeddedDocumentSurface';
import {
	loadCompanionOutputSurfaceState,
	saveCompanionOutputSurfaceState,
} from '@/features/ewa/companionOutputSurface/companionOutputSurfaceState';
import { type CompanionOutputSurfaceState } from '@/features/ewa/companionOutputSurface/types';
import { useCompanionOutputSurfaceHandlers } from '@/features/ewa/companionOutputSurface/useCompanionOutputSurfaceHandlers';
import {
	isCompanionComposerVisible,
	isCompanionSlimChatDockVisible,
	isCompanionSurfacePanelMode,
} from '@/features/ewa/companionOutputSurface/companionSurfaceUi';
import { invalidateDesktopConditionalCache } from '@/pages/Desktop/services/desktopConditionalGet';
import { type RefCallback, type RefObject, useCallback, useState } from 'react';

export type CompanionChatSurfaceBundleInput = {
	principalId: string;
	updateDraft: (next: string) => void;
	inputRef: RefObject<HTMLTextAreaElement | null>;
	refreshDesktopConfigFromServer?: () => Promise<void>;
};

export type CompanionChatSurfaceBundleResult = {
	outputSurface: CompanionOutputSurfaceState;
	setOutputSurface: React.Dispatch<
		React.SetStateAction<CompanionOutputSurfaceState>
	>;
	composerVisible: boolean;
	slimChatDockVisible: boolean;
	surfacePanelActive: boolean;
	documentEditorSurfaceActive: boolean;
	attachDocumentSurfaceActionsHost: RefCallback<HTMLDivElement>;
	documentSurfaceActionsHost: HTMLElement | null;
	handleOutputSurfaceChange: (next: CompanionOutputSurfaceState) => void;
	syncOutputSurfaceFromResponse: (
		out: import('@/services/ewa/ewaCompanionChatApi').CompanionChatMessageResponse
	) => void;
	handleDocumentSurfaceDraftPrompt: (prompt: string) => void;
	applyCompanionDesktopConfigPatchSideEffects: () => void;
	openEmbeddedDocumentSurface: ReturnType<
		typeof useCompanionEmbeddedDocumentSurface
	>['openEmbeddedDocumentSurface'];
	prepareEwaGuideStepSurface: (stepId: string) => void;
};

export function useCompanionChatSurfaceBundle({
	principalId,
	updateDraft,
	inputRef,
	refreshDesktopConfigFromServer,
}: CompanionChatSurfaceBundleInput): CompanionChatSurfaceBundleResult {
	const [outputSurface, setOutputSurface] =
		useState<CompanionOutputSurfaceState>(() =>
			loadCompanionOutputSurfaceState(principalId)
		);
	const composerVisible = isCompanionComposerVisible(outputSurface.mode);
	const slimChatDockVisible = isCompanionSlimChatDockVisible(
		outputSurface.mode
	);
	const surfacePanelActive = isCompanionSurfacePanelMode(outputSurface.mode);
	const documentEditorSurfaceActive = outputSurface.mode === 'document_editor';
	const [documentSurfaceActionsHost, setDocumentSurfaceActionsHost] =
		useState<HTMLElement | null>(null);
	const attachDocumentSurfaceActionsHost = useCallback(
		(node: HTMLDivElement | null) => {
			setDocumentSurfaceActionsHost(node);
		},
		[]
	);

	const applyCompanionDesktopConfigPatchSideEffects = useCallback(() => {
		queueMicrotask(() => {
			invalidateDesktopConditionalCache('config');
			void refreshDesktopConfigFromServer?.();
		});
	}, [refreshDesktopConfigFromServer]);

	const { openEmbeddedDocumentSurface } = useCompanionEmbeddedDocumentSurface({
		principalId,
		setOutputSurface,
	});

	const {
		handleOutputSurfaceChange,
		syncOutputSurfaceFromResponse,
		handleDocumentSurfaceDraftPrompt,
	} = useCompanionOutputSurfaceHandlers({
		principalId,
		setOutputSurface,
		updateDraft,
		inputRef,
	});

	const prepareEwaGuideStepSurface = useCallback(
		(stepId: string) => {
			if (
				stepId === 'transcript' ||
				stepId === 'composer' ||
				stepId === 'quick-presets'
			) {
				const chatSurface: CompanionOutputSurfaceState = { mode: 'chat' };
				setOutputSurface(chatSurface);
				saveCompanionOutputSurfaceState(principalId, chatSurface);
			}
		},
		[principalId]
	);

	return {
		outputSurface,
		setOutputSurface,
		composerVisible,
		slimChatDockVisible,
		surfacePanelActive,
		documentEditorSurfaceActive,
		attachDocumentSurfaceActionsHost,
		documentSurfaceActionsHost,
		handleOutputSurfaceChange,
		syncOutputSurfaceFromResponse,
		handleDocumentSurfaceDraftPrompt,
		applyCompanionDesktopConfigPatchSideEffects,
		openEmbeddedDocumentSurface,
		prepareEwaGuideStepSurface,
	};
}
