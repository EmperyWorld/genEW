/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Site Studio workspace voice capture and mutation handlers.
 *
 * Invariants:
 * - Busy/error/notice updates stay on controller-owned state setters passed via `deps`.
 *
 * Related:
 * - features/site-studio/desktop/useUserSiteStudioAppController.tsx
 */
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

import { lazy, useCallback } from 'react';
import {
	assistSiteStudio,
	createSiteStudioInstance,
	deleteSiteStudioInstance,
	extractSiteStudioImageUrl,
	generateSiteStudioBrief,
	generateSiteStudioContentPack,
	generateSiteStudioSeoPack,
	getSiteStudioAiCatalog,
	getSiteStudioDrafts,
	provisionSiteStudioInstance,
	publishSiteStudioInstance,
	redeploySiteStudioInstance,
	saveSiteStudioImageDraft,
	startSiteStudioInstance,
	stopSiteStudioInstance,
	streamSiteStudioImageGeneration,
	unpublishSiteStudioInstance,
	updateSiteStudioInstance,
	type SiteStudioImageSlotCatalogItem,
} from './api';

const _ImperorGPanelLazy = lazy(() =>
	import('./components/ImperorG/ImperorGPanel').then((m) => ({
		default: m.ImperorGPanel,
	}))
);

import {
	EMPTY_FORM,
	deriveDraftStateFromInstance,
	getRequestStatusCode,
	getUnknownErrorMessage,
} from './userSiteStudioAppModel';

import { useUserSiteStudioAppVoice } from './useUserSiteStudioAppVoice';
import { useUserSiteStudioAppApplyHandlers } from './useUserSiteStudioAppApplyHandlers';

export type UserSiteStudioAppHandlerDeps = Record<string, any>;

export function useUserSiteStudioAppHandlers(
	deps: UserSiteStudioAppHandlerDeps
) {
	const { startVoiceCapture, stopVoiceCapture, toggleVoiceCapture } =
		useUserSiteStudioAppVoice(deps);
	const {
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
	} = deps;

	const handleCreateWorkspace = useCallback(
		async (provisionAfterCreate: boolean) => {
			const key = provisionAfterCreate ? 'create+provision' : 'create';
			clearNotice();
			setPanelError('setup', null);
			setBusyKey(key, true);
			try {
				const nextInstance = await createSiteStudioInstance({
					site_title: form.site_title.trim(),
					site_topic: form.site_topic.trim(),
					brief_json: {
						brief: form.brief.trim(),
					},
				});
				const nextDrafts = deriveDraftStateFromInstance(nextInstance);
				syncDraftsIntoState(nextDrafts, nextInstance);
				setCatalog(null);
				setInstance(nextInstance);
				setActiveTab('setup');
				if (provisionAfterCreate) {
					const ar = await provisionSiteStudioInstance();
					await refreshWorkspace();
					setNotice({
						tone: 'success',
						message: ar.queued
							? t('runtime.noticeActionQueued')
							: t('runtime.noticeActionDispatched', { detail: ar.detail }),
					});
				} else {
					const [nextCatalog, refreshedDrafts] = await Promise.all([
						getSiteStudioAiCatalog().catch(() => null),
						getSiteStudioDrafts().catch(() => nextDrafts),
					]);
					setCatalog(nextCatalog);
					syncDraftsIntoState(refreshedDrafts, nextInstance);
					setNotice({
						tone: 'success',
						message: t('app.noticeWorkspaceCreated'),
					});
				}
			} catch (error: unknown) {
				if (getRequestStatusCode(error) === 409) {
					await recoverExistingInstance();
					return;
				}
				const message = getUnknownErrorMessage(
					error,
					t('app.createWorkspaceFailed')
				);
				setPanelError('setup', message);
				setNotice({ tone: 'error', message });
			} finally {
				setBusyKey(key, false);
			}
		},
		[
			clearNotice,
			form.brief,
			form.site_title,
			form.site_topic,
			recoverExistingInstance,
			refreshWorkspace,
			setBusyKey,
			setPanelError,
			syncDraftsIntoState,
			t,
			setInstance,
			setNotice,
			setCatalog,
			setActiveTab,
		]
	);

	const handleSaveMetadata = useCallback(async () => {
		if (!instance) return;
		const mergedBriefJson = {
			...(instance.brief_json ?? {}),
			...safeDrafts,
			brief: form.brief.trim(),
		};

		const result = await runPanelTask(
			'setup',
			'save-metadata',
			async () => {
				const nextInstance = await updateSiteStudioInstance({
					site_title: form.site_title.trim(),
					site_topic: form.site_topic.trim(),
					brief_json: mergedBriefJson,
				});
				setInstance(nextInstance);
				syncDraftsIntoState(
					deriveDraftStateFromInstance(nextInstance),
					nextInstance
				);
				setNotice({
					tone: 'success',
					message: t('app.metadataSaved'),
				});
				return nextInstance;
			},
			t('app.metadataSaveFailed')
		);

		if (result) {
			setPanelError('setup', null);
		}
	}, [
		form.brief,
		form.site_title,
		form.site_topic,
		instance,
		runPanelTask,
		safeDrafts,
		setPanelError,
		syncDraftsIntoState,
		t,
		setNotice,
		setInstance,
	]);

	const handleGenerateBrief = useCallback(async () => {
		if (!instance) return;
		const result = await runPanelTask(
			'setup',
			'brief-wizard',
			async () => {
				setAiProgress(t('assistant.progress.blueprint'));
				const nextDrafts = await generateSiteStudioBrief({
					prompt: form.brief.trim() || safeDrafts.brief,
					callbacks: aiProgressCallbacks,
				});
				syncDraftsIntoState(nextDrafts);
				setNotice({ tone: 'success', message: t('app.blueprintReady') });
				return nextDrafts;
			},
			t('app.briefGenerateFailed')
		);

		if (result) {
			setActiveTab('ai');
		}
	}, [
		form.brief,
		instance,
		aiProgressCallbacks,
		runPanelTask,
		safeDrafts.brief,
		syncDraftsIntoState,
		t,
		setNotice,
		setActiveTab,
		setAiProgress,
	]);

	const handleRunAction = useCallback(
		async (
			action:
				| 'provision'
				| 'start'
				| 'stop'
				| 'redeploy'
				| 'publish'
				| 'unpublish'
		) => {
			const result = await runPanelTask(
				'setup',
				action,
				async () => {
					if (action === 'provision') {
						const ar = await provisionSiteStudioInstance();
						await refreshWorkspace();
						setNotice({
							tone: 'success',
							message: ar.queued
								? t('runtime.noticeActionQueued')
								: t('runtime.noticeActionDispatched', { detail: ar.detail }),
						});
						return true;
					}
					if (action === 'start') {
						const ar = await startSiteStudioInstance();
						await refreshWorkspace();
						setNotice({
							tone: 'success',
							message: ar.queued
								? t('runtime.noticeActionQueued')
								: t('runtime.noticeActionDispatched', { detail: ar.detail }),
						});
						return true;
					}
					if (action === 'stop') {
						const ar = await stopSiteStudioInstance();
						await refreshWorkspace();
						setNotice({
							tone: 'success',
							message: ar.queued
								? t('runtime.noticeActionQueued')
								: t('runtime.noticeActionDispatched', { detail: ar.detail }),
						});
						return true;
					}
					if (action === 'redeploy') {
						const ar = await redeploySiteStudioInstance();
						await refreshWorkspace();
						setNotice({
							tone: 'success',
							message: ar.queued
								? t('runtime.noticeActionQueued')
								: t('runtime.noticeActionDispatched', { detail: ar.detail }),
						});
						return true;
					}
					if (action === 'publish') {
						await publishSiteStudioInstance();
						await refreshWorkspace();
						setNotice({
							tone: 'success',
							message: t('runtime.noticePublished'),
						});
						return true;
					}
					if (action === 'unpublish') {
						await unpublishSiteStudioInstance();
						await refreshWorkspace();
						setNotice({
							tone: 'success',
							message: t('runtime.noticeUnpublished'),
						});
						return true;
					}
					return true;
				},
				t('errors.runtimeActionFailed')
			);
			return result;
		},
		[refreshWorkspace, runPanelTask, t, setNotice]
	);

	const handleDeleteSite = useCallback(async () => {
		if (!instance) return;
		if (deleteConfirmationValue.trim() !== instance.site_slug) {
			const message = t('danger.confirmMismatch', { slug: instance.site_slug });
			setPanelError('setup', message);
			setNotice({ tone: 'error', message });
			return;
		}

		const result = await runPanelTask(
			'setup',
			'delete',
			async () => {
				await deleteSiteStudioInstance();
				setInstance(null);
				setHealth(null);
				setCatalog(null);
				setDrafts(null);
				setActiveTab('setup');
				setForm(EMPTY_FORM);
				closeDeleteConfirm();
				setNotice({
					tone: 'success',
					message: t('app.workspaceDeleted'),
				});
				return true;
			},
			t('app.deleteInstanceFailed')
		);

		return result;
	}, [
		closeDeleteConfirm,
		deleteConfirmationValue,
		instance,
		runPanelTask,
		setPanelError,
		t,
		setForm,
		setNotice,
		setHealth,
		setCatalog,
		setInstance,
		setDrafts,
		setActiveTab,
	]);

	const handleRefresh = useCallback(async () => {
		await runPanelTask(
			'setup',
			'refresh',
			async () => {
				await refreshWorkspace();
				setNotice({
					tone: 'success',
					message: t('app.stateRefreshed'),
				});
				return true;
			},
			t('app.refreshFailed')
		);
	}, [refreshWorkspace, runPanelTask, t, setNotice]);

	const handleAssistantSend = useCallback(async () => {
		if (!assistantInput.trim()) return;
		const result = await runPanelTask(
			'ai',
			'assistant',
			async () => {
				setAiProgress(t('assistant.progress.analyzing'));
				const response = await assistSiteStudio({
					message: assistantInput.trim(),
					callbacks: aiProgressCallbacks,
				});
				syncDraftsIntoState(response.drafts);
				setAssistantInput('');
				return response;
			},
			t('app.assistantFailed')
		);

		if (result) {
			setActiveTab('ai');
		}
	}, [
		aiProgressCallbacks,
		assistantInput,
		runPanelTask,
		syncDraftsIntoState,
		t,
		setAssistantInput,
		setAiProgress,
		setActiveTab,
	]);

	const handleGenerateContentPack = useCallback(
		async (packKey: string) => {
			const result = await runPanelTask(
				'ai',
				`content:${packKey}`,
				async () => {
					setAiProgress(t('assistant.progress.content'));
					const response = await generateSiteStudioContentPack({
						pack_key: packKey,
						callbacks: aiProgressCallbacks,
					});
					syncDraftsIntoState(response.drafts);
					setNotice({
						tone: 'success',
						message: t('app.contentPackReady', {
							title: response.draft.title,
						}),
					});
					return response;
				},
				t('app.contentPackGenerateFailed')
			);

			if (result) {
				setActiveTab('content');
			}
		},
		[
			aiProgressCallbacks,
			runPanelTask,
			syncDraftsIntoState,
			t,
			setAiProgress,
			setNotice,
			setActiveTab,
		]
	);

	const handleGenerateSeo = useCallback(async () => {
		const result = await runPanelTask(
			'ai',
			'seo-pack',
			async () => {
				setAiProgress(t('assistant.progress.seo'));
				const response = await generateSiteStudioSeoPack(aiProgressCallbacks);
				syncDraftsIntoState(response.drafts);
				setNotice({ tone: 'success', message: t('app.seoPackReady') });
				return response;
			},
			t('app.seoPackGenerateFailed')
		);

		if (result) {
			setActiveTab('content');
		}
	}, [
		aiProgressCallbacks,
		runPanelTask,
		syncDraftsIntoState,
		t,
		setNotice,
		setAiProgress,
		setActiveTab,
	]);

	const handleGenerateImage = useCallback(
		async (slot: SiteStudioImageSlotCatalogItem) => {
			const key = `image:${slot.slotId}`;
			let effectivePrompt = imagePrompts[slot.slotId]?.trim() || '';
			setPanelError('media', null);
			clearNotice();
			setBusyKey(key, true);
			setImageProgress((previous) => ({
				...previous,
				[slot.slotId]: t('app.imageGenPreparing'),
			}));

			try {
				const result = await streamSiteStudioImageGeneration(
					{
						slot_id: slot.slotId,
						prompt: imagePrompts[slot.slotId]?.trim() || undefined,
						width: slot.recommendedWidth,
						height: slot.recommendedHeight,
					},
					{
						onStarted: (_requestId, payload) => {
							const streamPrompt = (payload as { prompt?: unknown }).prompt;
							if (typeof streamPrompt === 'string' && streamPrompt.trim()) {
								effectivePrompt = streamPrompt.trim();
							} else {
								effectivePrompt =
									imagePrompts[slot.slotId]?.trim() || effectivePrompt;
							}
							setImageProgress((previous) => ({
								...previous,
								[slot.slotId]: t('app.imageGenStarted'),
							}));
						},
						onProgress: (payload) => {
							const streamPrompt = (payload as { prompt?: unknown }).prompt;
							if (typeof streamPrompt === 'string' && streamPrompt.trim()) {
								effectivePrompt = streamPrompt.trim();
							}
							const progressMessage =
								typeof payload.progress_message === 'string'
									? payload.progress_message
									: typeof payload.stage === 'string'
										? payload.stage
										: t('app.imageGenProgressFallback');
							setImageProgress((previous) => ({
								...previous,
								[slot.slotId]: progressMessage,
							}));
						},
					}
				);

				const imageUrl = extractSiteStudioImageUrl(result);
				if (!imageUrl) {
					throw new Error(t('app.imageGenNoUrl'));
				}

				const response = await saveSiteStudioImageDraft({
					slot_id: slot.slotId,
					image_url: imageUrl,
					prompt: effectivePrompt || slot.description,
					width: slot.recommendedWidth,
					height: slot.recommendedHeight,
				});

				syncDraftsIntoState(response.drafts);
				setImageProgress((previous) => ({
					...previous,
					[slot.slotId]: t('app.imageGenDraftSaved'),
				}));
				setNotice({
					tone: 'success',
					message: t('app.imageGenSuccess', { title: slot.title }),
				});
				setActiveTab('media');
			} catch (error: unknown) {
				const message = getUnknownErrorMessage(error, t('app.imageGenFailed'));
				setPanelError('media', message);
				setNotice({ tone: 'error', message });
				setImageProgress((previous) => ({
					...previous,
					[slot.slotId]: message,
				}));
			} finally {
				setBusyKey(key, false);
			}
		},
		[
			clearNotice,
			imagePrompts,
			setBusyKey,
			setPanelError,
			syncDraftsIntoState,
			t,
			setNotice,
			setImageProgress,
			setActiveTab,
		]
	);

	const handleCopy = useCallback(
		async (value: string, label: string) => {
			try {
				await navigator.clipboard.writeText(value);
				setNotice({
					tone: 'success',
					message: t('app.copySuccess', { label }),
				});
			} catch {
				setNotice({ tone: 'error', message: t('app.copyFailed', { label }) });
			}
		},
		[t, setNotice]
	);

	const {
		handleApplyContentDraft,
		handleApplySeoDraft,
		handleApplyImageDraft,
		waitForSiteRunning,
		handleImperorGApplyAll,
		handleImperorGApplyAndLaunch,
	} = useUserSiteStudioAppApplyHandlers({
		t: deps.t,
		safeDrafts: deps.safeDrafts,
		draftApplyReports: deps.draftApplyReports,
		setDraftApplyReports: deps.setDraftApplyReports,
		setNotice: deps.setNotice,
		runPanelTask: deps.runPanelTask,
		refreshWorkspace: deps.refreshWorkspace,
		handleRunAction,
	});

	return {
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
	};
}
