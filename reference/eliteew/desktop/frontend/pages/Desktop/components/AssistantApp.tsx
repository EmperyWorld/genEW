/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop «Справочник»: orchestration for FAQ query, chat stream, shell layout, guided tour.
 *
 * Invariants:
 * - FAQ-ответ в боковой панели и «Показать в чате» — без LLM; LLM-чат — через server-side Llama + FAQ/RAG.
 * - Deep links на приложения — через ProductAssistantMarkdown и desktopDeepLink.
 *
 * Related:
 * - pages/Desktop/services/productDesktopApi.ts
 * - api/routers/product_desktop.py
 * - components/assistant/AssistantAppHeader.tsx, useAssistantMessageStream.ts
 * - components/assistant/useAssistantChatHistory.ts, useAssistantChatScroll.ts
 * - components/assistant/AssistantGuideTour.tsx
 */
import { cn } from '@/utils/cn';
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useDesktopShellTheme } from '@/hooks/useDesktopShellTheme';
import { useDesktopShellFrame } from '../context/DesktopShellFrameContext';
import { DESKTOP_SURFACE } from '../constants';
import { useEmbeddedPortaledModalZIndex } from '../context/DesktopWindowPortalStackContext';
import {
	getDesktopShellFooterStripClassName,
	getDesktopShellHeaderStripClassName,
} from '../utils/desktopVisualSystem';
import {
	clearAssistantMessages,
	type AssistantChatMessage,
	type AssistantFaqEntry,
} from '../services/productDesktopApi';
import {
	assistantFaqQueryOptions,
	assistantMessagesQueryKey,
	assistantMessagesQueryOptions,
} from './assistantQueryOptions';
import {
	DesktopAppContentWrapper,
	DesktopProductWorkspace,
} from './DesktopAppChrome';
import { filterFaqEntries } from '../utils/assistantFaqSearch';
import {
	readAssistantLocalFaqMessages,
	writeAssistantLocalFaqMessages,
} from '../utils/assistantLocalFaqStorage';
import { isMobileHandbookEmbeddedRoute } from '@/utils/mobileEmbeddedSpaRoute';
import {
	MOBILE_EMBEDDED_COMPACT_HEADER_CLASS,
	MOBILE_EMBEDDED_HANDBOOK_CHAT_COLUMN_CLASS,
	MOBILE_EMBEDDED_HANDBOOK_ROOT_CLASS,
} from '@/components/mobileEmbedded/mobileEmbeddedLayoutTokens';
import { ASSISTANT_GUIDE_ROOT_ID } from './assistantGuideConstants';
import { AssistantAppHeader } from './assistant/AssistantAppHeader';
import { AssistantClearChatModal } from './assistant/AssistantClearChatModal';
import { AssistantGuideTour } from './assistant/AssistantGuideTour';
import { AssistantFaqPanel } from './assistant/AssistantFaqPanel';
import { buildAssistantFaqAsideClassName } from './assistant/buildAssistantFaqAsideClassName';
import { ASSISTANT_COMPOSER_MAX_HEIGHT_PX } from './assistant/assistantChatConstants';
import { formatAssistantStreamingSourcesHint } from './assistant/formatAssistantStreamingSources';
import { AssistantChatThreadPanel } from './assistant/AssistantChatThreadPanel';
import { AssistantComposerCluster } from './assistant/AssistantComposerCluster';
import {
	appendFaqQuestionToComposer,
	buildLocalFaqMessagesFromEntry,
} from './assistant/assistantFaqChatActions';
import { useAssistantMessageStream } from './assistant/useAssistantMessageStream';
import { useAssistantChatHistory } from './assistant/useAssistantChatHistory';
import {
	useAssistantChatAutoScroll,
	useAssistantChatScroll,
} from './assistant/useAssistantChatScroll';
import { useAssistantConversationActions } from './assistant/useAssistantConversationActions';
import { useAssistantFaqFlash } from './assistant/useAssistantFaqFlash';
import { useAssistantFaqSearchAccordion } from './assistant/useAssistantFaqSearchAccordion';
import { useAssistantKeyboardShortcuts } from './assistant/useAssistantKeyboardShortcuts';
import { useAssistantResponsiveFaqLayout } from './assistant/useAssistantResponsiveFaqLayout';
import { useAssistantShortcutsPanel } from './assistant/useAssistantShortcutsPanel';

export default function AssistantApp({
	embeddedMobile,
}: {
	/** MobileAndroid `#/mobile-handbook` — compact FAQ + chat layout. */
	embeddedMobile?: boolean;
} = {}): React.ReactElement {
	const { t, i18n } = useTranslation('desktopUi', { keyPrefix: 'assistant' });
	const shellFrame = useDesktopShellFrame();
	const shellTheme = useDesktopShellTheme();
	const embeddedMobileLayout =
		embeddedMobile ?? isMobileHandbookEmbeddedRoute();
	const embeddedModalZ = useEmbeddedPortaledModalZIndex();
	const qc = useQueryClient();
	const [input, setInput] = React.useState('');
	const [faqSearch, setFaqSearch] = React.useState('');
	const [clearing, setClearing] = React.useState(false);
	const [clearConfirmOpen, setClearConfirmOpen] = React.useState(false);
	const [localFaqMessages, setLocalFaqMessages] = React.useState<
		AssistantChatMessage[]
	>(() => readAssistantLocalFaqMessages());
	const faqSearchInputRef = React.useRef<HTMLInputElement | null>(null);
	const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
	const [faqSearchFocused, setFaqSearchFocused] = React.useState(false);
	const [composerFocused, setComposerFocused] = React.useState(false);
	const [streamAnnounced, setStreamAnnounced] = React.useState('');
	const prevSendingRef = React.useRef(false);
	const clearModalDescId = React.useId();

	const {
		layoutRootRef,
		faqMobileOpen,
		setFaqMobileOpen,
		showSuggestedFaqChips,
	} = useAssistantResponsiveFaqLayout({ embeddedMobileLayout });

	const {
		faqRefreshFlash,
		faqSearchFocusFlash,
		clearLocalFaqFlash,
		faqInsertFlashId,
		faqShowFlashId,
		faqAskFlashId,
		faqBulkActionFlash,
		setFaqBulkActionFlash,
		signalFaqRefreshFlash,
		signalFaqSearchFocusFlash,
		signalClearLocalFaqFlash,
		signalFaqInsertFlash,
		signalFaqShowFlash,
		signalFaqAskFlash,
	} = useAssistantFaqFlash();

	const {
		shortcutsOpen,
		setShortcutsOpen,
		shortcutsOpenFlash,
		shortcutsPanelRef,
		openShortcutsPanel,
	} = useAssistantShortcutsPanel({ embeddedMobileLayout });

	const faqQuery = useQuery(assistantFaqQueryOptions());
	const msgQuery = useQuery(assistantMessagesQueryOptions());
	const messages = msgQuery.data ?? [];

	const filteredFaq = React.useMemo(
		() => filterFaqEntries(faqQuery.data ?? [], faqSearch),
		[faqQuery.data, faqSearch]
	);

	const { openFaqIds, setOpenFaqIds } = useAssistantFaqSearchAccordion({
		faqSearch,
		filteredFaq,
	});

	const faq = faqQuery.data ?? [];

	useAssistantKeyboardShortcuts({
		faqCount: faq.length,
		embeddedMobileLayout,
		faqSearchInputRef,
		inputRef,
		setFaqMobileOpen,
		clearConfirmOpen,
		onDismissClearConfirm: () => setClearConfirmOpen(false),
	});

	const syncComposerHeight = React.useCallback(() => {
		const el = inputRef.current;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, ASSISTANT_COMPOSER_MAX_HEIGHT_PX)}px`;
	}, []);

	const {
		bottomRef,
		chatScrollRef,
		stickToBottomRef,
		nearBottom,
		setNearBottom,
		chatScrollFade,
		updateStickToBottom,
		scrollChatToBottom,
	} = useAssistantChatScroll();

	const {
		sending,
		streamingRaw,
		streamingMarkdown,
		pendingUserText,
		rateLimitSecondsLeft,
		streamStoppedFlash,
		streamingRagLabels,
		runSend,
		stopStream,
		faqAskDisabled,
		faqAskDisabledTitle,
		clearStreamState,
	} = useAssistantMessageStream({
		qc,
		messages,
		t,
		inputRef,
		syncComposerHeight,
		setInput,
		stickToBottomRef,
		setNearBottom,
	});

	const {
		displayMessages,
		olderMessages,
		recentMessages,
		allVisibleMessages,
		messageIndexById,
		lastPersistedAssistantId,
		historyRefreshFlash,
		refreshHistory,
	} = useAssistantChatHistory({
		messages,
		localFaqMessages,
		msgQuery,
		sending,
		clearing,
		t,
	});

	const {
		helpfulAckMessageId,
		copiedMessageFlashId,
		copyConversationFlash,
		downloadConversationFlash,
		copyMessageText,
		copyConversation,
		downloadConversation,
		acknowledgeHelpful,
		openFeedbackForExchange,
	} = useAssistantConversationActions({ displayMessages, t });

	useAssistantChatAutoScroll({
		bottomRef,
		stickToBottomRef,
		updateStickToBottom,
		sending,
		streamingRaw,
		displayMessagesLength: displayMessages.length,
		streamingMarkdownLength: streamingMarkdown.length,
		pendingUserText,
	});

	const headerClass = React.useMemo(
		() =>
			cn(
				'relative shrink-0 flex flex-col border-b border-(--desktop-border-subtle)',
				embeddedMobileLayout && MOBILE_EMBEDDED_COMPACT_HEADER_CLASS,
				'bg-[color-mix(in_srgb,var(--desktop-surface-panel)_28%,transparent)]',
				sending &&
					'border-b-[2px] border-b-[rgb(var(--desktop-accent-rgb)/0.52)]',
				localFaqMessages.length > 0 &&
					'bg-[color-mix(in_srgb,rgb(245_158_11)_5%,var(--desktop-surface-panel))]',
				!embeddedMobileLayout && getDesktopShellHeaderStripClassName(shellFrame)
			),
		[shellFrame, sending, localFaqMessages.length, embeddedMobileLayout]
	);

	const faqAsideClass = React.useMemo(
		() =>
			buildAssistantFaqAsideClassName({
				shellFrame,
				embeddedMobileLayout,
				faqSearch,
				faqSearchFocused,
			}),
		[shellFrame, faqSearch, faqSearchFocused, embeddedMobileLayout]
	);

	const composerClass = React.useMemo(
		() =>
			cn(
				'shrink-0 border-t border-(--desktop-border-subtle) p-2 flex gap-1.5',
				'bg-[color-mix(in_srgb,var(--desktop-surface-panel)_22%,transparent)]',
				DESKTOP_SURFACE.spacingMd,
				getDesktopShellFooterStripClassName(shellFrame),
				embeddedMobileLayout && 'mt-auto'
			),
		[shellFrame, embeddedMobileLayout]
	);

	const chatScrollWrapClass = React.useMemo(
		() =>
			cn('min-h-0 flex-1', embeddedMobileLayout ? 'flex flex-col' : 'relative'),
		[embeddedMobileLayout]
	);

	const chatScrollClass = React.useMemo(
		() =>
			cn(
				'overflow-y-auto scroll-smooth p-3 space-y-2',
				embeddedMobileLayout ? 'min-h-0 flex-1' : 'absolute inset-0'
			),
		[embeddedMobileLayout]
	);

	const refreshFaq = React.useCallback(async () => {
		const result = await faqQuery.refetch();
		if (result.isSuccess) {
			signalFaqRefreshFlash();
		}
	}, [faqQuery, signalFaqRefreshFlash]);

	React.useEffect(() => {
		writeAssistantLocalFaqMessages(localFaqMessages);
	}, [localFaqMessages]);

	React.useEffect(() => {
		if (prevSendingRef.current && !sending) {
			setStreamAnnounced(
				streamStoppedFlash
					? t('streamStoppedAnnounced')
					: t('streamingCompleteAnnounced')
			);
		}
		prevSendingRef.current = sending;
	}, [sending, streamStoppedFlash, t]);

	const streamingSourcesHint = React.useMemo(
		() => formatAssistantStreamingSourcesHint(streamingRagLabels, t),
		[streamingRagLabels, t]
	);

	const acknowledgeFaqAction = React.useCallback(
		(messageKey: string) => {
			toast.success(t(messageKey as Parameters<typeof t>[0]));
		},
		[t]
	);

	const suggestedFaq = React.useMemo(() => {
		const pool = faqSearch.trim() ? filteredFaq : faq;
		return pool.slice(0, 5);
	}, [faq, filteredFaq, faqSearch]);

	const runClearChatConfirmed = React.useCallback(async () => {
		if (clearing || sending) return;
		setClearing(true);
		try {
			await clearAssistantMessages();
			qc.setQueryData(assistantMessagesQueryKey(), []);
			setLocalFaqMessages([]);
			writeAssistantLocalFaqMessages([]);
			clearStreamState();
			toast.success(t('clearChatDone'));
			setClearConfirmOpen(false);
		} catch {
			toast.error(t('historyError'));
		} finally {
			setClearing(false);
		}
	}, [clearing, sending, qc, t, clearStreamState]);

	const openClearConfirm = React.useCallback(() => {
		if (clearing || sending || msgQuery.isLoading) return;
		const n = messages.length + localFaqMessages.length;
		if (n === 0 && !streamingRaw && !pendingUserText) return;
		setClearConfirmOpen(true);
	}, [
		clearing,
		sending,
		msgQuery.isLoading,
		messages.length,
		localFaqMessages.length,
		streamingRaw,
		pendingUserText,
	]);

	const showFaqInChat = React.useCallback(
		(f: AssistantFaqEntry) => {
			stickToBottomRef.current = true;
			const stamp = Date.now();
			const pair = buildLocalFaqMessagesFromEntry(f, { stamp });
			setLocalFaqMessages((prev) => [...prev, ...pair]);
			signalFaqShowFlash(`faq-s-${f.id}`);
			window.requestAnimationFrame(() => {
				bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
			});
		},
		[bottomRef, signalFaqShowFlash, stickToBottomRef]
	);

	const clearLocalFaq = React.useCallback(() => {
		if (localFaqMessages.length === 0) return;
		setLocalFaqMessages([]);
		writeAssistantLocalFaqMessages([]);
		signalClearLocalFaqFlash();
	}, [localFaqMessages.length, signalClearLocalFaqFlash]);

	const focusFaqSearch = React.useCallback(() => {
		setFaqMobileOpen(true);
		signalFaqSearchFocusFlash();
		window.requestAnimationFrame(() => {
			faqSearchInputRef.current?.focus();
		});
	}, [setFaqMobileOpen, signalFaqSearchFocusFlash]);

	const insertFaqQuestion = React.useCallback(
		(question: string, flashId?: string) => {
			setInput((prev) => appendFaqQuestionToComposer(prev, question));
			if (flashId) signalFaqInsertFlash(flashId);
			window.requestAnimationFrame(() => {
				inputRef.current?.focus();
				syncComposerHeight();
			});
		},
		[signalFaqInsertFlash, syncComposerHeight]
	);

	const tryAskFaq = React.useCallback(
		(question: string, flashId?: string) => {
			if (sending) return;
			if (rateLimitSecondsLeft > 0) {
				toast.message(t('rateLimitWait', { seconds: rateLimitSecondsLeft }));
				return;
			}
			if (flashId) signalFaqAskFlash(flashId);
			void runSend(question);
		},
		[runSend, rateLimitSecondsLeft, sending, signalFaqAskFlash, t]
	);

	return (
		<>
			<DesktopAppContentWrapper
				id={ASSISTANT_GUIDE_ROOT_ID}
				appComponent="AssistantApp"
				data-assistant-guide-root={embeddedMobileLayout ? '1' : undefined}
				data-embedded-mobile={embeddedMobileLayout ? '1' : undefined}
				className={cn(
					'flex min-h-0 h-full flex-col',
					embeddedMobileLayout && MOBILE_EMBEDDED_HANDBOOK_ROOT_CLASS,
					embeddedMobileLayout
						? 'bg-transparent text-(--me-text-primary)'
						: 'bg-transparent text-(--desktop-text-primary)'
				)}
			>
				<DesktopProductWorkspace
					data-testid="assistant-product-workspace"
					className="min-h-0 flex-1"
					header={
						<AssistantAppHeader
							headerClassName={headerClass}
							embeddedMobileLayout={embeddedMobileLayout}
							sending={sending}
							t={t}
							msgQuery={msgQuery}
							historyRefreshFlash={historyRefreshFlash}
							onRefreshHistory={() => void refreshHistory()}
							clearing={clearing}
							localFaqMessagesCount={localFaqMessages.length}
							displayMessagesCount={displayMessages.length}
							persistedMessagesCount={messages.length}
							streamingRaw={streamingRaw}
							pendingUserText={pendingUserText}
							streamingSourcesHint={streamingSourcesHint}
							streamAnnounced={streamAnnounced}
							copyConversationFlash={copyConversationFlash}
							downloadConversationFlash={downloadConversationFlash}
							clearLocalFaqFlash={clearLocalFaqFlash}
							onCopyConversation={() => void copyConversation()}
							onDownloadConversation={downloadConversation}
							onClearLocalFaq={clearLocalFaq}
							onOpenClearConfirm={openClearConfirm}
						/>
					}
					contentClassName="overflow-hidden !overflow-y-hidden flex min-h-0 flex-col"
				>
					<div
						ref={layoutRootRef}
						className={cn(
							'flex min-h-0 flex-1 flex-col gap-0',
							!embeddedMobileLayout && 'md:flex-row'
						)}
					>
						<AssistantFaqPanel
							asideClassName={faqAsideClass}
							embeddedMobileLayout={embeddedMobileLayout}
							faqMobileOpen={faqMobileOpen}
							onFaqMobileOpenChange={setFaqMobileOpen}
							faqQuery={faqQuery}
							faq={faq}
							filteredFaq={filteredFaq}
							faqSearch={faqSearch}
							onFaqSearchChange={setFaqSearch}
							faqSearchInputRef={faqSearchInputRef}
							faqSearchFocused={faqSearchFocused}
							onFaqSearchFocusedChange={setFaqSearchFocused}
							faqSearchFocusFlash={faqSearchFocusFlash}
							faqRefreshFlash={faqRefreshFlash}
							onRefreshFaq={refreshFaq}
							openFaqIds={openFaqIds}
							onOpenFaqIdsChange={setOpenFaqIds}
							faqBulkActionFlash={faqBulkActionFlash}
							onFaqBulkActionFlash={setFaqBulkActionFlash}
							sending={sending}
							copiedMessageFlashId={copiedMessageFlashId}
							faqInsertFlashId={faqInsertFlashId}
							faqShowFlashId={faqShowFlashId}
							faqAskFlashId={faqAskFlashId}
							faqAskDisabled={faqAskDisabled}
							faqAskDisabledTitle={faqAskDisabledTitle}
							onShowFaqInChat={showFaqInChat}
							onCopyMessageText={copyMessageText}
							onInsertFaqQuestion={insertFaqQuestion}
							onTryAskFaq={tryAskFaq}
							onFaqActionAck={acknowledgeFaqAction}
							t={t}
						/>
						<div
							className={cn(
								'flex min-h-0 min-w-0 flex-1 flex-col',
								embeddedMobileLayout &&
									MOBILE_EMBEDDED_HANDBOOK_CHAT_COLUMN_CLASS
							)}
						>
							<AssistantChatThreadPanel
								embeddedMobileLayout={embeddedMobileLayout}
								localFaqMessagesCount={localFaqMessages.length}
								onClearLocalFaq={clearLocalFaq}
								faqMobileOpen={faqMobileOpen}
								onFaqMobileOpenChange={setFaqMobileOpen}
								faqSearchInputRef={faqSearchInputRef}
								faq={faq}
								faqQueryLoading={faqQuery.isLoading}
								faqSearch={faqSearch}
								sending={sending}
								rateLimitSecondsLeft={rateLimitSecondsLeft}
								streamingBarVisible={sending}
								chatScrollWrapClass={chatScrollWrapClass}
								chatScrollClass={chatScrollClass}
								chatScrollRef={chatScrollRef}
								bottomRef={bottomRef}
								chatScrollFade={chatScrollFade}
								onChatScroll={updateStickToBottom}
								msgQuery={msgQuery}
								displayMessages={displayMessages}
								olderMessages={olderMessages}
								recentMessages={recentMessages}
								allVisibleMessages={allVisibleMessages}
								messageIndexById={messageIndexById}
								lastPersistedAssistantId={lastPersistedAssistantId}
								streamingRaw={streamingRaw}
								streamingMarkdown={streamingMarkdown}
								pendingUserText={pendingUserText}
								nearBottom={nearBottom}
								onScrollToBottom={scrollChatToBottom}
								suggestedFaq={showSuggestedFaqChips ? suggestedFaq : []}
								faqShowFlashId={faqShowFlashId}
								faqInsertFlashId={faqInsertFlashId}
								faqAskFlashId={faqAskFlashId}
								onShowFaqInChat={showFaqInChat}
								onInsertFaqQuestion={insertFaqQuestion}
								onTryAskFaq={tryAskFaq}
								language={i18n.language}
								t={t}
								helpfulAckMessageId={helpfulAckMessageId}
								copiedMessageFlashId={copiedMessageFlashId}
								faqAskDisabled={faqAskDisabled}
								faqAskDisabledTitle={faqAskDisabledTitle}
								onCopyMessageText={copyMessageText}
								onAcknowledgeHelpful={acknowledgeHelpful}
								onOpenFeedbackForExchange={openFeedbackForExchange}
								onFocusFaqSearch={focusFaqSearch}
							/>
							<AssistantComposerCluster
								composerClass={composerClass}
								embeddedMobileLayout={embeddedMobileLayout}
								input={input}
								onInputChange={setInput}
								inputRef={inputRef}
								composerFocused={composerFocused}
								onComposerFocusedChange={setComposerFocused}
								syncComposerHeight={syncComposerHeight}
								sending={sending}
								rateLimitSecondsLeft={rateLimitSecondsLeft}
								streamStoppedFlash={streamStoppedFlash}
								onSend={runSend}
								onStopStream={stopStream}
								onOpenShortcutsPanel={openShortcutsPanel}
								onFocusFaqSearch={focusFaqSearch}
								shortcutsOpen={shortcutsOpen}
								onShortcutsOpenChange={setShortcutsOpen}
								shortcutsOpenFlash={shortcutsOpenFlash}
								shortcutsPanelRef={shortcutsPanelRef}
								faqSearchFocused={faqSearchFocused}
								shellTheme={shellTheme}
								t={t}
							/>
						</div>
					</div>
				</DesktopProductWorkspace>
			</DesktopAppContentWrapper>
			{!embeddedMobileLayout ? (
				<AssistantGuideTour
					t={t}
					faqMobileOpen={faqMobileOpen}
					shortcutsOpen={shortcutsOpen}
					onFaqMobileOpenChange={setFaqMobileOpen}
					onShortcutsOpenChange={setShortcutsOpen}
				/>
			) : null}
			<AssistantClearChatModal
				open={clearConfirmOpen}
				clearing={clearing}
				modalZIndex={embeddedModalZ}
				descId={clearModalDescId}
				onDismiss={() => setClearConfirmOpen(false)}
				onConfirm={() => void runClearChatConfirmed()}
				t={t}
			/>
		</>
	);
}
