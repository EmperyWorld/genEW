// SNIPPET ONLY — extracted from EliteEW desktopWindowAppContent.tsx
// Source: pages/Desktop/components/desktopWindowAppContent.tsx
// Not a compilable module; imports intentionally omitted/invalid.
//
// --- lazy import (lines 114-114) ---
const UserSiteStudioAppLazy = lazy(() => import('../apps/UserSiteStudio'));

// --- UserSiteStudioDesktopMount (lines 364-393) ---
const UserSiteStudioDesktopMount: React.FC<{
	initialPayload?: import('../types/desktop.types').WindowInitialPayload;
}> = memo(({ initialPayload }) => {
	const professionalWorldsDraftKey =
		typeof initialPayload?.professionalWorldsCrossAppDraftKey === 'string'
			? initialPayload.professionalWorldsCrossAppDraftKey.trim() || undefined
			: undefined;
	const [professionalWorldsDraft, setProfessionalWorldsDraft] =
		React.useState<ProfessionalWorldsSiteStudioDraft | null>(null);
	React.useEffect(() => {
		if (!professionalWorldsDraftKey) {
			setProfessionalWorldsDraft(null);
			return;
		}
		const capsule = consumeProfessionalWorldsCrossAppDraft(
			professionalWorldsDraftKey
		);
		const draft = professionalWorldsDraftToSiteStudio(capsule);
		setProfessionalWorldsDraft(draft);
		if (draft?.crossAppLinkId) {
			reportProfessionalCrossAppDraftLifecycle(draft.crossAppLinkId, 'opened');
		}
	}, [professionalWorldsDraftKey]);
	return (
		<UserSiteStudioAppLazy
			initialProfessionalWorldsDraft={professionalWorldsDraft}
		/>
	);
});
UserSiteStudioDesktopMount.displayName = 'UserSiteStudioDesktopMount';

// --- mount switch case (lines 793-798) ---
		case 'UserSiteStudio':
			return (
				<UserSiteStudioDesktopMount
					initialPayload={windowState?.initialPayload}
				/>
			);
