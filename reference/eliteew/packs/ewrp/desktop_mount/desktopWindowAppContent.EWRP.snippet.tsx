/**
 * Snippet extracted from EliteEW desktopWindowAppContent.tsx
 * Source: pages/Desktop/components/desktopWindowAppContent.tsx
 * Reference only — adapt into apps/empery_desktop mounts; never runtime-import.
 */

const EWRPGeneratorLazy = lazy(() =>
	import('../../../components/EWRP/EWRPGenerator').then((m) => ({
		default: m.default,
	}))
);

const EwrpDesktopMount: React.FC<{
	onUpdatePayload?: DesktopWindowAppCallbacks['onUpdatePayload'];
	initialPayload?: import('../types/desktop.types').WindowInitialPayload;
}> = memo(({ onUpdatePayload, initialPayload }) => {
	const crossAppDraftKey =
		typeof initialPayload?.professionalWorldsCrossAppDraftKey === 'string'
			? initialPayload.professionalWorldsCrossAppDraftKey.trim() || undefined
			: undefined;
	const ewrpJobId =
		typeof initialPayload?.ewrpJobId === 'string'
			? initialPayload.ewrpJobId.trim() || undefined
			: undefined;
	return (
		<EWRPGeneratorLazy
			onWindowPayloadChange={onUpdatePayload}
			professionalWorldsCrossAppDraftKey={crossAppDraftKey}
			ewrpJobId={ewrpJobId}
		/>
	);
});
EwrpDesktopMount.displayName = 'EwrpDesktopMount';


		case 'Presentations':
		case 'PresentationsArchive':
		case 'EWRP':
			return (
				<EwrpDesktopMount
					onUpdatePayload={windowCallbacks?.onUpdatePayload}
					initialPayload={windowState?.initialPayload}
				/>
			);
		case 'StudioGU':
			return StudioGUPageLazy;
		case 'MusicGenerator':
