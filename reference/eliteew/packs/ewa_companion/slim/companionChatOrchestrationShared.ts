/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared types and helpers for companion chat panel orchestration bundle hooks.
 *
 * Invariants:
 * - Public orchestration contract stays on useEwaCompanionChatPanelOrchestration exports only.
 *
 * Related:
 * - src/features/ewa/companionUx/useEwaCompanionChatPanelOrchestration.tsx
 */

import type { RefObject, Dispatch, SetStateAction } from 'react';
import type { CSSProperties, RefCallback } from 'react';
import type { EwaCompanionProfileOut } from '@/services/ewa/ewaCompanionProfileApi';
import type { CompanionLeftRailClusterProps } from '@/features/ewa/companionUx/CompanionLeftRailCluster';
import type { CompanionChatOperationsRailProps } from '@/features/ewa/companionUx/CompanionChatOperationsRail';
import type { CompanionComposerSectionProps } from '@/features/ewa/companionUx/CompanionComposerSection';
import type { CompanionSlimChatDockProps } from '@/features/ewa/companionUx/CompanionSlimChatDock';
import type { CompanionTranscriptColumnProps } from '@/features/ewa/companionUx/CompanionTranscriptColumn';
import type { CompanionPresenceCompactBarProps } from '@/features/ewa/companionUx/CompanionPresenceCompactBar';
import type { CompanionPresenceHeaderProps } from '@/features/ewa/companionUx/companionPresenceDisplayTypes';
import type { CompanionOutputSurfaceProps } from '@/features/ewa/companionOutputSurface/CompanionOutputSurface';
import type { CompanionChatPanelStackProps } from '@/features/ewa/companionUx/CompanionChatPanelStack';

export type EwaCompanionChatPanelOrchestrationProps = {
	profile: EwaCompanionProfileOut;
	reloadProfile: () => Promise<void>;
	onProfileResetRequired?: () => void;
	onCompanionRevision?: (revision: number) => void;
	refreshDesktopConfigFromServer?: () => Promise<void>;
	embeddedMobile?: boolean;
};

export type EwaCompanionChatPanelOrchestrationResult = {
	mobileEmbeddedLayout: boolean;
	mobileEmbeddedLandscape: boolean;
	arlikaPresence: boolean;
	isDesktopWindowActive: boolean;
	paletteStyle: CSSProperties | undefined;
	workChromeActive: boolean;
	presenceAtRest: boolean;
	presenceHeaderProps: CompanionPresenceHeaderProps;
	compactPresenceProps: CompanionPresenceCompactBarProps;
	leftRailClusterProps: CompanionLeftRailClusterProps;
	hideMobileEmbeddedMetaRail: boolean;
	hideMemoryStrip: boolean;
	operationsRailProps: CompanionChatOperationsRailProps;
	transcriptColumnProps: Omit<CompanionTranscriptColumnProps, 'children'>;
	outputSurfaceProps: CompanionOutputSurfaceProps;
	composerSectionProps: CompanionComposerSectionProps;
	slimChatDockProps: CompanionSlimChatDockProps | null;
	composerVisible: boolean;
	mobileActiveOperationCount: number;
	awaitingConfirmationCount: number;
	setMobileOperationsOpen: Dispatch<SetStateAction<boolean>>;
	documentEditorSurfaceActive: boolean;
	desktopRightRailVisible: boolean;
	attachDocumentSurfaceActionsHost: RefCallback<HTMLDivElement>;
	chatPanelStackProps: CompanionChatPanelStackProps;
};

export function fnv1a32(input: string): number {
	let h = 2166136261;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** Ref bridge filled by transcript bundle after submit hook initializes. */
export type CompanionSubmitLineRef = RefObject<
	(text: string) => void | Promise<void>
>;

/** Ref bridge filled by composer bundle after voice output initializes. */
export type CompanionSpeakReplyRef = RefObject<(reply: string) => void>;
