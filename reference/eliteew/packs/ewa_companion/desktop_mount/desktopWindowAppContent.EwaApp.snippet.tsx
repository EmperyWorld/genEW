// SNIPPET ONLY — extracted from EliteEW desktopWindowAppContent.tsx
// Source: pages/Desktop/components/desktopWindowAppContent.tsx
// Not a compilable module; imports intentionally omitted/invalid.
//
// --- lazy import (lines 106-110) ---
const EwaAppLazy = lazy(() =>
	import('../../../features/ewa/EwaDesktopApp').then((m) => ({
		default: m.EwaDesktopApp,
	}))
);

// --- mount switch case (lines 769-810) ---
		case 'MarketingCabinet':
			return React.createElement(MarketingCabinetPageLazy, {
				desktopConsumedMarketingDeepLink:
					windowState?.initialPayload?.marketingCabinetDeepLink ?? undefined,
			});
		case 'EwaApp':
			return (
				<DesktopAppContentWrapper
					appComponent="EwaApp"
					windowStyle={windowCallbacks?.visualStyle}
					mode="passthrough"
					className="h-full min-h-0 overflow-hidden"
				>
					<EwaAppLazy
						initialPayload={windowState?.initialPayload}
						onWindowPayloadChange={windowCallbacks?.onUpdatePayload}
						openedFromSessionRestore={
							windowState?.openedFromSessionRestore === true
						}
					/>
				</DesktopAppContentWrapper>
			);
		case 'CustomerCabinet':
			return CustomerCabinetPageLazy;
		case 'UserSiteStudio':
			return (
				<UserSiteStudioDesktopMount
					initialPayload={windowState?.initialPayload}
				/>
			);
		case 'SiteManagerOps':
			return (
				<DesktopAppContentWrapper
					appComponent="SiteManagerOps"
					windowStyle={windowCallbacks?.visualStyle}
					mode="passthrough"
					className="h-full min-h-0 overflow-hidden"
				>
					<SiteManagerOpsPanelLazy />
				</DesktopAppContentWrapper>
			);
		case 'LocalServiceIframeApp':
