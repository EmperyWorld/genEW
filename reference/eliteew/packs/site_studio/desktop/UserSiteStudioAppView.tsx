import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import {
	DesktopAppButton,
	DesktopAppContentWrapper,
	DesktopAppEmptyState,
	DesktopAppInput,
	DesktopAppModalFrame,
	DesktopAppPanel,
	DesktopAppSurface,
	DesktopProductStatusBanner,
	DESKTOP_APP_STYLE_CONTRACT,
} from '@/pages/Desktop/components/DesktopAppChrome';
import { SiteStudioFirstRunPanel } from './components/SiteStudioFirstRunPanel';
import { UserSiteStudioAiTab } from './UserSiteStudioAiTab';
import { UserSiteStudioContentTab } from './UserSiteStudioContentTab';
import { UserSiteStudioMediaTab } from './UserSiteStudioMediaTab';
import { UserSiteStudioSetupTab } from './UserSiteStudioSetupTab';
import { SiteStudioGuidedCockpit } from './components/SiteStudioGuidedCockpit';
import { SiteStudioHeader } from './components/SiteStudioHeader';
import { SiteStudioAdminShell } from './SiteStudioAdminShell';
import { SpotlightGuideModal } from '@/components/guided-tour/SpotlightGuideModal';
import {
	SITE_STUDIO_GUIDE_AUDIO_LS_KEY,
	SITE_STUDIO_GUIDE_ROOT_ID,
	SITE_STUDIO_GUIDE_TOUR_FOLDER,
} from './siteStudioGuideConstants';
import {
	ArrowPathIcon,
	ExclamationTriangleIcon,
	RocketLaunchIcon,
} from '@heroicons/react/24/outline';

const ImperorGPanelLazy = lazy(() =>
	import('./components/ImperorG/ImperorGPanel').then((m) => ({
		default: m.ImperorGPanel,
	}))
);

import {
	WORKSPACE_SCROLL_AREA_CLASS,
	getBlueprintValue,
	type SiteStudioPanelKey,
	type SiteStudioTab,
} from './userSiteStudioAppModel';
import type { UserSiteStudioAppController } from './useUserSiteStudioAppController';

export function UserSiteStudioAppView({
	vm,
}: {
	vm: UserSiteStudioAppController;
}) {
	const { t } = useTranslation('siteStudio');
	const {
		guideOpen,
		setGuideOpen,
		instance,
		setInstance,
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
		isBriefRecording,
		isAssistantRecording,
		assistantMessages,
		workspaceStale,
	} = vm;

	const renderPanelError = (panel: SiteStudioPanelKey) =>
		panelErrors[panel] ? (
			<DesktopProductStatusBanner
				tone="danger"
				title={t('app.panelErrorTitle')}
				description={panelErrors[panel]}
			/>
		) : null;

	const renderNotice = notice ? (
		<DesktopAppSurface
			variant="soft"
			padding="sm"
			className={
				notice.tone === 'success'
					? 'border border-emerald-500/25 bg-emerald-500/10 text-sm text-emerald-100'
					: 'border border-red-500/25 bg-red-500/10 text-sm text-red-100'
			}
		>
			{notice.message}
		</DesktopAppSurface>
	) : null;

	const renderBlueprintSummary = safeDrafts.siteBlueprint ? (
		<div className="grid gap-3 md:grid-cols-2">
			{[
				{ key: 'brandCore', labelKey: 'assistant.blueprint.brandCore' },
				{ key: 'offer', labelKey: 'assistant.blueprint.offer' },
				{
					key: 'visualDirection',
					labelKey: 'assistant.blueprint.visualDirection',
				},
				{ key: 'heroMood', labelKey: 'assistant.blueprint.heroMood' },
				{ key: 'toneOfVoice', labelKey: 'assistant.blueprint.toneOfVoice' },
				{ key: 'keywords', labelKey: 'assistant.blueprint.keywords' },
			]
				.map((item) => ({
					...item,
					value: getBlueprintValue(safeDrafts.siteBlueprint, item.key),
				}))
				.filter((item) => item.value)
				.map((item) => (
					<DesktopAppSurface
						key={item.key}
						variant="soft"
						padding="sm"
						className="space-y-1"
					>
						<div className="text-xs uppercase tracking-[0.18em] text-(--desktop-text-dim)">
							{t(item.labelKey)}
						</div>
						<div className="text-sm leading-6 text-(--desktop-text-primary)">
							{item.value}
						</div>
					</DesktopAppSurface>
				))}
		</div>
	) : (
		<DesktopAppSurface
			variant="soft"
			padding="sm"
			className="text-sm text-(--desktop-text-secondary)"
		>
			{t('assistant.blueprint.empty')}
		</DesktopAppSurface>
	);

	const renderWorkspaceGuidedCockpit = () =>
		userJourney ? (
			<div className="mb-4">
				<SiteStudioGuidedCockpit
					journey={userJourney}
					onAction={handleJourneyAction}
				/>
			</div>
		) : null;

	if (loading) {
		return (
			<DesktopAppContentWrapper
				appComponent="UserSiteStudio"
				className="h-full"
			>
				<div className="flex h-full items-center justify-center">
					<DesktopAppPanel className="p-8 text-center">
						<ArrowPathIcon className="mx-auto mb-3 h-8 w-8 animate-spin motion-reduce:animate-none text-[rgb(var(--desktop-accent-rgb))]" />
						<div className="text-sm text-(--desktop-text-secondary)">
							{t('app.loading')}
						</div>
					</DesktopAppPanel>
				</div>
			</DesktopAppContentWrapper>
		);
	}

	if (!instance) {
		return (
			<SiteStudioFirstRunPanel
				form={form}
				busyKeys={busyKeys}
				isBriefRecording={isBriefRecording}
				introShellClassName={siteStudioIntroShell}
				textareaClassName={siteStudioInsetTextareaClassName}
				notice={renderNotice}
				setupError={renderPanelError('setup')}
				onFormChange={setForm}
				onCreateWorkspace={(provisionAfterCreate) =>
					handleCreateWorkspace(provisionAfterCreate).catch(() => undefined)
				}
				onRecoverExistingInstance={() =>
					recoverExistingInstance().catch(() => undefined)
				}
				onToggleVoiceCapture={() =>
					toggleVoiceCapture('brief').catch(() => undefined)
				}
			/>
		);
	}

	return (
		<DesktopAppContentWrapper appComponent="UserSiteStudio" className="h-full">
			<main
				id={SITE_STUDIO_GUIDE_ROOT_ID}
				aria-label={t('app.mainLabel')}
				className="relative flex h-full min-h-0 flex-col gap-2 overflow-hidden"
			>
				<SiteStudioHeader
					instance={instance}
					health={health}
					activeTab={activeTab}
					toolTabs={toolTabs}
					journey={userJourney}
					refreshing={busyKeys.has('refresh')}
					onRefresh={() => handleRefresh().catch(() => undefined)}
					onSelectTab={selectWorkspaceTab}
					onSelectJourneyStep={selectJourneyStep}
				/>

				<div aria-live="polite" aria-atomic="true" className="sr-only">
					{deployLiveText}
				</div>

				{renderNotice}

				{workspaceStale ? (
					<DesktopProductStatusBanner
						tone="warning"
						title={t('app.staleTitle')}
						description={t('app.staleDescription')}
						actions={
							<DesktopAppButton
								type="button"
								variant="neutral"
								disabled={busyKeys.has('refresh')}
								onClick={() => handleRefresh().catch(() => undefined)}
							>
								<ArrowPathIcon
									className={`h-4 w-4 ${busyKeys.has('refresh') ? 'animate-spin motion-reduce:animate-none' : ''}`}
								/>
								{t('app.staleRetry')}
							</DesktopAppButton>
						}
					/>
				) : null}

				{(() => {
					const tabVm = {
						...vm,
						renderPanelError,
						renderNotice,
						renderBlueprintSummary,
						renderWorkspaceGuidedCockpit,
					};
					return (
						<>
							{activeTab === 'setup' ? (
								<UserSiteStudioSetupTab vm={tabVm} />
							) : null}

							{activeTab === 'autofill' ? (
								<div
									id="site-studio-panel-autofill"
									tabIndex={-1}
									className={WORKSPACE_SCROLL_AREA_CLASS}
								>
									{renderWorkspaceGuidedCockpit()}
									<Suspense
										fallback={
											<div className="flex items-center justify-center p-8">
												<ArrowPathIcon className="h-6 w-6 animate-spin motion-reduce:animate-none text-(--desktop-text-tertiary)" />
											</div>
										}
									>
										<ImperorGPanelLazy
											onComplete={refreshWorkspace}
											onApplyAll={handleImperorGApplyAll}
											onApplyAndLaunch={handleImperorGApplyAndLaunch}
										/>
									</Suspense>
								</div>
							) : null}

							{activeTab === 'ai' ? <UserSiteStudioAiTab vm={tabVm} /> : null}

							{activeTab === 'content' ? (
								<UserSiteStudioContentTab vm={tabVm} />
							) : null}

							{activeTab === 'media' ? (
								<UserSiteStudioMediaTab vm={tabVm} />
							) : null}
						</>
					);
				})()}

				{activeTab === 'admin' ? (
					adminShellReady ? (
						<div
							id="site-studio-panel-admin"
							tabIndex={-1}
							className="min-h-0 flex-1 overflow-hidden rounded-(--desktop-radius-xl) border border-(--desktop-border-subtle) bg-(--desktop-surface-app)"
						>
							<SiteStudioAdminShell
								publicSiteUrl={instance?.public_url ?? null}
							/>
						</div>
					) : (
						<div
							id="site-studio-panel-admin"
							tabIndex={-1}
							className="min-h-0 flex-1 outline-none"
						>
							<DesktopAppEmptyState
								className="h-full"
								title={t('app.adminUnavailableTitle')}
								description={t('app.adminUnavailableDesc')}
							>
								<DesktopAppButton
									type="button"
									variant="accent"
									onClick={() =>
										handleRunAction('provision').catch(() => undefined)
									}
								>
									<RocketLaunchIcon className="h-4 w-4" />
									{t('app.adminProvisionCta')}
								</DesktopAppButton>
							</DesktopAppEmptyState>
						</div>
					)
				) : null}

				{deleteConfirmOpen ? (
					// biome-ignore lint/a11y/noStaticElementInteractions: full-viewport modal backdrop dismisses on click outside the frame
					// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard focus stays inside modal frame; backdrop is pointer dismiss only
					<div
						className={`${DESKTOP_APP_STYLE_CONTRACT.modalBackdrop} p-4`}
						style={{ zIndex: embeddedModalZ.backdrop }}
						onClick={() => {
							if (!busyKeys.has('delete')) {
								closeDeleteConfirm();
							}
						}}
					>
						<DesktopAppModalFrame
							title={t('danger.modalTitle')}
							onClose={busyKeys.has('delete') ? undefined : closeDeleteConfirm}
							className="max-w-lg"
							style={{ zIndex: embeddedModalZ.content }}
							onClick={(event) => event.stopPropagation()}
						>
							<div className="space-y-4 p-4">
								<DesktopAppSurface
									variant="soft"
									padding="sm"
									className="border border-red-500/25 bg-red-500/10"
								>
									<div className="flex gap-3">
										<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15">
											<ExclamationTriangleIcon className="h-5 w-5 text-red-300" />
										</div>
										<div className="space-y-1">
											<div className="text-sm font-semibold text-red-50">
												{t('danger.modalIrreversible')}
											</div>
											<p className="text-sm leading-5 text-red-100/85">
												{t('danger.modalBody', { slug: instance.site_slug })}
											</p>
										</div>
									</div>
								</DesktopAppSurface>

								<div className="space-y-2">
									<label
										htmlFor="site-studio-delete-slug"
										className="text-sm text-(--desktop-text-secondary)"
									>
										{t('danger.modalLabel')}
									</label>
									<DesktopAppInput
										id="site-studio-delete-slug"
										value={deleteConfirmationValue}
										onChange={(event) =>
											setDeleteConfirmationValue(event.target.value)
										}
										placeholder={instance.site_slug}
										autoFocus
									/>
									<div className="text-xs text-(--desktop-text-dim)">
										{t('danger.modalExpected')}{' '}
										<span className="font-mono text-(--desktop-text-primary)">
											{instance.site_slug}
										</span>
									</div>
								</div>

								<div className="flex justify-end gap-2">
									<DesktopAppButton
										type="button"
										variant="neutral"
										disabled={busyKeys.has('delete')}
										onClick={closeDeleteConfirm}
									>
										{t('danger.modalCancel')}
									</DesktopAppButton>
									<DesktopAppButton
										type="button"
										variant="danger"
										disabled={
											busyKeys.has('delete') ||
											deleteConfirmationValue.trim() !== instance.site_slug
										}
										onClick={() => handleDeleteSite().catch(() => undefined)}
									>
										{busyKeys.has('delete') ? (
											<ArrowPathIcon className="h-4 w-4 animate-spin motion-reduce:animate-none" />
										) : (
											<ExclamationTriangleIcon className="h-4 w-4" />
										)}
										{t('danger.modalConfirm')}
									</DesktopAppButton>
								</div>
							</div>
						</DesktopAppModalFrame>
					</div>
				) : null}
				<SpotlightGuideModal
					open={guideOpen}
					onClose={() => setGuideOpen(false)}
					rootId={SITE_STUDIO_GUIDE_ROOT_ID}
					steps={guideSteps}
					audioLocalStorageKey={SITE_STUDIO_GUIDE_AUDIO_LS_KEY}
					tourAudioFolder={SITE_STUDIO_GUIDE_TOUR_FOLDER}
					labels={guideLabels}
					onPrepareStep={prepareGuideStep}
					spotlightLayoutKey={guideSpotlightLayoutKey}
					dialogTitleId="site-studio-guide-title"
				/>
			</main>
		</DesktopAppContentWrapper>
	);
}
