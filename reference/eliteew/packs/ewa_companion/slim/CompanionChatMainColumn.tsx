/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Center column: optional mobile meta rail, transcript column, composer section (U8.3 slice 24).
 *
 * Invariants:
 * - Parent owns prop bundles for output surface and composer; column only lays out slots.
 *
 * Related:
 * - src/features/ewa/companionUx/CompanionTranscriptColumn.tsx
 * - src/features/ewa/companionUx/CompanionComposerSection.tsx
 */

import type { ReactNode } from 'react';

import { MOBILE_EMBEDDED_EWA_LANDSCAPE_CHAT_ROW_CLASS } from '@/components/mobileEmbedded/mobileEmbeddedLayoutTokens';
import {
	CompanionComposerSection,
	type CompanionComposerSectionProps,
} from '@/features/ewa/companionUx/CompanionComposerSection';
import {
	CompanionSlimChatDock,
	type CompanionSlimChatDockProps,
} from '@/features/ewa/companionUx/CompanionSlimChatDock';
import {
	CompanionTranscriptColumn,
	type CompanionTranscriptColumnProps,
} from '@/features/ewa/companionUx/CompanionTranscriptColumn';
import { cn } from '@/utils/cn';

export type CompanionChatMainColumnProps = {
	mobileEmbeddedLandscape: boolean;
	mobileMetaRail: ReactNode | null;
	transcriptColumnProps: Omit<CompanionTranscriptColumnProps, 'children'>;
	transcriptContent: ReactNode;
	composerSectionProps: CompanionComposerSectionProps;
	nonChatOperationsEntry?: ReactNode;
	slimChatDockProps?: CompanionSlimChatDockProps | null;
};

export function CompanionChatMainColumn({
	mobileEmbeddedLandscape,
	mobileMetaRail,
	transcriptColumnProps,
	transcriptContent,
	composerSectionProps,
	nonChatOperationsEntry = null,
	slimChatDockProps = null,
}: CompanionChatMainColumnProps) {
	return (
		<div
			className={cn(
				'flex min-h-0 min-w-0 flex-1 flex-col gap-2',
				mobileEmbeddedLandscape && MOBILE_EMBEDDED_EWA_LANDSCAPE_CHAT_ROW_CLASS
			)}
		>
			{mobileMetaRail}
			{nonChatOperationsEntry}
			<CompanionTranscriptColumn {...transcriptColumnProps}>
				{transcriptContent}
			</CompanionTranscriptColumn>
			{slimChatDockProps ? (
				<CompanionSlimChatDock {...slimChatDockProps} />
			) : null}
			<CompanionComposerSection {...composerSectionProps} />
		</div>
	);
}
