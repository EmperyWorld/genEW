/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T <keysray70@gmail.com>
 * ---
 *
 * Purpose:
 * Full-screen loading state for the EliteEW Безраздельный мир shell while storage/config is not ready.
 *
 * Invariants:
 * - The loading root keeps desktop theme variables active so skeleton colors match the user profile.
 * - Stalled loading offers one retry action without clearing local layout data.
 *
 * Related:
 * - `DesktopLoadingSkeleton.tsx`
 * - `hooks/useDesktopWorkspaceChromeState.ts`
 */
import * as React from 'react';
import type { ElitePreloaderProgressVariant } from '@/components/ui/ElitePreloaderProgressQuote';
import {
	DESKTOP_DESIGN_TOKENS,
	DESKTOP_INTERACTIVE,
	DESKTOP_Z_INDEX,
} from '../constants';
import { DesktopLoadingSkeleton } from './DesktopLoadingSkeleton';

export interface DesktopWorkspaceLoadingShellProps {
	loadingLabel: string;
	effectiveTheme: string;
	desktopThemeVars: Record<string, string>;
	workspaceShellCss: string;
	isLoadingStalled: boolean;
	preloaderVariant?: ElitePreloaderProgressVariant;
	maintenanceTitle?: string | null;
	loadingStalledMessage: string;
	retryLabel: string;
	onRetry: () => void | Promise<void>;
	connectionCheckLabel?: string;
	onConnectionCheck?: () => void | Promise<void>;
}

export function DesktopWorkspaceLoadingShell({
	loadingLabel,
	effectiveTheme,
	desktopThemeVars,
	workspaceShellCss,
	isLoadingStalled,
	preloaderVariant = 'boot',
	maintenanceTitle = null,
	loadingStalledMessage,
	retryLabel,
	onRetry,
	connectionCheckLabel,
	onConnectionCheck,
}: DesktopWorkspaceLoadingShellProps) {
	return (
		<>
			<style>{workspaceShellCss}</style>
			<div
				data-theme={effectiveTheme}
				className={`desktop-workspace-shell relative min-h-0 h-screen w-full overflow-hidden overscroll-contain ${effectiveTheme === 'dark' ? 'dark' : ''}`}
				style={
					{
						background: 'rgb(var(--desktop-bg-primary-rgb, 15 23 42))',
						...DESKTOP_DESIGN_TOKENS,
						...desktopThemeVars,
						fontFamily:
							'var(--desktop-font-family, "Manrope", "Roboto", "Segoe UI", sans-serif)',
						colorScheme: effectiveTheme,
					} as React.CSSProperties
				}
				role="status"
				aria-busy="true"
				aria-label={loadingLabel}
			>
				{isLoadingStalled && (
					<div
						className="absolute bottom-20 left-1/2 flex max-w-[min(100vw-2rem,360px)] -translate-x-1/2 flex-col gap-2 rounded-xl border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--glass-bg-strong)_92%,var(--desktop-menu-tint)_8%)] px-4 py-3 text-(--desktop-text-primary) shadow-lg backdrop-blur-md"
						style={{ zIndex: DESKTOP_Z_INDEX.TOAST }}
						role="status"
						aria-live="polite"
					>
						{maintenanceTitle ? (
							<p className="text-xs font-semibold uppercase tracking-wide text-(--desktop-text-muted)">
								{maintenanceTitle}
							</p>
						) : null}
						<p className="text-sm">{loadingStalledMessage}</p>
						<div className="flex flex-wrap gap-2">
							{connectionCheckLabel && onConnectionCheck ? (
								<button
									type="button"
									className={`rounded-lg px-3 py-2 text-sm ${DESKTOP_INTERACTIVE.btnPrimary} ${DESKTOP_INTERACTIVE.focusRing} min-h-11`}
									onClick={() => void onConnectionCheck()}
								>
									{connectionCheckLabel}
								</button>
							) : null}
							<button
								type="button"
								className={`rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-panel)/80 px-3 py-2 text-sm text-(--desktop-text-primary) ${DESKTOP_INTERACTIVE.focusRing} min-h-11`}
								onClick={() => void onRetry()}
							>
								{retryLabel}
							</button>
						</div>
					</div>
				)}
				<DesktopLoadingSkeleton
					loadingLabel={loadingLabel}
					preloaderVariant={preloaderVariant}
				/>
			</div>
		</>
	);
}
