/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Lazy registry for Desktop window app content resolved by `appComponent`.
 *
 * Invariants:
 * - Heavy apps remain lazy-loaded and are mounted only when their window content is requested.
 * - Deep-link payload mapping stays local to the app mount adapter.
 * - EWRP/Presentations mounts forward `onUpdatePayload` into the generator for companion **shell_context** listings.
 * - Professional Worlds cross-app draft keys are consumed by destination adapters, never published/sent automatically.
 * - UGS/UGSHub stay behind ``React.lazy`` so idle #desktop does not sync-pull UGSDesktopContainer.
 *
 * Related:
 * - src/pages/Desktop/utils/desktopAppRegistry.ts
 */

import * as React from 'react';
import { lazy, memo, useMemo } from 'react';
import i18n from '@/i18n/config';
import type { DesktopWindowStyle } from '@/types/profile';
import type { DesktopAppPropsContextValue } from '../context/DesktopAppPropsContext';
import type { WindowState } from '../types/desktop.types';
import { resolveDocEditorPayloadTarget } from '../utils/desktopOpenPayloads';
import { resolveDesktopWindowAppComponent } from '../utils/desktopWindowResolveApp';
import {
	DesktopAppContentWrapper,
	DesktopAppEmptyState,
} from './DesktopAppChrome';
import { DesktopAppMaintenance } from './DesktopAppMaintenance';
import { normalizeContentManagerInitialFilterPayload } from '../utils/contentManagerFilterShortcut';
import { requestOpenDesktopApp } from '../utils/desktopDeepLink';
import {
	consumeProfessionalWorldsCrossAppDraft,
	professionalWorldsDraftToEwDesk,
	professionalWorldsDraftToGaf,
	professionalWorldsDraftToSiteStudio,
	type ProfessionalWorldsEwDeskSuggestion,
	type ProfessionalWorldsGafDraft,
	type ProfessionalWorldsSiteStudioDraft,
} from '@/features/professional-worlds/desktop/professionalWorldsCrossAppDraft';
import { reportProfessionalCrossAppDraftLifecycle } from '@/features/professional-worlds/desktop/reportProfessionalCrossAppDraftLifecycle';

const ClipboardManagerLazy = lazy(() => import('./ClipboardManager'));

const UGSDesktopContainerLazy = lazy(() =>
	import('./UGSDesktopContainer').then((m) => ({
		default: m.UGSDesktopContainer,
	}))
);

const ContentManagerPro = lazy(
	() => import('../../ContentManager/ContentManagerPro')
);
const StudioGUPageLazy = lazy(() => import('../../StudioGU/StudioGUPage'));
const UltimateDocEditor = lazy(() =>
	import('../../../components/UltimateDocEditor/UltimateDocEditor').then(
		(m) => ({ default: m.UltimateDocEditor })
	)
);
const DocEditorV2Lazy = lazy(() =>
	import('../../../features/documentEditorV2/DocEditorV2').then((m) => ({
		default: m.DocEditorV2,
	}))
);
const GAFChatAppLazy = lazy(() =>
	import('./GAFChat/GAFChatApp').then((m) => ({ default: m.default }))
);
const VideoCallAppLazy = lazy(() =>
	import('./VideoCall/VideoCallApp').then((m) => ({ default: m.default }))
);
const DesktopAiChatAppLazy = lazy(() =>
	import('../../../features/desktop-ai-chat/DesktopAiChatApp').then((m) => ({
		default: m.DesktopAiChatApp,
	}))
);
const SocialHubAppLazy = lazy(
	() => import('../../../features/friends/components/SocialHubApp')
);
const EWRPGeneratorLazy = lazy(() =>
	import('../../../components/EWRP/EWRPGenerator').then((m) => ({
		default: m.default,
	}))
);
const AppStoreWindowContentLazy = lazy(() =>
	import('./AppStoreWindowContent').then((m) => ({
		default: m.AppStoreWindowContent,
	}))
);
const DesktopShellSettingsWindowContentLazy = lazy(() =>
	import('./DesktopShellSettingsWindowContent').then((m) => ({
		default: m.DesktopShellSettingsWindowContent,
	}))
);
const UnifiedAdminPageLazy = lazy(() =>
	import('../../Admin/UnifiedAdminPage').then((m) => ({
		default: m.UnifiedAdminPage,
	}))
);
const MarketingCabinetPageLazy = lazy(
	() => import('../../MarketingCabinet/MarketingCabinetPage')
);
const EwaAppLazy = lazy(() =>
	import('../../../features/ewa/EwaDesktopApp').then((m) => ({
		default: m.EwaDesktopApp,
	}))
);
const CustomerCabinetPageLazy = lazy(
	() => import('../../CustomerCabinet/CustomerCabinetPage')
);
const UserSiteStudioAppLazy = lazy(() => import('../apps/UserSiteStudio'));
const SiteManagerOpsPanelLazy = lazy(
	() =>
		import(
			'../../../features/site-studio/desktop/components/SiteManagerOpsPanel'
		)
);
const LocalServiceIframeAppLazy = lazy(
	() => import('../apps/LocalServiceIframeApp')
);
const ProjectAboutAppLazy = lazy(() => import('../apps/ProjectAboutApp'));
const EmperyNexusChronicleAppLazy = lazy(
	() => import('../apps/EmperyNexusChronicleApp')
);
const KirsPageLazy = lazy(() => import('../../Kirs/KirsPage'));
const KirsClientSitePageLazy = lazy(
	() => import('../../Kirs/KirsClientSitePage')
);
const MusicForgeAppLazy = lazy(() =>
	import('../../MusicForge/MusicForgeApp').then((m) => ({
		default: m.MusicForgeApp,
	}))
);
const PoemmaAppLazy = lazy(() =>
	import('../../../features/poemma/PoemmaApp').then((m) => ({
		default: m.PoemmaApp,
	}))
);
const ImageStudioPageLazy = lazy(() =>
	import('../../ImageStudio/ImageStudioPage').then((m) => ({
		default: m.ImageStudioPage,
	}))
);
const VideoStudioPageLazy = lazy(() =>
	import('../../VideoStudio/VideoStudioPage').then((m) => ({
		default: m.VideoStudioPage,
	}))
);
const MusicPlayerPageLazy = lazy(() =>
	import('../../MusicPlayer/MusicPlayerPage').then((m) => ({
		default: m.MusicPlayerPage,
	}))
);
const DesktopWidgetShelfAppLazy = lazy(() =>
	import('./DesktopWidgetShelfApp').then((m) => ({ default: m.default }))
);
const DesktopDashboardFavoritesAppLazy = lazy(() =>
	import('./DesktopDashboardFavoritesApp').then((m) => ({ default: m.default }))
);
const NotificationsDesktopAppLazy = lazy(() =>
	import('./NotificationsDesktopApp').then((m) => ({
		default: m.default,
	}))
);
const EWDeskAppLazy = lazy(() => import('./EWDeskApp'));
const FeedbackHubAppLazy = lazy(() => import('./FeedbackHubApp'));
const SurveyHubAppLazy = lazy(() => import('../apps/SurveyHub/SurveyHubApp'));
const AssistantAppLazy = lazy(() => import('./AssistantApp'));
const ProfessionalWorldsAppLazy = lazy(
	() => import('../apps/ProfessionalWorlds/ProfessionalWorldsApp')
);

const ContentManagerDesktopMount: React.FC<{
	initialPayload?: import('../types/desktop.types').WindowInitialPayload;
	onUpdatePayload?: DesktopWindowAppCallbacks['onUpdatePayload'];
}> = memo(({ initialPayload, onUpdatePayload }) => {
	const initialCabinetScope = useMemo(() => {
		const projectId =
			typeof initialPayload?.contentManagerProjectId === 'string'
				? initialPayload.contentManagerProjectId.trim()
				: '';
		const companyId =
			typeof initialPayload?.contentManagerCompanyId === 'string'
				? initialPayload.contentManagerCompanyId.trim()
				: '';
		const projectName =
			typeof initialPayload?.contentManagerProjectName === 'string'
				? initialPayload.contentManagerProjectName.trim()
				: '';
		const cabinetView = initialPayload?.contentManagerCabinetView === true;
		if (!projectId || !companyId) return undefined;
		return {
			projectId,
			companyId,
			cabinetView,
			...(projectName ? { projectName } : {}),
		};
	}, [
		initialPayload?.contentManagerCabinetView,
		initialPayload?.contentManagerCompanyId,
		initialPayload?.contentManagerProjectId,
		initialPayload?.contentManagerProjectName,
	]);

	const initialDesktopFolderItemId = useMemo(() => {
		const v = initialPayload?.contentManagerFolderItemId;
		if (typeof v !== 'string') return null;
		const t = v.trim();
		return t !== '' ? t : null;
	}, [initialPayload?.contentManagerFolderItemId]);

	const initialFilterSnapshot = useMemo(
		() =>
			normalizeContentManagerInitialFilterPayload(
				initialPayload?.contentManagerInitialFilter
			) ?? null,
		[initialPayload?.contentManagerInitialFilter]
	);

	const initialFocusUnifiedContentId = useMemo(() => {
		const v = initialPayload?.contentManagerFocusUnifiedContentId;
		if (typeof v !== 'string') return null;
		const t = v.trim();
		return t !== '' ? t : null;
	}, [initialPayload?.contentManagerFocusUnifiedContentId]);

	const initialOpenAssignProject =
		initialPayload?.contentManagerOpenAssignProject === true;

	return (
		<ContentManagerPro
			embedded
			initialCabinetScope={initialCabinetScope}
			initialDesktopFolderItemId={initialDesktopFolderItemId}
			initialFilterSnapshot={initialFilterSnapshot}
			initialFocusUnifiedContentId={initialFocusUnifiedContentId}
			initialOpenAssignProject={initialOpenAssignProject}
			onWindowPayloadChange={onUpdatePayload}
		/>
	);
});
ContentManagerDesktopMount.displayName = 'ContentManagerDesktopMount';

const GAFChatAppDesktopMount: React.FC<{
	initialPayload?: import('../types/desktop.types').WindowInitialPayload;
}> = memo(({ initialPayload }) => {
	const professionalWorldsDraftKey =
		typeof initialPayload?.professionalWorldsCrossAppDraftKey === 'string'
			? initialPayload.professionalWorldsCrossAppDraftKey.trim() || undefined
			: undefined;
	const [professionalWorldsDraft, setProfessionalWorldsDraft] =
		React.useState<ProfessionalWorldsGafDraft | null>(null);
	React.useEffect(() => {
		if (!professionalWorldsDraftKey) {
			setProfessionalWorldsDraft(null);
			return;
		}
		const capsule = consumeProfessionalWorldsCrossAppDraft(
			professionalWorldsDraftKey
		);
		const draft = professionalWorldsDraftToGaf(capsule);
		setProfessionalWorldsDraft(draft);
		if (draft?.crossAppLinkId) {
			reportProfessionalCrossAppDraftLifecycle(draft.crossAppLinkId, 'opened');
		}
	}, [professionalWorldsDraftKey]);
	const initialTargetUsername =
		typeof initialPayload?.targetUsername === 'string'
			? initialPayload.targetUsername.trim() || undefined
			: undefined;
	const initialTargetChatId =
		typeof initialPayload?.targetChatId === 'string'
			? initialPayload.targetChatId.trim() || undefined
			: undefined;
	const initialComposerAttachment = useMemo(() => {
		const cid =
			initialPayload?.gafComposerAttachmentContentId?.trim() ||
			professionalWorldsDraft?.attachment?.contentId;
		if (!cid) return undefined;
		const draftAttachment = professionalWorldsDraft?.attachment;
		return {
			contentId: cid,
			fileName:
				typeof initialPayload?.gafComposerAttachmentFileName === 'string' &&
				initialPayload.gafComposerAttachmentFileName.trim()
					? initialPayload.gafComposerAttachmentFileName.trim()
					: (draftAttachment?.fileName ?? 'file'),
			size:
				typeof initialPayload?.gafComposerAttachmentSize === 'number'
					? initialPayload.gafComposerAttachmentSize
					: (draftAttachment?.size ?? null),
			mimeType:
				initialPayload?.gafComposerAttachmentMimeType ??
				draftAttachment?.mimeType ??
				null,
		};
	}, [
		initialPayload?.gafComposerAttachmentContentId,
		initialPayload?.gafComposerAttachmentFileName,
		initialPayload?.gafComposerAttachmentMimeType,
		initialPayload?.gafComposerAttachmentSize,
		professionalWorldsDraft?.attachment,
	]);
	const explicitComposerSeed =
		typeof initialPayload?.gafComposerSeed === 'string'
			? initialPayload.gafComposerSeed.trim() || undefined
			: undefined;
	const initialComposerSeed = [
		professionalWorldsDraft?.seed,
		explicitComposerSeed,
	]
		.filter(Boolean)
		.join('\n\n');
	return (
		<GAFChatAppLazy
			initialTargetUsername={initialTargetUsername}
			initialTargetChatId={initialTargetChatId}
			initialComposerAttachment={initialComposerAttachment}
			initialComposerSeed={initialComposerSeed || undefined}
			professionalWorldsCrossAppLinkId={professionalWorldsDraft?.crossAppLinkId}
		/>
	);
});
GAFChatAppDesktopMount.displayName = 'GAFChatAppDesktopMount';

const EWDeskDesktopMount: React.FC<{
	initialPayload?: import('../types/desktop.types').WindowInitialPayload;
}> = memo(({ initialPayload }) => {
	const professionalWorldsDraftKey =
		typeof initialPayload?.professionalWorldsCrossAppDraftKey === 'string'
			? initialPayload.professionalWorldsCrossAppDraftKey.trim() || undefined
			: undefined;
	const [professionalWorldsSuggestion, setProfessionalWorldsSuggestion] =
		React.useState<ProfessionalWorldsEwDeskSuggestion | null>(null);
	React.useEffect(() => {
		if (!professionalWorldsDraftKey) {
			setProfessionalWorldsSuggestion(null);
			return;
		}
		const capsule = consumeProfessionalWorldsCrossAppDraft(
			professionalWorldsDraftKey
		);
		const suggestion = professionalWorldsDraftToEwDesk(capsule);
		setProfessionalWorldsSuggestion(suggestion);
		if (suggestion?.crossAppLinkId) {
			reportProfessionalCrossAppDraftLifecycle(
				suggestion.crossAppLinkId,
				'opened'
			);
		}
	}, [professionalWorldsDraftKey]);
	return (
		<EWDeskAppLazy
			initialNewsId={initialPayload?.ewDeskNewsId ?? undefined}
			initialProfessionalWorldsDraft={professionalWorldsSuggestion}
		/>
	);
});
EWDeskDesktopMount.displayName = 'EWDeskDesktopMount';

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

const VideoCallAppDesktopMount: React.FC<{
	initialPayload?: import('../types/desktop.types').WindowInitialPayload;
}> = memo(({ initialPayload }) => {
	const callId =
		typeof initialPayload?.videoCallId === 'string'
			? initialPayload.videoCallId.trim() || undefined
			: undefined;
	const initialJoinUrl =
		typeof initialPayload?.videoCallJoinUrl === 'string'
			? initialPayload.videoCallJoinUrl.trim() || undefined
			: undefined;
	const title =
		typeof initialPayload?.videoCallTitle === 'string'
			? initialPayload.videoCallTitle.trim() || undefined
			: undefined;
	return (
		<VideoCallAppLazy
			callId={callId}
			initialJoinUrl={initialJoinUrl}
			title={title}
		/>
	);
});
VideoCallAppDesktopMount.displayName = 'VideoCallAppDesktopMount';

const DesktopAiChatAppDesktopMount: React.FC<{
	initialPayload?: import('../types/desktop.types').WindowInitialPayload;
}> = memo(({ initialPayload }) => {
	const initialChatId =
		typeof initialPayload?.desktopAiChatId === 'string'
			? initialPayload.desktopAiChatId.trim() || undefined
			: undefined;
	const initialAttachUnifiedContentId =
		typeof initialPayload?.desktopAiAttachContentId === 'string'
			? initialPayload.desktopAiAttachContentId.trim() || undefined
			: undefined;
	const initialAttachSourceLabel =
		typeof initialPayload?.desktopAiAttachSourceLabel === 'string'
			? initialPayload.desktopAiAttachSourceLabel
			: null;
	const initialComposerSeed =
		typeof initialPayload?.desktopAiComposerSeed === 'string'
			? initialPayload.desktopAiComposerSeed.trim() || undefined
			: undefined;
	return (
		<DesktopAiChatAppLazy
			initialChatId={initialChatId}
			initialAttachUnifiedContentId={initialAttachUnifiedContentId}
			initialAttachSourceLabel={initialAttachSourceLabel}
			initialComposerSeed={initialComposerSeed}
		/>
	);
});
DesktopAiChatAppDesktopMount.displayName = 'DesktopAiChatAppDesktopMount';

export type DesktopWindowAppCallbacks = {
	onClose?: () => void;
	onMaximize?: () => void;
	onUpdatePayload?: (
		payload: import('../types/desktop.types').WindowInitialPayload
	) => void;
	visualStyle?: DesktopWindowStyle;
};

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

export function getDesktopWindowAppContent(
	componentName?: string,
	appProps?: DesktopAppPropsContextValue | null,
	windowState?: WindowState,
	windowCallbacks?: DesktopWindowAppCallbacks
): React.ReactElement | React.ComponentType | null {
	const resolved = resolveDesktopWindowAppComponent(componentName, windowState);
	if (!resolved) {
		return null;
	}
	switch (resolved) {
		case 'ContentManagerPro':
			return (
				<ContentManagerDesktopMount
					initialPayload={windowState?.initialPayload}
					onUpdatePayload={windowCallbacks?.onUpdatePayload}
				/>
			);
		case 'UGS': {
			const initialView = windowState?.initialPayload?.ugsView ?? 'dashboard';
			const initialWorkflowId =
				windowState?.initialPayload?.ugsWorkflowId ?? null;
			return appProps?.onNavigate
				? React.createElement(UGSDesktopContainerLazy, {
						onNavigate: appProps.onNavigate,
						initialView,
						initialWorkflowId,
					})
				: React.createElement(UGSDesktopContainerLazy, {
						initialView,
						initialWorkflowId,
					});
		}
		case 'UGSHubApp': {
			const initialView = windowState?.initialPayload?.ugsView ?? 'hub';
			const initialWorkflowId =
				windowState?.initialPayload?.ugsWorkflowId ?? null;
			return appProps?.onNavigate
				? React.createElement(UGSDesktopContainerLazy, {
						onNavigate: appProps.onNavigate,
						initialView,
						initialWorkflowId,
					})
				: React.createElement(UGSDesktopContainerLazy, {
						initialView,
						initialWorkflowId,
					});
		}
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
		case 'MusicEvolutionApp':
			return React.createElement(MusicForgeAppLazy, {
				embedded: true,
				initialRunId:
					typeof windowState?.initialPayload?.musicForgeRunId === 'string'
						? windowState.initialPayload.musicForgeRunId
						: null,
			});
		case 'MusicForgeApp':
			return React.createElement(MusicForgeAppLazy, {
				embedded: true,
				initialRunId:
					typeof windowState?.initialPayload?.musicForgeRunId === 'string'
						? windowState.initialPayload.musicForgeRunId
						: null,
			});
		case 'PoemmaApp':
			return PoemmaAppLazy;
		case 'ProjectAboutApp':
			return (
				<DesktopAppContentWrapper
					appComponent="ProjectAboutApp"
					windowStyle={windowCallbacks?.visualStyle}
					mode="passthrough"
					className="h-full min-h-0 overflow-hidden"
				>
					<ProjectAboutAppLazy />
				</DesktopAppContentWrapper>
			);
		case 'EmperyNexusChronicleApp':
			return (
				<DesktopAppContentWrapper
					appComponent="EmperyNexusChronicleApp"
					windowStyle={windowCallbacks?.visualStyle}
					mode="passthrough"
					className="h-full min-h-0 overflow-hidden"
				>
					<EmperyNexusChronicleAppLazy />
				</DesktopAppContentWrapper>
			);
		case 'ImageStudio':
			return React.createElement(ImageStudioPageLazy, {
				embedded: true,
				onWindowPayloadChange: windowCallbacks?.onUpdatePayload,
			});
		case 'VideoStudio':
			return React.createElement(VideoStudioPageLazy, {
				embedded: true,
				onWindowPayloadChange: windowCallbacks?.onUpdatePayload,
			});
		case 'MusicPlayer':
			return React.createElement(MusicPlayerPageLazy, {
				embedded: true,
				onWindowPayloadChange: windowCallbacks?.onUpdatePayload,
			});
		case 'NotificationsApp':
			return React.createElement(NotificationsDesktopAppLazy, {
				onRequestClose: windowCallbacks?.onClose,
			});
		case 'DesktopWidgetShelfApp':
			return (
				<DesktopWidgetShelfAppLazy
					initialTab={
						windowState?.initialPayload?.widgetShelfTab === 'todos'
							? 'todos'
							: 'notes'
					}
				/>
			);
		case 'DesktopDashboardFavoritesApp':
			return <DesktopDashboardFavoritesAppLazy />;
		case 'EWDeskApp':
			return (
				<EWDeskDesktopMount initialPayload={windowState?.initialPayload} />
			);
		case 'FeedbackHubApp':
			return React.createElement(FeedbackHubAppLazy, {
				initialQuickMode: windowState?.initialPayload?.feedbackQuickMode,
				initialDraftBody: windowState?.initialPayload?.feedbackDraftBody,
			});
		case 'SurveyHubApp':
			return React.createElement(SurveyHubAppLazy, {
				initialSurveyId: windowState?.initialPayload?.surveyId,
			});
		case 'AssistantApp':
			return AssistantAppLazy;
		case 'ProfessionalWorlds':
			return ProfessionalWorldsAppLazy;
		case 'DocEditor': {
			const docEditorTarget = resolveDocEditorPayloadTarget(
				windowState?.initialPayload
			);
			const docEditorDocumentId =
				docEditorTarget?.targetType === 'docEditor'
					? docEditorTarget.id
					: windowState?.initialPayload?.documentId;
			const docEditorUnifiedContentId =
				docEditorTarget?.targetType === 'unifiedContent'
					? docEditorTarget.id
					: windowState?.initialPayload?.unifiedContentId;
			const docEditorRequestId =
				docEditorTarget?.requestId ??
				windowState?.initialPayload?.docOpenRequestId;
			return (
				<UltimateDocEditor
					mode="edit"
					embedded
					documentId={docEditorDocumentId}
					documentIds={windowState?.initialPayload?.documentIds}
					activeDocumentId={windowState?.initialPayload?.activeDocumentId}
					tabTitles={windowState?.initialPayload?.tabTitles}
					unifiedContentId={docEditorUnifiedContentId}
					docEditorTabs={windowState?.initialPayload?.docEditorTabs}
					activeDocEditorTab={windowState?.initialPayload?.activeDocEditorTab}
					docOpenRequestId={docEditorRequestId}
					openCollabAfterLoad={
						windowState?.initialPayload?.openCollabPanel === true
					}
					autoJoinCollaborationAfterLoad={
						windowState?.initialPayload?.autoJoinCollaboration === true
					}
					onClose={windowCallbacks?.onClose}
					onPayloadChange={windowCallbacks?.onUpdatePayload}
				/>
			);
		}
		case 'DocEditorV2':
			return (
				<DocEditorV2Lazy
					initialDocumentId={windowState?.initialPayload?.documentId}
					initialUnifiedContentId={
						windowState?.initialPayload?.unifiedContentId
					}
					initialTitle={
						typeof windowState?.initialPayload?.docEditorTitle === 'string'
							? windowState.initialPayload.docEditorTitle
							: windowState?.initialPayload?.activeDocumentId
								? windowState.initialPayload.tabTitles?.[
										windowState.initialPayload.activeDocumentId
									]
								: undefined
					}
					onFallbackToLegacy={
						windowState?.initialPayload?.documentId ||
						windowState?.initialPayload?.unifiedContentId
							? () => {
									requestOpenDesktopApp({
										appComponent: 'DocEditor',
										forceNewWindow: true,
										...(windowState?.initialPayload?.documentId
											? {
													documentId: windowState.initialPayload.documentId,
												}
											: {}),
										...(windowState?.initialPayload?.unifiedContentId
											? {
													unifiedContentId:
														windowState.initialPayload.unifiedContentId,
												}
											: {}),
									});
								}
							: undefined
					}
				/>
			);
		case 'ClipboardManager':
			return <ClipboardManagerLazy embedded />;
		case 'GAFChatApp':
			return (
				<GAFChatAppDesktopMount initialPayload={windowState?.initialPayload} />
			);
		case 'VideoCallApp':
			return (
				<VideoCallAppDesktopMount
					initialPayload={windowState?.initialPayload}
				/>
			);
		case 'DesktopAiChatApp':
			return (
				<DesktopAiChatAppDesktopMount
					initialPayload={windowState?.initialPayload}
				/>
			);
		case 'SocialHubApp':
		case 'FriendsApp':
		case 'UserProfile':
			return appProps
				? React.createElement(SocialHubAppLazy, {
						onNavigate: appProps.onNavigate,
						onUserUpdate: appProps.onUserUpdate,
						initialPayload: windowState?.initialPayload,
					})
				: SocialHubAppLazy;
		case 'AppStore':
			return AppStoreWindowContentLazy;
		case 'DesktopShellSettings':
			return (
				<DesktopAppContentWrapper
					appComponent="DesktopShellSettings"
					windowStyle={windowCallbacks?.visualStyle}
					mode="passthrough"
					className="h-full min-h-0 overflow-hidden"
				>
					<DesktopShellSettingsWindowContentLazy
						onRequestClose={windowCallbacks?.onClose}
					/>
				</DesktopAppContentWrapper>
			);
		case 'DesktopAppMaintenance':
			return (
				<DesktopAppMaintenance initialPayload={windowState?.initialPayload} />
			);
		case 'UnifiedAdminApp':
			return (
				<DesktopAppContentWrapper
					appComponent="UnifiedAdminApp"
					windowStyle={windowCallbacks?.visualStyle}
					mode="passthrough"
					className="h-full min-h-0 overflow-hidden"
				>
					<UnifiedAdminPageLazy
						embedded
						onNavigate={appProps?.onNavigate}
						onRequestClose={windowCallbacks?.onClose}
					/>
				</DesktopAppContentWrapper>
			);
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
			return (
				<DesktopAppContentWrapper
					appComponent="LocalServiceIframeApp"
					windowStyle={windowCallbacks?.visualStyle}
					mode="passthrough"
					className="h-full min-h-0 overflow-hidden"
				>
					<LocalServiceIframeAppLazy />
				</DesktopAppContentWrapper>
			);
		case 'KirsCuration':
			return KirsPageLazy;
		case 'KirsClientSite':
			return React.createElement(KirsClientSitePageLazy);
		default:
			return (
				<DesktopAppContentWrapper
					appComponent={resolved}
					windowStyle={windowCallbacks?.visualStyle}
				>
					<DesktopAppEmptyState
						className="h-full"
						title={i18n.t('windowChrome.appNotFound', { ns: 'desktopUi' })}
						description={i18n.t('windowChrome.appNotRegisteredDescription', {
							ns: 'desktopUi',
						})}
					/>
				</DesktopAppContentWrapper>
			);
	}
}
