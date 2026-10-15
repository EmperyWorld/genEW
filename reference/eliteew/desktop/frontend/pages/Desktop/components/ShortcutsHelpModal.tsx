/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Modal listing wired desktop-shell keyboard shortcuts (F1 or taskbar).
 *
 * Invariants:
 * - Content mirrors `getDesktopShortcutHelpGroups` — only shortcuts with handlers in the workspace bridge.
 * - Shortcut chips use platform-aware labels (`formatShortcutKeysForPlatform`).
 * - Modal body is a shell keyboard surface (global shortcuts defer while help is open).
 * - Escape uses ModalAdvanced desktop capture defaults.
 *
 * Related:
 * - utils/desktopShellKeyboardCapture.ts
 * - useKeyboardShortcuts.ts, useDesktopWorkspaceKeyboardShortcuts.ts
 */

import { ModalAdvanced } from '@/components/ui/ModalAdvanced';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { DESKTOP_TYPOGRAPHY } from '../constants';
import {
	formatShortcutKeysForPlatform,
	getDesktopShortcutHelpGroups,
} from '../hooks/useKeyboardShortcuts';

const SHORTCUT_KBD_CLASS = cn(
	DESKTOP_TYPOGRAPHY.kbd,
	'inline-flex items-center rounded-md border border-(--desktop-border-subtle) bg-(--desktop-surface-panel) px-2 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
);

function splitShortcutKeys(keys: string): string[] {
	return keys
		.split(/\s*(?:,|или|or)\s*/i)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

function ShortcutKeyChips({ keys }: { keys: string }): React.JSX.Element {
	const parts = splitShortcutKeys(formatShortcutKeysForPlatform(keys));
	return (
		<div className="flex flex-wrap justify-start gap-1.5 sm:justify-end">
			{parts.map((part) => (
				<kbd key={part} className={SHORTCUT_KBD_CLASS}>
					{part}
				</kbd>
			))}
		</div>
	);
}

export interface ShortcutsHelpModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function ShortcutsHelpModal({
	isOpen,
	onClose,
}: ShortcutsHelpModalProps): React.JSX.Element | null {
	const { t } = useTranslation('desktopUi');
	const shortcutGroups = React.useMemo(
		() => getDesktopShortcutHelpGroups(t),
		[t]
	);

	if (!isOpen) return null;

	return (
		<ModalAdvanced
			isOpen={true}
			onClose={onClose}
			title={t('shortcuts.modalTitle')}
			size="lg"
			variant="desktop"
			showCloseButton
		>
			<p className={cn(DESKTOP_TYPOGRAPHY.bodyMuted, 'mb-4 leading-relaxed')}>
				{t('shortcuts.modalIntro')}
			</p>
			<section
				className="mb-4 overflow-hidden rounded-xl border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-soft)_72%,transparent)]"
				data-testid="shortcuts-launcher-map"
			>
				<h3
					className={cn(
						DESKTOP_TYPOGRAPHY.caption,
						'border-b border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-panel)_88%,transparent)] px-3 py-2 font-semibold uppercase tracking-wider text-(--desktop-text-muted)'
					)}
				>
					{t('shortcuts.launcherMap.title')}
				</h3>
				<ul className="divide-y divide-(--desktop-border-subtle)">
					{(['quickSearch', 'commandPalette', 'startMenu'] as const).map(
						(id) => (
							<li
								key={id}
								className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-6"
							>
								<p className="text-sm leading-snug text-(--desktop-text-primary)">
									{t(`shortcuts.launcherMap.${id}.desc`)}
								</p>
								<ShortcutKeyChips
									keys={t(`shortcuts.launcherMap.${id}.keys`)}
								/>
							</li>
						)
					)}
				</ul>
			</section>
			<div className="space-y-4">
				{shortcutGroups.map(({ group, items }) => (
					<section
						key={group}
						className="overflow-hidden rounded-xl border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-soft)_72%,transparent)]"
					>
						<h3
							className={cn(
								DESKTOP_TYPOGRAPHY.caption,
								'border-b border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-panel)_88%,transparent)] px-3 py-2 font-semibold uppercase tracking-wider text-(--desktop-text-muted)'
							)}
						>
							{group}
						</h3>
						<ul className="divide-y divide-(--desktop-border-subtle)">
							{items.map(({ id, keys, desc }) => (
								<li
									key={id}
									className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-6"
								>
									<p className="text-sm leading-snug text-(--desktop-text-primary)">
										{desc}
									</p>
									<ShortcutKeyChips keys={keys} />
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</ModalAdvanced>
	);
}
