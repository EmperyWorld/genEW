/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Main entry for the EliteEW Безраздельный мир shell: storage, providers, lazy content, and loading fallback.
 *
 * Invariants:
 * - Single-tab gate lives above this module; this shell mounts only in the leader tab.
 * - Loading fallback must not clear or replace persisted desktop layout data.
 * - GAFChatProvider + Content mount only after shell-bootstrap hydrate settles (cold GET race).
 *
 * Related:
 * - `DesktopWorkspaceContent.tsx`
 * - `services/desktopShellBootstrap.ts`
 * - `components/SingleTabElectionGate.tsx`
 */

import * as React from 'react';
import { Suspense, lazy, useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { markDesktopShellReady } from './utils/desktopShellReady';
import { LazyMotion } from 'framer-motion';

const loadDomMaxFeatures = () =>
	import('framer-motion').then((mod) => mod.domMax);
import { ErrorBoundary } from '../../components/ui/primitives/ErrorBoundary';
import { DESKTOP_DESIGN_TOKENS } from './constants';
import { DesktopStateProvider } from './context/DesktopStateContext';
import { GAFChatProvider } from './context/GAFChatProvider';
import { MusicLibraryProvider } from './context/MusicLibraryContext';
import { MusicPlaybackDomainProvider } from './context/MusicPlaybackDomainContext';
import { NowPlayingProvider } from './context/NowPlayingContext';
import { useDesktopStorage } from './hooks/useDesktopStorage';
import { DesktopBackgroundRuntimeProvider } from './runtime/DesktopBackgroundRuntimeContext';
import { DesktopSocketNotificationsBridge } from './DesktopSocketNotificationsBridge';
import { DesktopLoadingSkeleton } from './components/DesktopLoadingSkeleton';
import { markDesktopLaserPointerRoot } from './utils/desktopLaserPointerEnvironment';
import { ensureDesktopShellBootstrap } from './services/desktopShellBootstrap';

const DesktopWorkspaceContent = lazy(() => import('./DesktopWorkspaceContent'));

const WORKSPACE_LOADING_BG =
	'radial-gradient(circle at 12% 0%, rgba(255,255,255,0.08), transparent 24%), radial-gradient(circle at 20% 0%, rgb(var(--desktop-accent-rgb) / 0.14), transparent 34%), rgb(var(--desktop-bg-primary-rgb))';

function DesktopWorkspaceSuspenseFallback(): React.ReactElement {
	const { t } = useTranslation('desktopUi');
	const loadingLabel = t('workspace.openingDesktop');
	return (
		<div
			className="desktop-workspace-shell relative min-h-0 h-screen w-full overflow-hidden overscroll-contain dark"
			style={{
				...DESKTOP_DESIGN_TOKENS,
				background: WORKSPACE_LOADING_BG,
			}}
			role="status"
			aria-busy="true"
			aria-label={loadingLabel}
		>
			<DesktopLoadingSkeleton loadingLabel={loadingLabel} />
		</div>
	);
}

const DesktopWorkspace: React.FC = () => {
	const storage = useDesktopStorage();
	const [shellBootstrapReady, setShellBootstrapReady] = useState(false);

	useLayoutEffect(() => {
		markDesktopLaserPointerRoot();
	}, []);

	useEffect(() => {
		let cancelled = false;
		void ensureDesktopShellBootstrap({ forceDesktop: true }).finally(() => {
			if (!cancelled) {
				setShellBootstrapReady(true);
			}
		});
		return () => {
			cancelled = true;
		};
	}, []);

	useLayoutEffect(() => {
		if (storage.config && !storage.isLoading && shellBootstrapReady) {
			requestAnimationFrame(() => {
				markDesktopShellReady();
			});
		}
	}, [storage.config, storage.isLoading, shellBootstrapReady]);

	return (
		<ErrorBoundary>
			<DesktopStateProvider>
				<NowPlayingProvider>
					<MusicPlaybackDomainProvider>
						<MusicLibraryProvider>
							<DesktopBackgroundRuntimeProvider>
								{shellBootstrapReady ? (
									<GAFChatProvider>
										<DesktopSocketNotificationsBridge />
										<Suspense fallback={<DesktopWorkspaceSuspenseFallback />}>
											<LazyMotion features={loadDomMaxFeatures} strict>
												<DesktopWorkspaceContent storage={storage} />
											</LazyMotion>
										</Suspense>
									</GAFChatProvider>
								) : (
									<DesktopWorkspaceSuspenseFallback />
								)}
							</DesktopBackgroundRuntimeProvider>
						</MusicLibraryProvider>
					</MusicPlaybackDomainProvider>
				</NowPlayingProvider>
			</DesktopStateProvider>
		</ErrorBoundary>
	);
};

export default DesktopWorkspace;
