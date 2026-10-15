/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Compact chat dock when output surface ≠ chat so the orchestrator stays available while editing.
 *
 * Invariants:
 * - Does not replace the full composer in chat mode.
 * - Submit uses the same draft/submit path as the main composer.
 * - Back control matches surface-panel DesktopAppButton chrome (not a bare text link).
 *
 * Related:
 * - companionSurfaceUi.ts
 * - CompanionChatMainColumn.tsx
 */

import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { type ChangeEvent, type KeyboardEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import {
	COMPANION_CHROME_TRANSITION_CLASS,
	COMPANION_SLIM_CHAT_DOCK_SHELL_CLASS,
	COMPANION_SURFACE_FIELD_CLASS,
	COMPANION_SURFACE_LABEL_CLASS,
} from '@/features/ewa/companionOutputSurface/companionSurfaceUi';
import {
	DesktopAppButton,
	DESKTOP_CHROME_FOCUS_VISIBLE,
} from '@/pages/Desktop/components/DesktopAppChrome';
import { cn } from '@/utils/cn';

export type CompanionSlimChatDockProps = {
	draft: string;
	pending: boolean;
	inputRef: RefObject<HTMLTextAreaElement | null>;
	onDraftChange: (next: string) => void;
	onSubmit: () => void;
	onBackToChat: () => void;
};

export function CompanionSlimChatDock({
	draft,
	pending,
	inputRef,
	onDraftChange,
	onSubmit,
	onBackToChat,
}: CompanionSlimChatDockProps) {
	const { t } = useTranslation('marketing');
	const canSend = Boolean(draft.trim()) && !pending;

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (canSend) onSubmit();
		}
	};

	return (
		<div
			className={cn(
				COMPANION_SLIM_CHAT_DOCK_SHELL_CLASS,
				COMPANION_CHROME_TRANSITION_CLASS
			)}
			data-testid="ewa-companion-slim-chat-dock"
		>
			<div className="flex items-center justify-between gap-2">
				<p className={COMPANION_SURFACE_LABEL_CLASS}>
					{t(
						'ewaCompanion.slimChatDockLabel',
						'Chat stays with you — ask while you work'
					)}
				</p>
				<DesktopAppButton
					type="button"
					variant="neutral"
					size="sm"
					onClick={onBackToChat}
				>
					{t('ewaCompanion.slimChatDockBackToChat', 'Back to chat')}
				</DesktopAppButton>
			</div>
			<div className="flex items-end gap-1.5">
				<textarea
					ref={inputRef}
					rows={2}
					value={draft}
					disabled={pending}
					onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
						onDraftChange(e.target.value)
					}
					onKeyDown={handleKeyDown}
					placeholder={t(
						'ewaCompanion.slimChatDockPlaceholder',
						'Message the companion…'
					)}
					className={cn(
						COMPANION_SURFACE_FIELD_CLASS,
						'min-h-10 flex-1 resize-none',
						DESKTOP_CHROME_FOCUS_VISIBLE
					)}
					aria-label={t(
						'ewaCompanion.slimChatDockAria',
						'Companion message while working'
					)}
				/>
				<DesktopAppButton
					type="button"
					variant="accent"
					size="sm"
					disabled={!canSend}
					onClick={onSubmit}
					aria-label={t('ewaCompanion.send', 'Send')}
				>
					<PaperAirplaneIcon className="size-3.5" aria-hidden />
				</DesktopAppButton>
			</div>
		</div>
	);
}
