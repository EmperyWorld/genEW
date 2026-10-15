/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Renders the progressive-disclosure navigation tier for Desktop behavior and comfort.
 * It keeps the existing shell and performance tab identities while reducing primary navigation noise.
 *
 * Invariants:
 * - Shell and performance remain real tabs when the disclosure is expanded.
 * - Advanced tabs use their own tablist and never become primary-tab peers.
 *
 * Related:
 * - `DesktopSettingsPanel.tsx`
 * - `desktopSettingsTablistKeyboard.ts`
 */

import { ChevronDownIcon } from '@heroicons/react/24/outline';
import type { KeyboardEventHandler, ReactNode } from 'react';
import { cn } from '@/utils/cn';
import {
	DESKTOP_APP_STYLE_CONTRACT,
	DESKTOP_CHROME_FOCUS_VISIBLE,
} from '../DesktopAppChrome';
import { DESKTOP_TYPOGRAPHY } from '../../constants';
import type {
	DesktopSettingsTabMeta,
	TabId,
} from './desktopSettingsShared.types';

type DesktopSettingsAdvancedDisclosureProps = {
	layout: 'desktop' | 'mobile';
	activeTab: TabId;
	advancedExpanded: boolean;
	advancedDisclosureLabel: string;
	advancedTablistLabel: string;
	advancedTabs: readonly DesktopSettingsTabMeta[];
	primaryTabs: readonly DesktopSettingsTabMeta[];
	primaryTablistLabel: string;
	tabpanelId: string;
	getTriggerId: (tabId: TabId) => string;
	onActiveTabChange: (tabId: TabId) => void;
	onAdvancedExpandedChange: (expanded: boolean) => void;
	onPrimaryTablistKeyDown: KeyboardEventHandler<HTMLDivElement>;
	onAdvancedTablistKeyDown: KeyboardEventHandler<HTMLDivElement>;
};

export function DesktopSettingsAdvancedDisclosure({
	layout,
	activeTab,
	advancedExpanded,
	advancedDisclosureLabel,
	advancedTablistLabel,
	advancedTabs,
	primaryTabs,
	primaryTablistLabel,
	tabpanelId,
	getTriggerId,
	onActiveTabChange,
	onAdvancedExpandedChange,
	onPrimaryTablistKeyDown,
	onAdvancedTablistKeyDown,
}: DesktopSettingsAdvancedDisclosureProps): ReactNode {
	const isDesktop = layout === 'desktop';
	const renderTab = (tab: DesktopSettingsTabMeta) => {
		const TabIcon = tab.Icon;
		const active = activeTab === tab.id;
		return (
			<button
				key={tab.id}
				type="button"
				id={getTriggerId(tab.id)}
				role="tab"
				aria-selected={active}
				aria-controls={tabpanelId}
				tabIndex={active ? 0 : -1}
				onClick={() => onActiveTabChange(tab.id)}
				className={cn(
					isDesktop
						? 'group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none'
						: 'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-left font-medium transition-colors outline-none',
					DESKTOP_CHROME_FOCUS_VISIBLE,
					active
						? isDesktop
							? 'bg-[rgb(var(--desktop-accent-rgb)/0.14)] text-(--desktop-text-primary) shadow-[inset_3px_0_0_rgb(var(--desktop-accent-rgb))]'
							: 'bg-(--desktop-surface-accent) text-(--desktop-text-primary)'
						: 'text-(--desktop-text-secondary) hover:bg-(--desktop-surface-soft) hover:text-(--desktop-text-primary)'
				)}
			>
				<span
					className={cn(
						isDesktop && 'mt-0.5 rounded-lg p-1',
						active
							? 'bg-[rgb(var(--desktop-accent-rgb)/0.18)] text-[rgb(var(--desktop-accent-rgb))]'
							: 'bg-(--desktop-surface-soft) text-(--desktop-text-muted)'
					)}
				>
					<TabIcon className={isDesktop ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
				</span>
				<span className="min-w-0">
					<span
						className={cn(
							isDesktop
								? 'block text-sm font-semibold text-inherit desktop-shell-display-text'
								: 'whitespace-nowrap',
							!isDesktop && DESKTOP_TYPOGRAPHY.captionInherit
						)}
					>
						{tab.label}
					</span>
					{isDesktop ? (
						<span className={DESKTOP_APP_STYLE_CONTRACT.helperText}>
							{tab.description}
						</span>
					) : null}
				</span>
			</button>
		);
	};

	return (
		<>
			<div
				aria-label={primaryTablistLabel}
				role="tablist"
				onKeyDown={onPrimaryTablistKeyDown}
				className={isDesktop ? 'space-y-1' : 'flex shrink-0 gap-1'}
			>
				{primaryTabs.map(renderTab)}
			</div>
			<section
				className={cn(
					isDesktop
						? 'mt-3 border-t border-(--desktop-border-subtle) pt-3'
						: 'flex shrink-0 items-center'
				)}
			>
				<button
					type="button"
					aria-expanded={advancedExpanded}
					aria-controls="desktop-settings-advanced-tabs"
					onClick={() => onAdvancedExpandedChange(!advancedExpanded)}
					className={cn(
						'flex items-center gap-2 rounded-lg text-left text-(--desktop-text-secondary) outline-none transition-colors hover:text-(--desktop-text-primary)',
						DESKTOP_CHROME_FOCUS_VISIBLE,
						isDesktop
							? 'w-full px-3 py-2 text-xs font-semibold'
							: 'shrink-0 px-2.5 py-2 text-xs font-medium'
					)}
				>
					<ChevronDownIcon
						aria-hidden
						className={cn(
							'h-4 w-4 transition-transform motion-reduce:transition-none',
							advancedExpanded && 'rotate-180'
						)}
					/>
					<span>{advancedDisclosureLabel}</span>
				</button>
				{advancedExpanded ? (
					<div
						id="desktop-settings-advanced-tabs"
						aria-label={advancedTablistLabel}
						role="tablist"
						onKeyDown={onAdvancedTablistKeyDown}
						className={cn(
							isDesktop ? 'mt-1 space-y-1 pl-2' : 'flex shrink-0 gap-1'
						)}
					>
						{advancedTabs.map(renderTab)}
					</div>
				) : null}
			</section>
		</>
	);
}
