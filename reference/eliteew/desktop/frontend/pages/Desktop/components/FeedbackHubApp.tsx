/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop Feedback Hub shell: header, stats, ticket list, and compose form orchestration.
 *
 * Invariants:
 * - Text-only manual submission; no voice/STT capture in this surface.
 * - Infinite ticket history uses bounded cache and avoids focus/mount refetch storms.
 * - `admin_notes` is visible to the author and must be treated as team reply text.
 *
 * Related:
 * - documentation/product/FEEDBACK-HUB.md
 * - feedbackHub/FeedbackHubAppHeader.tsx
 * - feedbackHub/FeedbackHubTicketListSection.tsx
 * - feedbackHub/FeedbackHubStatsSection.tsx
 * - feedbackHub/FeedbackHubComposeForm.tsx
 */
import { cn } from '@/utils/cn';
import { safeCopyToClipboard } from '@/utils/clipboard';
import * as React from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { FeedbackTicket } from '../services/productDesktopApi';
import {
	feedbackSummaryQueryOptions,
	feedbackTicketsPagedInfiniteQueryOptions,
	type FeedbackKindFilter,
} from './feedbackQueryOptions';
import {
	feedbackListPageTotal,
	flattenUserFeedbackPages,
	isFeedbackListPage,
} from '../utils/feedbackPaged';
import {
	feedbackKindLabel,
	feedbackStatusLabel,
} from '../utils/feedbackLabels';
import {
	filterAndSortFeedbackTickets,
	type FeedbackStatusFilter,
} from '../utils/feedbackHubTicketFilters';
import {
	DEFAULT_FEEDBACK_LIST_FILTER_STATE,
	isFeedbackListFiltersActive,
} from '../utils/feedbackHubListFilterState';
import {
	DesktopAppContentWrapper,
	DesktopProductWorkspace,
} from './DesktopAppChrome';
import { FeedbackHubAppHeader } from './feedbackHub/FeedbackHubAppHeader';
import { FeedbackHubTicketListSection } from './feedbackHub/FeedbackHubTicketListSection';
import { FeedbackHubStatsSection } from './feedbackHub/FeedbackHubStatsSection';
import { FeedbackHubStatsSkeleton } from './feedbackHub/FeedbackHubStatsSkeleton';
import {
	FeedbackHubComposeForm,
	type FeedbackHubComposeFormHandle,
} from './feedbackHub/FeedbackHubComposeForm';
import { useFeedbackHubLayoutClasses } from './feedbackHub/useFeedbackHubLayoutClasses';
import { guideTourLabelsFromI18n } from '@/components/guided-tour/guideTourLabelsFromI18n';
import { SpotlightGuideModal } from '@/components/guided-tour/SpotlightGuideModal';
import { useBuiltGuideSteps } from '@/components/guided-tour/useBuiltGuideSteps';
import { useDesktopGuideTourOpener } from '@/pages/Desktop/hooks/useDesktopGuideTourOpener';
import {
	FEEDBACK_HUB_GUIDE_AUDIO_LS_KEY,
	FEEDBACK_HUB_GUIDE_ROOT_ID,
	FEEDBACK_HUB_GUIDE_STEP_DEFS,
	FEEDBACK_HUB_GUIDE_TOUR_FOLDER,
} from './feedbackHubGuideConstants';
import { isMobileFeedbackHubEmbeddedRoute } from '@/utils/mobileEmbeddedSpaRoute';
import { MOBILE_EMBEDDED_APP_ROOT_CLASS } from '@/components/mobileEmbedded/mobileEmbeddedLayoutTokens';

type KindFilter = FeedbackKindFilter;
type StatusFilter = FeedbackStatusFilter;

export type FeedbackHubAppProps = {
	/** Из трея: фокус в первом поле текста */
	initialQuickMode?: 'text';
	/** Предзаполнение основного поля (например из «Справочника»). */
	initialDraftBody?: string;
	/** MobileAndroid embedded WebView — compact shell, native toolbar owns title. */
	embeddedMobile?: boolean;
};

export default function FeedbackHubApp({
	initialQuickMode,
	initialDraftBody,
	embeddedMobile,
}: FeedbackHubAppProps): React.ReactElement {
	const embeddedMobileLayout =
		embeddedMobile ?? isMobileFeedbackHubEmbeddedRoute();
	const { t } = useTranslation('desktopUi', { keyPrefix: 'feedbackHub' });
	const { t: tFeedbackLabels } = useTranslation('desktopUi');
	const guideLabels = React.useMemo(
		() => guideTourLabelsFromI18n(t, 'guide'),
		[t]
	);
	const guideSteps = useBuiltGuideSteps(
		t,
		'guide.steps',
		FEEDBACK_HUB_GUIDE_STEP_DEFS
	);
	const [guideOpen, setGuideOpen] = React.useState(false);
	const [composeGuideLayoutKey, setComposeGuideLayoutKey] = React.useState('');
	const openGuideTour = React.useCallback(() => setGuideOpen(true), []);
	useDesktopGuideTourOpener(openGuideTour, {
		enabled: !embeddedMobileLayout,
	});
	const {
		feedbackHeaderStripClass,
		listToolbarClusterClass,
		listSearchInputClass,
		kindToggleClusterClass,
		sendActionBarClass,
	} = useFeedbackHubLayoutClasses();
	const composeFormRef = React.useRef<FeedbackHubComposeFormHandle | null>(
		null
	);
	const listSearchInputRef = React.useRef<HTMLInputElement | null>(null);

	const [kindFilter, setKindFilter] = React.useState<KindFilter>(
		DEFAULT_FEEDBACK_LIST_FILTER_STATE.kindFilter
	);
	const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(
		DEFAULT_FEEDBACK_LIST_FILTER_STATE.statusFilter
	);
	const [listQueryText, setListQueryText] = React.useState(
		DEFAULT_FEEDBACK_LIST_FILTER_STATE.listQueryText
	);
	const [newestFirst, setNewestFirst] = React.useState(
		DEFAULT_FEEDBACK_LIST_FILTER_STATE.newestFirst
	);
	const [highlightedId, setHighlightedId] = React.useState<string | null>(null);
	const highlightClearRef = React.useRef<number | null>(null);

	const summaryQuery = useQuery(feedbackSummaryQueryOptions());

	const listQuery = useInfiniteQuery(
		feedbackTicketsPagedInfiniteQueryOptions(kindFilter)
	);

	const tickets = React.useMemo(
		() => flattenUserFeedbackPages(listQuery.data?.pages),
		[listQuery.data?.pages]
	);

	const ticketSearchHaystack = React.useCallback(
		(ticket: FeedbackTicket) => [
			ticket.id,
			feedbackKindLabel(ticket.kind, tFeedbackLabels),
			feedbackStatusLabel(ticket.status, tFeedbackLabels),
		],
		[tFeedbackLabels]
	);

	const filteredTickets = React.useMemo(
		() =>
			filterAndSortFeedbackTickets(tickets, {
				kindFilter,
				statusFilter,
				query: listQueryText,
				newestFirst,
				searchHaystackForTicket: ticketSearchHaystack,
			}),
		[
			tickets,
			kindFilter,
			statusFilter,
			listQueryText,
			newestFirst,
			ticketSearchHaystack,
		]
	);

	const resetListFilters = React.useCallback(() => {
		setListQueryText(DEFAULT_FEEDBACK_LIST_FILTER_STATE.listQueryText);
		setKindFilter(DEFAULT_FEEDBACK_LIST_FILTER_STATE.kindFilter);
		setStatusFilter(DEFAULT_FEEDBACK_LIST_FILTER_STATE.statusFilter);
		setNewestFirst(DEFAULT_FEEDBACK_LIST_FILTER_STATE.newestFirst);
	}, []);

	const listFiltersActive = isFeedbackListFiltersActive({
		kindFilter,
		statusFilter,
		listQueryText,
		newestFirst,
	});

	const copyTicketId = React.useCallback(
		async (ticketId: string) => {
			const copied = await safeCopyToClipboard(ticketId);
			if (copied) {
				toast.success(t('ticketIdCopied'));
			} else {
				toast.error(t('ticketIdCopyError'));
			}
		},
		[t]
	);

	React.useEffect(() => {
		return () => {
			if (highlightClearRef.current) {
				clearTimeout(highlightClearRef.current);
			}
		};
	}, []);

	React.useEffect(() => {
		if (!listFiltersActive) return;
		const onKey = (e: KeyboardEvent): void => {
			if (e.key !== 'Escape') return;
			e.preventDefault();
			resetListFilters();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [listFiltersActive, resetListFilters]);

	React.useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			const target = e.target as HTMLElement | null;
			const inTextField = Boolean(
				target?.closest('input, textarea, [contenteditable="true"]')
			);
			if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
				if (inTextField && target !== listSearchInputRef.current) return;
				e.preventDefault();
				listSearchInputRef.current?.focus();
				listSearchInputRef.current?.select();
				return;
			}
			if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
				if (inTextField) return;
				e.preventDefault();
				listSearchInputRef.current?.focus();
				listSearchInputRef.current?.select();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	const firstPage = listQuery.data?.pages[0];
	const listTotal = isFeedbackListPage(firstPage)
		? feedbackListPageTotal(firstPage)
		: tickets.length;

	const loadedCount = tickets.length;
	const shownCount = filteredTickets.length;

	const sum = summaryQuery.data;

	const listStatusText = listQuery.isFetching
		? listQuery.isLoading
			? t('listStatusLoading')
			: t('listStatusUpdating')
		: listQuery.isError
			? t('listStatusError')
			: t('listStatusOk', {
					serverTotal: listTotal,
					loaded: loadedCount,
					shown: shownCount,
				});

	const refreshAriaLabel = listQuery.isFetching
		? t('refreshLoadingAria')
		: t('refreshAria');

	const focusNewTicketForm = React.useCallback(() => {
		composeFormRef.current?.focusMainMessage();
	}, []);

	const handleTicketCreated = React.useCallback((created: FeedbackTicket) => {
		if (highlightClearRef.current) clearTimeout(highlightClearRef.current);
		setHighlightedId(created.id);
		highlightClearRef.current = window.setTimeout(() => {
			setHighlightedId(null);
			highlightClearRef.current = null;
		}, 4000);
		window.setTimeout(() => {
			const el = document.getElementById(
				`feedback-ticket-article-${created.id}`
			);
			el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			if (el instanceof HTMLElement) {
				el.focus({ preventScroll: true });
			}
		}, 400);
	}, []);

	const handleComposeGuideLayoutChange = React.useCallback(
		(layoutKey: string) => {
			setComposeGuideLayoutKey(layoutKey);
		},
		[]
	);

	const prepareGuideStep = React.useCallback(
		(stepId: string) => {
			if (stepId === 'ticket-list') {
				document
					.querySelector('[data-feedback-hub-guide="ticket-list"]')
					?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}
			if (
				stepId === 'compose-kind' ||
				stepId === 'compose-form' ||
				stepId === 'preview' ||
				stepId === 'send-bar'
			) {
				focusNewTicketForm();
			}
		},
		[focusNewTicketForm]
	);

	return (
		<DesktopAppContentWrapper
			id={FEEDBACK_HUB_GUIDE_ROOT_ID}
			appComponent="FeedbackHubApp"
			data-feedback-hub-root={embeddedMobileLayout ? '1' : undefined}
			data-embedded-mobile={embeddedMobileLayout ? '1' : undefined}
			className={cn(
				'flex h-full min-h-0 flex-col bg-transparent',
				embeddedMobileLayout && MOBILE_EMBEDDED_APP_ROOT_CLASS
			)}
		>
			{embeddedMobileLayout ? <h1 className="sr-only">{t('title')}</h1> : null}
			<DesktopProductWorkspace
				data-testid="feedback-hub-product-workspace"
				className="min-h-0 flex-1"
				header={
					!embeddedMobileLayout ? (
						<FeedbackHubAppHeader
							headerStripClass={feedbackHeaderStripClass}
							summary={sum}
						/>
					) : undefined
				}
				contentClassName={cn(
					embeddedMobileLayout ? 'px-0 py-0' : 'px-3 py-3 sm:px-5 lg:px-6'
				)}
			>
				<div className="mx-auto flex w-full max-w-none flex-col gap-4">
					{sum ? (
						<FeedbackHubStatsSection
							embeddedMobileLayout={embeddedMobileLayout}
							summary={sum}
						/>
					) : summaryQuery.isLoading || summaryQuery.isFetching ? (
						<FeedbackHubStatsSkeleton
							embeddedMobileLayout={embeddedMobileLayout}
						/>
					) : null}
					<div
						className={cn(
							'grid grid-cols-1 gap-8',
							!embeddedMobileLayout && 'xl:grid-cols-2 xl:items-start xl:gap-10'
						)}
					>
						<div className={cn('min-w-0', embeddedMobileLayout && 'order-2')}>
							<FeedbackHubTicketListSection
								embeddedMobileLayout={embeddedMobileLayout}
								listStatusText={listStatusText}
								refreshAriaLabel={refreshAriaLabel}
								listToolbarClusterClass={listToolbarClusterClass}
								listSearchInputClass={listSearchInputClass}
								listSearchInputRef={listSearchInputRef}
								listQueryText={listQueryText}
								onListQueryTextChange={setListQueryText}
								kindFilter={kindFilter}
								onKindFilterChange={setKindFilter}
								statusFilter={statusFilter}
								onStatusFilterChange={setStatusFilter}
								newestFirst={newestFirst}
								onNewestFirstToggle={() => setNewestFirst((v) => !v)}
								listFiltersActive={listFiltersActive}
								onResetListFilters={resetListFilters}
								onRefresh={() => {
									void listQuery.refetch();
									void summaryQuery.refetch();
								}}
								isListLoading={listQuery.isLoading}
								isListError={listQuery.isError}
								isListFetching={listQuery.isFetching}
								isFetchingNextPage={listQuery.isFetchingNextPage}
								hasNextPage={Boolean(listQuery.hasNextPage)}
								onLoadMore={() => void listQuery.fetchNextPage()}
								ticketsLength={tickets.length}
								shownCount={shownCount}
								loadedCount={loadedCount}
								listTotal={listTotal}
								filteredTickets={filteredTickets}
								highlightedId={highlightedId}
								onCopyTicketId={copyTicketId}
								onFocusNewTicketForm={focusNewTicketForm}
							/>
						</div>

						<div className={cn('min-w-0', embeddedMobileLayout && 'order-1')}>
							<FeedbackHubComposeForm
								ref={composeFormRef}
								embeddedMobileLayout={embeddedMobileLayout}
								kindToggleClusterClass={kindToggleClusterClass}
								sendActionBarClass={sendActionBarClass}
								summary={sum}
								listKindFilter={kindFilter}
								initialQuickMode={initialQuickMode}
								initialDraftBody={initialDraftBody}
								onTicketCreated={handleTicketCreated}
								onGuideLayoutChange={handleComposeGuideLayoutChange}
							/>
						</div>
					</div>
				</div>
			</DesktopProductWorkspace>
			{!embeddedMobileLayout ? (
				<SpotlightGuideModal
					open={guideOpen}
					onClose={() => setGuideOpen(false)}
					rootId={FEEDBACK_HUB_GUIDE_ROOT_ID}
					steps={guideSteps}
					audioLocalStorageKey={FEEDBACK_HUB_GUIDE_AUDIO_LS_KEY}
					tourAudioFolder={FEEDBACK_HUB_GUIDE_TOUR_FOLDER}
					labels={guideLabels}
					onPrepareStep={prepareGuideStep}
					spotlightLayoutKey={`${guideOpen}-${composeGuideLayoutKey}`}
					dialogTitleId="feedback-hub-guide-title"
				/>
			) : null}
		</DesktopAppContentWrapper>
	);
}
