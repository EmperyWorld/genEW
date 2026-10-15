/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Single desktop window for UGS: Hub, Dashboard, Analytics, Admin, Workflow Builder without route churn.
 *
 * Invariants:
 * - Admin subview loads `features/ugs/admin-v2/UGSAdminV2Panel` only when `hasUgsAdminIdentity` is true.
 * - Lazy chunks stay stable; UGS Admin path is the v2 feature module.
 *
 * Related:
 * - src/features/ugs/admin-v2/UGSAdminV2Panel.tsx
 * - src/components/UGSHub.tsx
 * - DesktopChromeTooltip.tsx
 */

import * as React from 'react';
import { useCallback, useState, Suspense, lazy } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useDesktopShellTheme } from '../../../hooks/useDesktopShellTheme';
import { hasUgsAdminIdentity } from '../../../utils/ugsAdminAccess';
import type { NavigationHandler } from '../../../types/navigation';
import { cn } from '@/utils/cn';
import { DESKTOP_LUCIDE, DESKTOP_TYPOGRAPHY } from '../constants';
import {
	DesktopAppButton,
	DesktopAppContentWrapper,
	DesktopAppStatusBadge,
	DesktopAppToolbar,
} from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import {
	extractWorkflowBuilderId,
	isWorkflowBuilderTarget,
} from '../../../utils/workflowBuilderRoute';
import { UgsHubShellThemeProvider } from '../../../components/UGS/hub/ugsHubShellThemeContext';
import UGSHub from '../../../components/UGSHub';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';

const UGSDashboardLazy = lazy(() => import('../../../components/UGSDashboard'));
const UGSAnalyticsLazy = lazy(() => import('../../UGSAnalytics'));
const UGSAdminV2PanelLazy = lazy(
	() => import('../../../features/ugs/admin-v2/UGSAdminV2Panel')
);
const UGSWorkflowBuilderPageLazy = lazy(
	() => import('../../../components/UGS/UGSWorkflowBuilderPage')
);

type UGSView = 'hub' | 'dashboard' | 'analytics' | 'admin' | 'builder';

/** Suspense fallback for lazy UGS views — a11y + tokens aligned with desktop shell. */
export function UGSDesktopSuspenseFallback(): React.ReactElement {
	const { t } = useTranslation('desktopUi', { keyPrefix: 'ugsDesktop' });
	return (
		<div
			className="flex h-full min-h-[200px] items-center justify-center bg-transparent"
			role="status"
			aria-busy="true"
			aria-label={t('suspenseLoadingAria')}
			data-testid="ugs-desktop-suspense-fallback"
		>
			<ArrowPathIcon
				className="h-8 w-8 shrink-0 animate-spin motion-reduce:animate-none text-(--desktop-text-muted)"
				strokeWidth={DESKTOP_LUCIDE.stroke}
				aria-hidden
			/>
		</div>
	);
}

export interface UGSDesktopContainerProps {
	onNavigate?: NavigationHandler;
	initialView?: UGSView;
	initialWorkflowId?: string | null;
}

export const UGSDesktopContainer: React.FC<UGSDesktopContainerProps> = ({
	onNavigate,
	initialView = 'hub',
	initialWorkflowId = null,
}) => {
	const { t } = useTranslation('desktopUi', { keyPrefix: 'ugsDesktop' });
	const { user } = useAuth();
	const isUgsAdmin = hasUgsAdminIdentity(user);
	const viewLabel = useCallback(
		(nextView: UGSView) => t(`views.${nextView}`),
		[t]
	);
	const viewTooltip = useCallback(
		(nextView: UGSView) => t(`viewTooltips.${nextView}`),
		[t]
	);
	const [view, setView] = useState<UGSView>(initialView);
	const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(
		initialWorkflowId
	);
	const shellTheme = useDesktopShellTheme();

	React.useEffect(() => {
		setView(initialView);
	}, [initialView]);

	React.useEffect(() => {
		setActiveWorkflowId(initialWorkflowId);
	}, [initialWorkflowId]);

	React.useEffect(() => {
		if (
			!isUgsAdmin &&
			(view === 'builder' || view === 'admin' || view === 'dashboard')
		) {
			setView('hub');
		}
	}, [isUgsAdmin, view]);

	const handleInAppNavigate = useCallback(
		(page: string) => {
			if (page === 'ugs-hub') {
				setView('hub');
				return;
			}
			if (isWorkflowBuilderTarget(page)) {
				if (!isUgsAdmin) {
					setView('hub');
					return;
				}
				setActiveWorkflowId(extractWorkflowBuilderId(page));
				setView('builder');
				return;
			}
			if (page === 'ugs') {
				setView(isUgsAdmin ? 'dashboard' : 'hub');
				return;
			}
			if (page === 'ugs-analytics') {
				setView('analytics');
				return;
			}
			if (page === 'ugs-admin') {
				setView('admin');
				return;
			}
			onNavigate?.(page);
		},
		[onNavigate, isUgsAdmin]
	);

	return (
		<DesktopAppContentWrapper appComponent="UGS" className="h-full">
			<section
				className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent"
				data-testid="ugs-desktop-container"
				data-ugs-shell-theme={shellTheme}
				data-ugs-view={view}
				aria-label={t('containerAria')}
			>
				<div className="shrink-0 border-b border-(--desktop-border-subtle) bg-(--desktop-surface-panel)">
					<DesktopAppToolbar className="flex flex-col items-stretch gap-2 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
						<div className="min-w-0">
							<p className={DESKTOP_TYPOGRAPHY.labelOverline}>
								{t('workspaceOverline')}
							</p>
							<div className="mt-1 flex flex-wrap items-center gap-2">
								<h2 className={cn('min-w-0', DESKTOP_TYPOGRAPHY.subtitle)}>
									{viewLabel(view)}
								</h2>
								<DesktopAppStatusBadge className="border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-secondary)">
									{view === 'builder' && activeWorkflowId
										? t('workflowBadge', { id: activeWorkflowId })
										: t('singleWindowBadge')}
								</DesktopAppStatusBadge>
							</div>
						</div>
						<div
							role="tablist"
							aria-label={t('sectionsTablistAria')}
							className="flex flex-wrap items-center gap-2"
						>
							{(['hub', 'dashboard', 'analytics', 'admin'] as const)
								.filter(
									(nextView) =>
										(nextView !== 'admin' && nextView !== 'dashboard') ||
										isUgsAdmin
								)
								.map((nextView) => (
									<DesktopChromeTooltip
										key={nextView}
										content={viewTooltip(nextView)}
										placement="bottom"
										offsetExtra={6}
									>
										<DesktopAppButton
											type="button"
											role="tab"
											aria-selected={view === nextView}
											variant={view === nextView ? 'accent' : 'ghost'}
											className="min-h-10 px-3"
											onClick={() => setView(nextView)}
										>
											{viewLabel(nextView)}
										</DesktopAppButton>
									</DesktopChromeTooltip>
								))}
							{isUgsAdmin && (view === 'builder' || activeWorkflowId) ? (
								<DesktopChromeTooltip
									content={viewTooltip('builder')}
									placement="bottom"
									offsetExtra={6}
								>
									<DesktopAppButton
										type="button"
										role="tab"
										aria-selected={view === 'builder'}
										variant={view === 'builder' ? 'accent' : 'ghost'}
										className="min-h-10 px-3"
										onClick={() => setView('builder')}
									>
										{viewLabel('builder')}
									</DesktopAppButton>
								</DesktopChromeTooltip>
							) : null}
						</div>
					</DesktopAppToolbar>
				</div>
				<div className="min-h-0 flex-1 overflow-auto">
					<UgsHubShellThemeProvider value={shellTheme}>
						<Suspense fallback={<UGSDesktopSuspenseFallback />}>
							{view === 'hub' && <UGSHub onNavigate={handleInAppNavigate} />}
							{view === 'dashboard' && (
								<UGSDashboardLazy onNavigate={handleInAppNavigate} />
							)}
							{view === 'analytics' && (
								<UGSAnalyticsLazy onNavigate={handleInAppNavigate} />
							)}
							{view === 'admin' && isUgsAdmin && <UGSAdminV2PanelLazy />}
							{view === 'builder' && isUgsAdmin && (
								<UGSWorkflowBuilderPageLazy
									workflowId={activeWorkflowId}
									onNavigate={handleInAppNavigate}
									compactChrome
								/>
							)}
						</Suspense>
					</UgsHubShellThemeProvider>
				</div>
			</section>
		</DesktopAppContentWrapper>
	);
};

export default UGSDesktopContainer;
