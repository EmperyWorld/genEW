/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop Site Studio workspace for creating and operating user sites, including user-friendly setup, draft review,
 * launch controls, tab-level scrolling, and Professional Worlds draft handoff hydration.
 *
 * Invariants:
 * - Site runtime mutations stay behind explicit operator actions; handoff drafts only prefill forms/messages.
 * - Embedded admin opens only when runtime guardrails report a ready site API.
 * - User tabs own their scroll area so route guidance scrolls with the active section content.
 *
 * Related:
 * - pages/Desktop/components/desktopWindowAppContent.tsx
 * - features/professional-worlds/desktop/professionalWorldsCrossAppDraft.ts
 */

import { lazy, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DESKTOP_CHROME_FOCUS_VISIBLE } from '@/pages/Desktop/components/DesktopAppChrome';
import { useEmbeddedPortaledModalZIndex } from '@/pages/Desktop/context/DesktopWindowPortalStackContext';
import { useDesktopShellFrame } from '@/pages/Desktop/context/DesktopShellFrameContext';
import { useDesktopWindowSurfaceState } from '@/pages/Desktop/context/DesktopWindowActiveContext';
import {
	getDesktopShellContentPanelClassName,
	getDesktopShellToolbarClusterInsetControlClassName,
} from '@/pages/Desktop/utils/desktopVisualSystem';
import { cn } from '@/utils/cn';
import {
	getSiteStudioAiCatalog,
	getSiteStudioDrafts,
	getSiteStudioHealth,
	getSiteStudioInstance,
	type SiteStudioAiCatalog,
	type SiteStudioApplyReport,
	type SiteStudioDraftState,
	type SiteStudioHealth,
	type SiteStudioInstance,
} from './api';
import { getSiteStudioUserFacingMessage } from './siteStudioUserError';
import { type SiteStudioWorkspaceTabItem } from './components/SiteStudioHeader';
import { isSiteStudioPendingStatus } from './components/siteStudioRuntimeGuards';
import { guideTourLabelsFromI18n } from '@/components/guided-tour/guideTourLabelsFromI18n';
import { useBuiltGuideSteps } from '@/components/guided-tour/useBuiltGuideSteps';
import { useDesktopGuideTourOpener } from '@/pages/Desktop/hooks/useDesktopGuideTourOpener';
import {
	SITE_STUDIO_GUIDE_STEP_DEFS,
	SITE_STUDIO_GUIDE_TAB_BY_STEP,
} from './siteStudioGuideConstants';
import {
	computeSiteStudioUserJourney,
	siteStudioJourneyStepToTab,
	type SiteStudioJourneyAction,
	type SiteStudioJourneyStepId,
} from './siteStudioUserJourney';

const _ImperorGPanelLazy = lazy(() =>
	import('./components/ImperorG/ImperorGPanel').then((m) => ({
		default: m.ImperorGPanel,
	}))
);

import {
	EMPTY_FORM,
	EMPTY_PANEL_ERRORS,
	deriveDraftStateFromInstance,
	getUnknownErrorMessage,
	normalizeSiteStudioTabId,
	type SiteStudioPanelKey,
	type SiteStudioTab,
	type UserSiteStudioAppProps,
	type VoiceTarget,
} from './userSiteStudioAppModel';
import { useUserSiteStudioAppHandlers } from './useUserSiteStudioAppHandlers';
import { useUserSiteStudioAppEffects } from './useUserSiteStudioAppEffects';

export function useUserSiteStudioAppController({
	initialProfessionalWorldsDraft,
}: UserSiteStudioAppProps = {}) {
	const windowId = undefined as string | undefined;
	const onRequestClose = undefined as (() => void) | undefined;
	const { t } = useTranslation('siteStudio');
	const guideLabels = useMemo(() => guideTourLabelsFromI18n(t, 'guide'), [t]);
	const guideSteps = useBuiltGuideSteps(
		t,
		'guide.steps',
		SITE_STUDIO_GUIDE_STEP_DEFS
	);
	const [guideOpen, setGuideOpen] = useState(false);
	const openGuideTour = useCallback(() => setGuideOpen(true), []);
	useDesktopGuideTourOpener(openGuideTour);
	const embeddedModalZ = useEmbeddedPortaledModalZIndex();
	const shellFrame = useDesktopShellFrame();
	const windowSurface = useDesktopWindowSurfaceState();
	const siteStudioIntroShell = getDesktopShellContentPanelClassName(shellFrame);
	const siteStudioInsetTextareaClassName = useMemo(
		() =>
			cn(
				'w-full resize-y shadow-none rounded-(--desktop-radius) px-3 py-2.5 text-sm',
				'text-(--desktop-text-primary) placeholder:text-(--desktop-text-dim)',
				'outline-none transition-colors',
				'focus-visible:ring-offset-0',
				DESKTOP_CHROME_FOCUS_VISIBLE,
				getDesktopShellToolbarClusterInsetControlClassName(shellFrame)
			),
		[shellFrame]
	);
	const [instance, setInstance] = useState<SiteStudioInstance | null>(null);
	const instanceRef = useRef<SiteStudioInstance | null>(null);
	instanceRef.current = instance;
	const [workspaceStale, setWorkspaceStale] = useState(false);
	const [lastWorkspaceOkAt, setLastWorkspaceOkAt] = useState<number | null>(
		null
	);
	const [health, setHealth] = useState<SiteStudioHealth | null>(null);
	const [catalog, setCatalog] = useState<SiteStudioAiCatalog | null>(null);
	const [drafts, setDrafts] = useState<SiteStudioDraftState | null>(null);
	const [loading, setLoading] = useState(true);
	const [activeTab, setActiveTab] = useState<SiteStudioTab>('setup');
	const prepareGuideStep = useCallback((stepId: string) => {
		const tab = SITE_STUDIO_GUIDE_TAB_BY_STEP[stepId];
		if (tab) setActiveTab(tab);
	}, []);
	const guideSpotlightLayoutKey = `${activeTab}-${guideOpen}`;
	const [form, setForm] = useState(EMPTY_FORM);
	const [assistantInput, setAssistantInput] = useState('');
	const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
	const [panelErrors, setPanelErrors] =
		useState<Record<SiteStudioPanelKey, string | null>>(EMPTY_PANEL_ERRORS);
	const [aiProgress, setAiProgress] = useState<string | null>(null);
	const [draftApplyReports, setDraftApplyReports] = useState<
		Record<string, SiteStudioApplyReport>
	>({});
	const [notice, setNotice] = useState<{
		tone: 'success' | 'error';
		message: string;
	} | null>(null);
	const [imagePrompts, setImagePrompts] = useState<Record<string, string>>({});
	const [imageProgress, setImageProgress] = useState<Record<string, string>>(
		{}
	);
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
	const [deleteConfirmationValue, setDeleteConfirmationValue] = useState('');
	const [recordingTarget, setRecordingTarget] = useState<VoiceTarget | null>(
		null
	);
	const [deployLiveText, setDeployLiveText] = useState('');
	const deploySigRef = useRef('');
	const appliedProfessionalWorldsDraftRef = useRef(false);
	const pwPublishedReportSigRef = useRef<string | null>(null);

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const mediaStreamRef = useRef<MediaStream | null>(null);
	const recordedChunksRef = useRef<Blob[]>([]);

	const safeDrafts = drafts ?? deriveDraftStateFromInstance(instance);
	const draftReviewSummary = useMemo(() => {
		const draftIds = [
			...safeDrafts.contentDrafts.map((draft) => draft.id),
			...safeDrafts.seoDrafts.map((draft) => draft.id),
			...safeDrafts.imageDrafts.map((draft) => draft.id),
		];
		const applied = draftIds.filter((id) => {
			const report = draftApplyReports[id];
			return (
				report?.status === 'applied' &&
				report.skipped === 0 &&
				report.failed === 0
			);
		}).length;

		return {
			total:
				safeDrafts.contentDrafts.length +
				safeDrafts.seoDrafts.length +
				safeDrafts.imageDrafts.length,
			content: safeDrafts.contentDrafts.length,
			seo: safeDrafts.seoDrafts.length,
			images: safeDrafts.imageDrafts.length,
			applied,
		};
	}, [
		draftApplyReports,
		safeDrafts.contentDrafts,
		safeDrafts.imageDrafts,
		safeDrafts.seoDrafts,
	]);
	const mediaSummary = useMemo(() => {
		const imageDraftIds = safeDrafts.imageDrafts.map((draft) => draft.id);
		const applied = imageDraftIds.filter((id) => {
			const report = draftApplyReports[id];
			return (
				report?.status === 'applied' &&
				report.skipped === 0 &&
				report.failed === 0
			);
		}).length;

		return {
			slots: catalog?.imageSlots.length ?? 0,
			drafts: safeDrafts.imageDrafts.length,
			applied,
		};
	}, [catalog?.imageSlots.length, draftApplyReports, safeDrafts.imageDrafts]);

	const formatApplyReport = useCallback(
		(report?: SiteStudioApplyReport): string | null => {
			if (!report) return null;
			const needsReview =
				report.status !== 'applied' || report.skipped > 0 || report.failed > 0;
			return t(
				needsReview
					? 'draftReview.applyNeedsReview'
					: 'draftReview.applyApplied',
				{
					applied: report.applied,
					skipped: report.skipped,
					failed: report.failed,
				}
			);
		},
		[t]
	);

	const getDraftReviewState = useCallback(
		(report?: SiteStudioApplyReport): string => {
			if (!report) return t('draftReview.stateNeedsReview');
			if (
				report.status === 'applied' &&
				report.skipped === 0 &&
				report.failed === 0
			) {
				return t('draftReview.stateApplied');
			}
			return t('draftReview.stateNeedsReview');
		},
		[t]
	);

	const aiProgressCallbacks = useMemo(
		() => ({
			onStarted: () => setAiProgress(t('assistant.progress.started')),
			onProgress: (payload: { progress_message?: string | null }) => {
				setAiProgress(
					payload.progress_message || t('assistant.progress.fallback')
				);
			},
		}),
		[t]
	);

	const setBusyKey = useCallback((key: string, busy: boolean) => {
		setBusyKeys((previous) => {
			const next = new Set(previous);
			if (busy) next.add(key);
			else next.delete(key);
			return next;
		});
	}, []);

	const setPanelError = useCallback(
		(panel: SiteStudioPanelKey, message: string | null) => {
			setPanelErrors((previous) => ({ ...previous, [panel]: message }));
		},
		[]
	);

	const clearNotice = useCallback(() => {
		setNotice(null);
	}, []);

	const syncFormFromInstance = useCallback(
		(next: SiteStudioInstance | null) => {
			if (!next) return;
			setForm({
				site_title: next.site_title,
				site_topic: next.site_topic,
				brief: String(next.brief_json?.brief ?? next.site_topic ?? ''),
			});
		},
		[]
	);

	const syncDraftsIntoState = useCallback(
		(
			nextDrafts: SiteStudioDraftState,
			nextInstance?: SiteStudioInstance | null
		) => {
			setDrafts(nextDrafts);
			setForm((previous) => ({
				...previous,
				brief: nextDrafts.brief || previous.brief,
			}));
			setInstance((previous) => {
				const target = nextInstance ?? previous;
				if (!target) return target;
				return {
					...target,
					brief_json: {
						...(target.brief_json ?? {}),
						...nextDrafts,
					},
				};
			});
		},
		[]
	);

	const cleanupVoiceResources = useCallback(() => {
		mediaRecorderRef.current = null;
		if (mediaStreamRef.current) {
			mediaStreamRef.current.getTracks().forEach((track) => {
				track.stop();
			});
			mediaStreamRef.current = null;
		}
		recordedChunksRef.current = [];
	}, []);

	const markWorkspaceFresh = useCallback(() => {
		setWorkspaceStale(false);
		setLastWorkspaceOkAt(Date.now());
	}, []);

	const refreshWorkspace = useCallback(async () => {
		/**
		 * Drafts: canonical state is `GET .../ai/drafts` when instance exists; `brief_json`
		 * on the instance is fallback until drafts load (or if drafts request fails).
		 */
		const hadInstanceSnapshot = instanceRef.current !== null;
		try {
			const nextInstance = await getSiteStudioInstance();
			if (!nextInstance) {
				setInstance(null);
				setHealth(null);
				setCatalog(null);
				setDrafts(null);
				setWorkspaceStale(false);
				return null;
			}

			syncFormFromInstance(nextInstance);
			setInstance(nextInstance);

			const [nextDrafts, nextCatalog, nextHealth] = await Promise.all([
				getSiteStudioDrafts().catch(() =>
					deriveDraftStateFromInstance(nextInstance)
				),
				getSiteStudioAiCatalog().catch(() => null),
				nextInstance.public_url || nextInstance.api_base_url
					? getSiteStudioHealth().catch(() => null)
					: Promise.resolve(null),
			]);

			syncDraftsIntoState(nextDrafts, nextInstance);
			setCatalog(nextCatalog);
			setHealth(nextHealth);
			markWorkspaceFresh();
			return nextInstance;
		} catch (error: unknown) {
			if (hadInstanceSnapshot) {
				setWorkspaceStale(true);
			}
			throw error;
		}
	}, [markWorkspaceFresh, syncDraftsIntoState, syncFormFromInstance]);

	const runPanelTask = useCallback(
		async (
			panel: SiteStudioPanelKey,
			key: string,
			task: () => Promise<unknown>,
			fallbackMessage: string
		): Promise<unknown | null> => {
			clearNotice();
			setPanelError(panel, null);
			setBusyKey(key, true);
			try {
				return await task();
			} catch (error: unknown) {
				const mapped = getSiteStudioUserFacingMessage(error, t);
				const message =
					mapped ?? getUnknownErrorMessage(error, fallbackMessage);
				setPanelError(panel, message);
				setNotice({ tone: 'error', message });
				return null;
			} finally {
				setBusyKey(key, false);
			}
		},
		[clearNotice, setBusyKey, setPanelError, t]
	);

	useUserSiteStudioAppEffects({
		t,
		loading,
		instance,
		health,
		catalog,
		form,
		setForm,
		setInstance,
		setHealth,
		setCatalog,
		setDrafts,
		setLoading,
		setNotice,
		setPanelError,
		setDeployLiveText,
		setAssistantInput,
		setActiveTab,
		setImagePrompts,
		deploySigRef,
		appliedProfessionalWorldsDraftRef,
		pwPublishedReportSigRef,
		initialProfessionalWorldsDraft,
		refreshWorkspace,
		syncFormFromInstance,
		syncDraftsIntoState,
		cleanupVoiceResources,
		safeDrafts,
		windowSurface,
		activeTab,
	});

	const adminShellReady = useMemo(() => {
		if (!instance || !health) return false;
		if (isSiteStudioPendingStatus(instance.status)) return false;
		return health.status === 'running' && health.api_ok === true;
	}, [health, instance]);

	/** Secondary tools only — primary nav is journey stages in the header. */
	const toolTabs = useMemo<SiteStudioWorkspaceTabItem[]>(
		() => [
			{ id: 'ai', label: t('tabs.ai') },
			{ id: 'admin', label: t('tabs.admin'), disabled: !adminShellReady },
		],
		[adminShellReady, t]
	);

	const recoverExistingInstance = useCallback(async () => {
		const result = await runPanelTask(
			'setup',
			'recover',
			async () => {
				const nextInstance = await refreshWorkspace();
				if (!nextInstance) {
					throw new Error(t('app.noticeRecoverManual'));
				}
				setActiveTab('setup');
				setNotice({
					tone: 'success',
					message: t('app.noticeRecoverPulled'),
				});
				return nextInstance;
			},
			t('app.recoverFailed')
		);
		return result as SiteStudioInstance | null;
	}, [refreshWorkspace, runPanelTask, t]);

	const closeDeleteConfirm = useCallback(() => {
		setDeleteConfirmOpen(false);
		setDeleteConfirmationValue('');
	}, []);

	const handlers = useUserSiteStudioAppHandlers({
		t,
		form,
		setForm,
		instance,
		setInstance,
		health,
		setHealth,
		catalog,
		setCatalog,
		drafts,
		setDrafts,
		assistantInput,
		setAssistantInput,
		busyKeys,
		aiProgressCallbacks,
		draftApplyReports,
		setDraftApplyReports,
		imagePrompts,
		setImageProgress,
		deleteConfirmationValue,
		recordingTarget,
		setRecordingTarget,
		setAiProgress,
		setNotice,
		setActiveTab,
		mediaRecorderRef,
		mediaStreamRef,
		recordedChunksRef,
		safeDrafts,
		adminShellReady,
		setBusyKey,
		setPanelError,
		clearNotice,
		syncDraftsIntoState,
		cleanupVoiceResources,
		refreshWorkspace,
		runPanelTask,
		recoverExistingInstance,
		closeDeleteConfirm,
	});
	const {
		startVoiceCapture,
		stopVoiceCapture,
		toggleVoiceCapture,
		handleCreateWorkspace,
		handleSaveMetadata,
		handleGenerateBrief,
		handleRunAction,
		handleDeleteSite,
		handleRefresh,
		handleAssistantSend,
		handleGenerateContentPack,
		handleGenerateSeo,
		handleGenerateImage,
		handleCopy,
		handleApplyContentDraft,
		handleApplySeoDraft,
		handleApplyImageDraft,
		waitForSiteRunning,
		handleImperorGApplyAll,
		handleImperorGApplyAndLaunch,
	} = handlers;

	const userJourney = useMemo(() => {
		if (!instance) return null;
		return computeSiteStudioUserJourney({
			instance,
			health,
			drafts: safeDrafts,
			busyKeys,
			applyReports: draftApplyReports,
			adminShellReady,
		});
	}, [
		adminShellReady,
		busyKeys,
		draftApplyReports,
		health,
		instance,
		safeDrafts,
	]);

	const selectWorkspaceTab = useCallback((tabId: string) => {
		const normalized = normalizeSiteStudioTabId(tabId);
		if (normalized) setActiveTab(normalized);
	}, []);

	const handleJourneyAction = useCallback(
		(action: SiteStudioJourneyAction) => {
			if (!instance) return;
			if (action.kind === 'tab') {
				selectWorkspaceTab(action.tab);
				return;
			}
			if (action.kind === 'runtime') {
				handleRunAction(action.action).catch(() => undefined);
				return;
			}
			if (action.kind === 'apply_all') {
				handleImperorGApplyAll().catch(() => undefined);
				return;
			}
			if (action.kind === 'open_admin') {
				setActiveTab('admin');
				return;
			}
			if (action.kind === 'open_public' && instance.public_url) {
				window.open(instance.public_url, '_blank', 'noopener,noreferrer');
			}
		},
		[handleImperorGApplyAll, handleRunAction, instance, selectWorkspaceTab]
	);

	const selectJourneyStep = useCallback(
		(stepId: SiteStudioJourneyStepId) => {
			if (!userJourney) {
				selectWorkspaceTab(siteStudioJourneyStepToTab(stepId));
				return;
			}
			const step = userJourney.steps.find((item) => item.id === stepId);
			if (step?.action) {
				handleJourneyAction(step.action);
				return;
			}
			selectWorkspaceTab(siteStudioJourneyStepToTab(stepId));
		},
		[handleJourneyAction, selectWorkspaceTab, userJourney]
	);

	return {
		guideOpen,
		setGuideOpen,
		instance,
		setInstance,
		workspaceStale,
		lastWorkspaceOkAt,
		health,
		setHealth,
		catalog,
		setCatalog,
		drafts,
		setDrafts,
		loading,
		setLoading,
		activeTab,
		setActiveTab,
		form,
		setForm,
		assistantInput,
		setAssistantInput,
		busyKeys,
		setBusyKeys,
		panelErrors,
		setPanelErrors,
		aiProgress,
		setAiProgress,
		draftApplyReports,
		setDraftApplyReports,
		notice,
		setNotice,
		imagePrompts,
		setImagePrompts,
		imageProgress,
		setImageProgress,
		deleteConfirmOpen,
		setDeleteConfirmOpen,
		deleteConfirmationValue,
		setDeleteConfirmationValue,
		recordingTarget,
		setRecordingTarget,
		deployLiveText,
		setDeployLiveText,
		guideLabels,
		openGuideTour,
		siteStudioInsetTextareaClassName,
		prepareGuideStep,
		deploySigRef,
		appliedProfessionalWorldsDraftRef,
		pwPublishedReportSigRef,
		mediaRecorderRef,
		mediaStreamRef,
		recordedChunksRef,
		draftReviewSummary,
		mediaSummary,
		formatApplyReport,
		getDraftReviewState,
		aiProgressCallbacks,
		setBusyKey,
		setPanelError,
		clearNotice,
		syncFormFromInstance,
		syncDraftsIntoState,
		cleanupVoiceResources,
		refreshWorkspace,
		runPanelTask,
		adminShellReady,
		toolTabs,
		selectWorkspaceTab,
		selectJourneyStep,
		recoverExistingInstance,
		closeDeleteConfirm,
		startVoiceCapture,
		stopVoiceCapture,
		toggleVoiceCapture,
		handleCreateWorkspace,
		handleSaveMetadata,
		handleGenerateBrief,
		handleRunAction,
		handleDeleteSite,
		handleRefresh,
		handleAssistantSend,
		handleGenerateContentPack,
		handleGenerateSeo,
		handleGenerateImage,
		handleCopy,
		handleApplyContentDraft,
		handleApplySeoDraft,
		handleApplyImageDraft,
		waitForSiteRunning,
		handleImperorGApplyAll,
		handleImperorGApplyAndLaunch,
		userJourney,
		handleJourneyAction,
		guideSteps,
		embeddedModalZ,
		shellFrame,
		windowSurface,
		siteStudioIntroShell,
		guideSpotlightLayoutKey,
		safeDrafts,
		isBriefRecording: recordingTarget === 'brief',
		isAssistantRecording: recordingTarget === 'assistant',
		assistantMessages: [...safeDrafts.assistantMessages].reverse(),
		windowId,
		onRequestClose,
		t,
	};
}

export type UserSiteStudioAppController = ReturnType<
	typeof useUserSiteStudioAppController
>;
