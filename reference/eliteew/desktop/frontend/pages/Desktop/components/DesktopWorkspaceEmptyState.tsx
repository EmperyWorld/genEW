/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Empty desktop CTA when there are no icons (after welcome).
 *
 * Invariants:
 * - Overlay is pointer-events-none except the centered card.
 *
 * Related:
 * - DesktopWorkspaceCanvas.tsx, DesktopChromeTooltip.tsx
 */

import * as React from 'react';
import { DESKTOP_INTERACTIVE, DESKTOP_TYPOGRAPHY } from '../constants';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';

export const DesktopWorkspaceEmptyState: React.FC<{
	title: string;
	description: string;
	appStoreLabel: string;
	onOpenAppStore: () => void;
}> = ({ title, description, appStoreLabel, onOpenAppStore }) => (
	<section
		aria-label={title}
		className="pointer-events-none absolute inset-0 z-2 flex items-center justify-center p-8 pb-24"
	>
		<div className="pointer-events-auto max-w-md rounded-2xl border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-panel-strong)_94%,var(--desktop-menu-tint)_6%)] px-6 py-5 text-center text-(--desktop-text-primary) shadow-(--desktop-shadow-panel)">
			<p className="text-base font-semibold">{title}</p>
			<p className={`mt-2 ${DESKTOP_TYPOGRAPHY.meta}`}>{description}</p>
			<DesktopChromeTooltip
				content={appStoreLabel}
				placement="top"
				offsetExtra={6}
			>
				<button
					type="button"
					className={`mt-4 min-h-11 w-full rounded-xl px-4 py-2 text-sm font-medium sm:w-auto ${DESKTOP_INTERACTIVE.btnPrimary} ${DESKTOP_INTERACTIVE.focusRing}`}
					onClick={onOpenAppStore}
				>
					{appStoreLabel}
				</button>
			</DesktopChromeTooltip>
		</div>
	</section>
);
