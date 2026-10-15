/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Main Desktop AI Chat window orchestrator: wires hooks and layout components.
 *
 * Invariants:
 * - Stream state must not leak across chats; domain logic lives in hooks under hooks/.
 *
 * Related:
 * - hooks/useDesktopAiChat*.ts, components/DesktopAiChat*.tsx
 */
import { useDesktopGuideTourOpener } from '@/pages/Desktop/hooks/useDesktopGuideTourOpener';
import * as React from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { transcribe, useMicRecorder } from '@/voice-core';
import {
	deleteDesktopAiChat,
	releaseDesktopAiChatStreamLock,
	saveDesktopAiBlueprintToProject,
	voiceGatewaySynthesize,
	type DesktopAiMessage,
} from './api/desktopChatClient';
import {
	DESKTOP_AI_CHAT_ROOT_ID,
	DesktopAiChatGuideModal,
} from './DesktopAiChatGuideModal';
import { DesktopEnsembleBlueprintCommandsModal } from './DesktopEnsembleBlueprintCommandsModal';
import { DesktopAiHeroDossierModal } from './DesktopAiHeroDossierModal';
import {
	DesktopAiChatBubbleContextMenu,
	type DesktopAiChatBubbleContextPayload,
} from './components/DesktopAiChatBubbleContextMenu';
import type { DesktopEnsembleCouncilUiState } from './ensemble';
import {
	desktopChatSideLabel,
	desktopHeroSileroVoice,
	getDesktopAiHero,
	heroAvatarPublicPath,
	isDesktopEnsembleChat,
} from './desktopAiHeroes';
import {
	DESKTOP_INTERACTIVE,
	DESKTOP_LUCIDE,
} from '../../pages/Desktop/constants';
import { useDesktopShellFrame } from '../../pages/Desktop/context/DesktopShellFrameContext';
import { useEmbeddedPortaledModalZIndex } from '../../pages/Desktop/context/DesktopWindowPortalStackContext';
import { useDesktopShellTheme } from '@/hooks/useDesktopShellTheme';
import { isDesktopLowGpuModeEnabled } from '@/pages/Desktop/runtime/desktopLowGpuMode';
import { useDesktopSurfaceLayout } from '../../pages/Desktop/hooks/useDesktopSurfaceLayout';
import { getContentErrorMessage } from '@/services/contentApi';
import { ConfirmDeleteModal } from '@/components/ui/modals/ConfirmDeleteModal';
import { DeleteConfirmModal } from '@/pages/MarketingCabinet/components/DeleteConfirmModal';
import { useDesktopAiChatList } from './hooks/useDesktopAiChatList';
import { useDesktopAiChatAttachments } from './hooks/useDesktopAiChatAttachments';
import { useDesktopAiChatEnsemble } from './hooks/useDesktopAiChatEnsemble';
import { useDesktopAiChatMessages } from './hooks/useDesktopAiChatMessages';
import { useDesktopAiChatProjects } from './hooks/useDesktopAiChatProjects';
import { useDesktopAiChatShellStyles } from './hooks/useDesktopAiChatShellStyles';
import { useDesktopAiChatSoloSlot } from './hooks/useDesktopAiChatSoloSlot';
import { useDesktopAiChatStream } from './hooks/useDesktopAiChatStream';
import { DesktopAiChatSidebar } from './components/DesktopAiChatSidebar';
import { DesktopAiChatMainHeader } from './components/DesktopAiChatMainHeader';
import { DesktopAiChatSettingsRail } from './components/DesktopAiChatSettingsRail';
import { DesktopAiChatContextBar } from './components/DesktopAiChatContextBar';
import { DesktopAiChatMessagesPane } from './components/DesktopAiChatMessagesPane';
import { DesktopAiChatStreamStatus } from './components/DesktopAiChatStreamStatus';
import { DesktopAiChatComposer } from './components/DesktopAiChatComposer';
import { DesktopAiChatModals } from './components/DesktopAiChatModals';
import { DesktopAiChatStatePanel } from './layout/DesktopAiChatStatePanel';
import { DesktopProductStatusBanner } from '../../pages/Desktop/components/DesktopAppChrome';
import {
	DESKTOP_AI_CHAT_COMPOSER_ID,
	DESKTOP_AI_CHAT_COMPOSER_OFFLINE_DESC_ID,
	DESKTOP_AI_CHAT_COMPOSER_TESTID,
	DESKTOP_AI_CHAT_MESSAGES_ID,
	DESKTOP_AI_CHAT_MESSAGES_TESTID,
} from './desktopAiChatDomIds';
import { isPersistedDesktopAiMessageId } from './utils/desktopAiChatMessageIds';
import {
	chatDraftKey,
	persistChatDraft,
	removeChatDraft,
} from './utils/desktopAiChatDraft';
import {
	buildChatMarkdownExport,
	downloadMarkdownFile,
} from './utils/desktopAiChatExport';
import {
	readHeaderCollapsed,
	writeHeaderCollapsed,
} from './utils/desktopAiChatFormatters';
import { writeChatPins } from './utils/desktopAiChatPins';
import {
	buildToolsTooltip,
	resolveDesktopChatModelLabel,
	shellClass,
} from './utils/desktopAiChatShellHelpers';
import { classifyStreamLockClearError } from './desktopChatStreamLockClear';
import type { DesktopAiWebSearchSource } from './desktopWebSearchSources';
import { UserMinusIcon } from '@heroicons/react/24/outline';

const ENTER_HINT_KEY = 'desktop_ai_chat_enter_hint_seen';

type DesktopAiChatPanelPrefs = {
	useTools: boolean;
	useWebSearch: boolean;
	voiceIn: boolean;
	voiceOut: boolean;
};

const DEFAULT_DESKTOP_AI_CHAT_PANEL_PREFS: DesktopAiChatPanelPrefs = {
	useTools: false,
	useWebSearch: false,
	voiceIn: false,
	voiceOut: false,
};

export interface DesktopAiChatAppProps {
	initialChatId?: string;
	initialAttachUnifiedContentId?: string;
	initialAttachSourceLabel?: string | null;
	initialComposerSeed?: string;
}

export const DesktopAiChatApp: React.FC<DesktopAiChatAppProps> = ({
	initialChatId,
	initialAttachUnifiedContentId,
	initialAttachSourceLabel,
	initialComposerSeed,
}) => {
	const { t, i18n } = useTranslation('desktopAiChat');
	const {
		surfaceRef,
		isCompact: isCompactSurface,
		isDense: isDenseSurface,
	} = useDesktopSurfaceLayout({
		compactWidth: 1040,
		compactHeight: 720,
		denseWidth: 1240,
		denseHeight: 820,
	});
	const shellTheme = useDesktopShellTheme();
	const lowGpu = React.useMemo(() => isDesktopLowGpuModeEnabled(), []);
	const shellFrame = useDesktopShellFrame();
	const embeddedModalZ = useEmbeddedPortaledModalZIndex();
	const lucideStroke = DESKTOP_LUCIDE.stroke;

	const {
		soloSlotStackedModalZ,
		shellNavAsideClass,
		shellMessagesPanelClass,
		shellComposerTextareaClass,
		shellComposerIconBtnClass,
		shellHeaderBarClusterClass,
		shellChatSearchInputClass,
		shellNewChatBtnClass,
		shellComposerStopBtnClass,
		shellHeaderCollapseBtnClass,
	} = useDesktopAiChatShellStyles({ shellFrame, embeddedModalZ });

	const {
		settings,
		chats,
		setChats,
		chatFilter,
		setChatFilter,
		activeId,
		setActiveId,
		activeChat,
		loadingList,
		listLoadState,
		retryListLoad,
		chatPins,
		setChatPins,
		titleDraft,
		setTitleDraft,
		titleEditChatId,
		setTitleEditChatId,
		setSoloSlotTariffs,
		filteredChats,
		togglePinChat,
		saveChatTitle,
		cancelTitleEdit,
	} = useDesktopAiChatList({ initialChatId, t });

	const featureOn = settings.feature_enabled !== false;

	const {
		useProjectRag,
		setUseProjectRag,
		projectId,
		projectMenuOpen,
		setProjectMenuOpen,
		projectQuery,
		setProjectQuery,
		projectMenuRef,
		projectSearchInputRef,
		filteredProjects,
		selectedProjectName,
		applyProjectBinding,
	} = useDesktopAiChatProjects({
		activeId,
		chats,
		setChats,
		featureEnabled: featureOn,
		t,
	});

	const [input, setInput] = React.useState('');
	const [sending, setSending] = React.useState(false);

	const {
		messages,
		setMessages,
		messagesTotal,
		messagesLoading,
		messagesLoadState,
		retryLoadMessages,
		messagesLoadingOlder,
		messageListEntries,
		showLoadOlderMessages,
		handleLoadOlderMessages,
		applyTailReplace,
		applyTailMergeAfterStream,
		scrollRef,
		showScrollDown,
		setShowScrollDown,
		stickToBottomRef,
		onMessagesScroll,
		scrollMessagesToBottom,
		assistantContextByMessageId,
		setAssistantContextByMessageId,
		webSearchSourcesByMessageId,
		setWebSearchSourcesByMessageId,
		userMessageDeleteTarget,
		setUserMessageDeleteTarget,
		userMessageDeleteLoading,
		pendingUserMessageDeleteCount,
		truncateUserMessageConfirmed,
	} = useDesktopAiChatMessages({
		activeId,
		setChats,
		sending,
		i18nLanguage: i18n.language,
		t,
	});

	const {
		attachments,
		setAttachments,
		attachRef,
		refreshAttachments,
		onAttach,
		onDropFiles,
		onDragOverFiles,
		warnAttachNeedsChat,
	} = useDesktopAiChatAttachments({
		activeId,
		t,
		initialAttachUnifiedContentId,
		initialAttachSourceLabel,
	});

	const {
		isEnsembleActive,
		ensembleRosterHeroes,
		ensembleRosterSubtitle,
		ensembleRoutingMode,
		ensembleRoutingModeLabel,
		ensembleRoutingMenuRef,
		ensembleRoutingMenuOpen,
		setEnsembleRoutingMenuOpen,
		ensembleDocConfirm,
		setEnsembleDocConfirm,
		ensembleRoutingBusy,
		ensemblePlanCommandsOpen,
		setEnsemblePlanCommandsOpen,
		ensemblePlanCommands,
		ensemblePlanCommandsLoading,
		ensemblePlanCommandsErr,
		ensembleSelectedIds,
		setEnsembleSelectedIds,
		defaultEnsembleHeroIds,
		toggleEnsembleHeroPick,
		loadEnsemblePlanCommands,
		applyEnsembleRoutingMode,
		openEnsembleRoutingMenu,
	} = useDesktopAiChatEnsemble({
		activeChat,
		activeId,
		messages,
		settings,
		setChats,
		setProjectMenuOpen,
		t,
	});

	const activeHeroLabel = activeChat
		? desktopChatSideLabel(activeChat.settings)
		: null;
	const assistantHeaderLabel = activeHeroLabel ?? t('defaultAssistant');
	const activeHeroId =
		activeChat &&
		!isDesktopEnsembleChat(activeChat.settings) &&
		typeof activeChat.settings?.desktop_hero_id === 'string'
			? activeChat.settings.desktop_hero_id
			: null;
	const soloSendsBlocked = Boolean(
		activeChat &&
			!isDesktopEnsembleChat(activeChat.settings) &&
			activeChat.solo_slot_active !== true
	);
	const soloCanReleaseConsultant = Boolean(
		activeChat &&
			!isDesktopEnsembleChat(activeChat.settings) &&
			(activeChat.solo_slot_active === true ||
				activeChat.solo_slot_ends_at != null ||
				(typeof activeChat.settings?.desktop_hero_id === 'string' &&
					activeChat.settings.desktop_hero_id.trim() !== ''))
	);

	const solo = useDesktopAiChatSoloSlot({
		activeId,
		setActiveId,
		activeChat,
		activeHeroId,
		soloCanReleaseConsultant,
		chats,
		setChats,
		setSoloSlotTariffs,
		ensembleSelectedIds,
		setEnsembleSelectedIds,
		defaultEnsembleHeroIds,
		t,
	});

	const [headerCollapsed, setHeaderCollapsed] =
		React.useState(readHeaderCollapsed);
	const [panelPrefsByChatId, setPanelPrefsByChatId] = React.useState<
		Record<string, DesktopAiChatPanelPrefs>
	>({});
	const [showEnterHint, setShowEnterHint] = React.useState(() => {
		try {
			return localStorage.getItem(ENTER_HINT_KEY) !== '1';
		} catch {
			return true;
		}
	});
	const [sttBusy, setSttBusy] = React.useState(false);
	const [toolsHistory, setToolsHistory] = React.useState<
		Array<{ at: number; summary: string; sources: DesktopAiWebSearchSource[] }>
	>([]);
	const [deleteChatConfirmOpen, setDeleteChatConfirmOpen] =
		React.useState(false);
	const [deleteChatBusy, setDeleteChatBusy] = React.useState(false);
	const [streamErrorBanner, setStreamErrorBanner] = React.useState<{
		message: string;
		retryable: boolean;
		canClearStreamLock?: boolean;
	} | null>(null);
	const [streamLockClearBusy, setStreamLockClearBusy] = React.useState(false);
	const [composerHint, setComposerHint] = React.useState<string | null>(null);
	const [ensembleCouncilUi, setEnsembleCouncilUi] =
		React.useState<DesktopEnsembleCouncilUiState | null>(null);
	const [ttsBusy, setTtsBusy] = React.useState(false);
	const [saveBlueprintToProjectBusyId, setSaveBlueprintToProjectBusyId] =
		React.useState<string | null>(null);
	const [bubbleCtxMenu, setBubbleCtxMenu] =
		React.useState<DesktopAiChatBubbleContextPayload | null>(null);
	const [heroDossierOpen, setHeroDossierOpen] = React.useState(false);
	const [dossierHeroId, setDossierHeroId] = React.useState<string | null>(null);
	const [chatGuideOpen, setChatGuideOpen] = React.useState(false);
	const [chatGuideMountKey, setChatGuideMountKey] = React.useState(0);
	const [networkOnline, setNetworkOnline] = React.useState(
		() =>
			typeof navigator === 'undefined' ||
			typeof navigator.onLine !== 'boolean' ||
			navigator.onLine
	);

	const audioRef = React.useRef<HTMLAudioElement | null>(null);
	const appliedDesktopAiComposerSeedRef = React.useRef(false);
	const skipTtsRef = React.useRef(false);
	const sttCancelNextBlobRef = React.useRef(false);
	const inputRef = React.useRef(input);
	inputRef.current = input;

	const sttMic = useMicRecorder({
		onError: (err) => {
			toast.error(err.message || t('micPermissionDenied'));
		},
	});
	const sttMicRef = React.useRef(sttMic);
	sttMicRef.current = sttMic;
	const sttLevelMeterRef = React.useRef<HTMLDivElement>(null);

	React.useLayoutEffect(() => {
		const el = sttLevelMeterRef.current;
		if (!el || !sttMic.isRecording) return;
		el.style.setProperty(
			'--stt-level',
			`${Math.min(100, (sttMic.level / 255) * 100)}%`
		);
	}, [sttMic.isRecording, sttMic.level]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: stop mic/TTS on chat switch
	React.useEffect(() => {
		const mic = sttMicRef.current;
		if (mic.isRecording) {
			sttCancelNextBlobRef.current = true;
			void mic.stop().catch(() => {});
		}
		const a = audioRef.current;
		if (a) {
			a.pause();
			a.removeAttribute('src');
			a.load();
		}
		setTtsBusy(false);
	}, [activeId]);

	const setPanelPref = React.useCallback(
		(patch: Partial<DesktopAiChatPanelPrefs>) => {
			if (!activeId) return;
			setPanelPrefsByChatId((prev) => ({
				...prev,
				[activeId]: {
					...(prev[activeId] ?? DEFAULT_DESKTOP_AI_CHAT_PANEL_PREFS),
					...patch,
				},
			}));
		},
		[activeId]
	);

	const panelPrefs = React.useMemo(
		() =>
			activeId
				? (panelPrefsByChatId[activeId] ?? DEFAULT_DESKTOP_AI_CHAT_PANEL_PREFS)
				: DEFAULT_DESKTOP_AI_CHAT_PANEL_PREFS,
		[activeId, panelPrefsByChatId]
	);
	const { useTools, useWebSearch, voiceIn, voiceOut } = panelPrefs;
	const voiceAllowed = settings.voice_enabled !== false;
	const heroIdForDossier = dossierHeroId ?? activeHeroId;
	const activeHeroAvatarPath = heroAvatarPublicPath(activeHeroId);
	const toolsHint = React.useMemo(
		() => buildToolsTooltip(settings, t),
		[settings, t]
	);
	const resolvedModelLabel = React.useMemo(
		() => resolveDesktopChatModelLabel(activeChat, settings, t),
		[activeChat, settings, t]
	);

	const playTts = React.useCallback(
		async (text: string) => {
			if (!voiceOut || !voiceAllowed || !text.trim()) return;
			if (skipTtsRef.current) {
				skipTtsRef.current = false;
				return;
			}
			setTtsBusy(true);
			try {
				const url = await voiceGatewaySynthesize(text, {
					voice: desktopHeroSileroVoice(activeHeroId),
				});
				if (!audioRef.current) audioRef.current = new Audio();
				audioRef.current.src = url;
				await audioRef.current.play();
			} catch {
				toast.error(t('voiceOutFailed'));
			} finally {
				setTtsBusy(false);
			}
		},
		[voiceOut, voiceAllowed, activeHeroId, t]
	);

	const {
		activeIdRef,
		handleSend,
		handleRegenerate,
		handleEnsembleDocumentConfirm,
		handleStopStream,
		handleRetryLastStream,
		abortActiveStream,
	} = useDesktopAiChatStream({
		activeId,
		featureOn,
		sending,
		setSending,
		input,
		setInput,
		messages,
		setMessages,
		chats,
		settings,
		useTools,
		useWebSearch,
		ensembleDocConfirm,
		setEnsembleDocConfirm,
		soloSendsBlocked,
		setSoloSlotModalOpen: solo.setSoloSlotModalOpen,
		setStreamErrorBanner,
		setComposerHint,
		setShowScrollDown,
		setToolsHistory,
		setEnsembleCouncilUi,
		setAssistantContextByMessageId,
		setWebSearchSourcesByMessageId,
		stickToBottomRef,
		skipTtsRef,
		applyTailMergeAfterStream,
		applyTailReplace,
		refreshAttachments,
		playTts,
		t,
	});

	const openChatGuideTour = React.useCallback(() => {
		flushSync(() => {
			setChatGuideMountKey((k) => k + 1);
			setChatGuideOpen(true);
		});
	}, []);
	useDesktopGuideTourOpener(openChatGuideTour);

	React.useEffect(() => {
		stickToBottomRef.current = true;
		setShowScrollDown(false);
		if (!activeId) {
			setInput('');
			setAttachments([]);
			return;
		}
		let saved = '';
		try {
			saved = localStorage.getItem(chatDraftKey(activeId)) ?? '';
		} catch {
			/* */
		}
		const seed = initialComposerSeed?.trim();
		if (seed && !appliedDesktopAiComposerSeedRef.current) {
			appliedDesktopAiComposerSeedRef.current = true;
			const s = saved.trim();
			setInput(s ? `${seed}\n\n${s}` : seed);
		} else {
			setInput(saved);
		}
		void refreshAttachments();
		return () => persistChatDraft(activeId, inputRef.current);
	}, [
		activeId,
		refreshAttachments,
		initialComposerSeed,
		setAttachments,
		setShowScrollDown,
		stickToBottomRef,
	]);

	React.useEffect(() => {
		warnAttachNeedsChat(loadingList, chats.length);
	}, [warnAttachNeedsChat, loadingList, chats.length]);

	React.useEffect(() => {
		const sync = () => setNetworkOnline(navigator.onLine);
		window.addEventListener('online', sync);
		window.addEventListener('offline', sync);
		return () => {
			window.removeEventListener('online', sync);
			window.removeEventListener('offline', sync);
		};
	}, []);

	const toggleHeaderCollapsed = React.useCallback(() => {
		setHeaderCollapsed((v) => {
			const next = !v;
			writeHeaderCollapsed(next);
			return next;
		});
	}, []);

	const prepareChatGuideStep = React.useCallback((stepId: string) => {
		if (stepId === 'settings') {
			setHeaderCollapsed(false);
			writeHeaderCollapsed(false);
		}
	}, []);

	const handleClearStreamLock = () => {
		if (!activeId || streamLockClearBusy || sending) return;
		setStreamLockClearBusy(true);
		void (async () => {
			try {
				await releaseDesktopAiChatStreamLock(activeId);
				setStreamErrorBanner(null);
				toast.success(t('streamLockClearedToast'));
			} catch (err) {
				const cls = classifyStreamLockClearError(err);
				const msg =
					cls.rawMessage && cls.kind === 'generic'
						? cls.rawMessage
						: t(cls.messageKey);
				toast.error(msg);
			} finally {
				setStreamLockClearBusy(false);
			}
		})();
	};

	const handleDeleteChat = async () => {
		if (!activeId) return;
		setDeleteChatBusy(true);
		try {
			abortActiveStream();
			const id = activeId;
			removeChatDraft(id);
			setInput('');
			if (titleEditChatId === id) {
				setTitleEditChatId(null);
				setTitleDraft('');
			}
			setChatPins((prev) => {
				const next = prev.filter((x) => x !== id);
				if (next.length !== prev.length) writeChatPins(next);
				return next;
			});
			await deleteDesktopAiChat(id);
			setChats((prev) => prev.filter((x) => x.id !== id));
			setPanelPrefsByChatId((prev) => {
				const { [id]: _removed, ...rest } = prev;
				return rest;
			});
			setActiveId(null);
			setDeleteChatConfirmOpen(false);
		} finally {
			setDeleteChatBusy(false);
		}
	};

	const requestDeleteChat = () => {
		if (!activeId || sending) return;
		setDeleteChatConfirmOpen(true);
	};

	const dismissEnterHint = () => {
		setShowEnterHint(false);
		try {
			localStorage.setItem(ENTER_HINT_KEY, '1');
		} catch {
			/* ignore */
		}
	};

	const focusComposer = React.useCallback(() => {
		const el = document.getElementById(DESKTOP_AI_CHAT_COMPOSER_ID);
		if (el instanceof HTMLElement) {
			el.focus();
		}
	}, []);

	const handleExportMd = () => {
		if (!activeId || !activeChat) return;
		const md = buildChatMarkdownExport(
			activeChat.title || t('defaultChatTitle'),
			messages,
			t,
			i18n.language
		);
		const slug = (activeChat.title || t('exportSlugFallback'))
			.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, '_')
			.slice(0, 72);
		downloadMarkdownFile(
			`desktop-ai-chat_${slug}_${activeId.slice(0, 8)}.md`,
			md
		);
		toast.success(t('exportDownloadedToast'));
	};

	const handleExportBlueprintMarkdown = React.useCallback(
		(m: DesktopAiMessage) => {
			const content = (m.content || '').trim();
			if (!content) return;
			const meta = m.metadata;
			const tplTitle =
				typeof meta?.plan_template_title === 'string'
					? meta.plan_template_title.trim()
					: '';
			const slug = (tplTitle || t('structuredPlanFallback'))
				.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, '_')
				.slice(0, 72);
			downloadMarkdownFile(
				`desktop-ai-blueprint_${slug}_${m.id.slice(0, 8)}.md`,
				content
			);
			toast.success(t('exportDownloadedToast'));
		},
		[t]
	);

	const handleSaveBlueprintToProject = React.useCallback(
		async (m: DesktopAiMessage) => {
			if (!activeChat?.project_id || !isPersistedDesktopAiMessageId(m.id))
				return;
			setSaveBlueprintToProjectBusyId(m.id);
			try {
				const meta = m.metadata;
				const tplId =
					typeof meta?.plan_template_id === 'string'
						? meta.plan_template_id.trim()
						: '';
				const tplTitle =
					typeof meta?.plan_template_title === 'string'
						? meta.plan_template_title.trim()
						: '';
				const displayName = t('saveBlueprintContentName', {
					chat: (activeChat.title || t('defaultChatTitle')).slice(0, 80),
					template: tplTitle || tplId || t('saveBlueprintTemplateFallback'),
				});
				const description = t('saveBlueprintDescription', {
					chatId: activeChat.id,
					messageId: m.id,
					templateId: tplId || '—',
				});
				const { id } = await saveDesktopAiBlueprintToProject({
					projectId: activeChat.project_id,
					companyId: activeChat.company_id,
					displayName,
					description,
					message: m,
				});
				toast.success(t('saveBlueprintToProjectToast', { id: id.slice(0, 8) }));
			} catch (e) {
				toast.error(
					`${t('saveBlueprintToProjectErr')}: ${getContentErrorMessage(e)}`
				);
			} finally {
				setSaveBlueprintToProjectBusyId(null);
			}
		},
		[activeChat, t]
	);

	const handleMicStt = async () => {
		if (!voiceAllowed || !voiceIn || sttBusy || sending) return;
		if (sttMic.isRecording) {
			setSttBusy(true);
			const chatWhenStopped = activeIdRef.current;
			try {
				const blob = await sttMic.stop();
				if (sttCancelNextBlobRef.current) {
					sttCancelNextBlobRef.current = false;
					toast.message(t('sttCancelledToast'));
					return;
				}
				if (blob && blob.size > 0) {
					const file = new File(
						[blob],
						`desktop-ai-chat-stt-${Date.now()}.webm`,
						{ type: blob.type || 'audio/webm' }
					);
					const result = await transcribe(file, { language: 'ru' });
					const text = (result.text ?? '').trim();
					if (
						text &&
						chatWhenStopped &&
						chatWhenStopped === activeIdRef.current
					) {
						setInput((x) => {
							const n = x ? `${x}\n${text}` : text;
							persistChatDraft(chatWhenStopped, n);
							return n;
						});
					}
				} else if (blob && blob.size === 0) {
					toast.message(t('sttEmptyToast'));
				}
			} catch {
				toast.error(t('sttFailedToast'));
			} finally {
				setSttBusy(false);
			}
			return;
		}
		await sttMic.start();
		sttCancelNextBlobRef.current = false;
	};

	const copyBubble = async (content: string) => {
		try {
			await navigator.clipboard.writeText(content);
			toast.success(t('copiedToast'));
		} catch {
			toast.error(t('copyFailedToast'));
		}
	};

	if (!featureOn) {
		return (
			<div
				className={`${shellClass(shellTheme)} items-center justify-center p-6`}
			>
				<DesktopAiChatStatePanel
					state="permissionDenied"
					title={t('featureDisabledPanel.title')}
					description={t('featureDisabledPanel.description')}
					className="min-h-0 w-full max-w-md"
				/>
			</div>
		);
	}

	return (
		<div
			id={DESKTOP_AI_CHAT_ROOT_ID}
			ref={surfaceRef}
			className={`${shellClass(shellTheme)} text-(--desktop-text-primary)`}
		>
			<div
				className={`flex min-h-0 flex-1 overflow-x-hidden ${
					isCompactSurface ? 'flex-col' : 'flex-col lg:flex-row'
				}`}
			>
				<DesktopAiChatSidebar
					filteredChats={filteredChats}
					loadingList={loadingList}
					listLoadState={listLoadState}
					onRetryListLoad={retryListLoad}
					activeId={activeId}
					chatPins={chatPins}
					titleEditChatId={titleEditChatId}
					titleDraft={titleDraft}
					setTitleDraft={setTitleDraft}
					setActiveId={setActiveId}
					setTitleEditChatId={setTitleEditChatId}
					saveChatTitle={saveChatTitle}
					cancelTitleEdit={cancelTitleEdit}
					togglePinChat={togglePinChat}
					onOpenHeroPicker={solo.openHeroPicker}
					chatFilter={chatFilter}
					setChatFilter={setChatFilter}
					shellNavAsideClass={shellNavAsideClass}
					shellNewChatBtnClass={shellNewChatBtnClass}
					shellChatSearchInputClass={shellChatSearchInputClass}
					isCompactSurface={isCompactSurface}
					shellTheme={shellTheme}
					lucideStroke={lucideStroke}
					t={t}
				/>
				<main
					className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${
						isDenseSurface ? 'm-2 gap-2' : 'm-3 gap-3'
					}`}
					aria-label={t('chatMainLandmark')}
					onDrop={onDropFiles}
					onDragOver={onDragOverFiles}
				>
					{!networkOnline ? (
						<DesktopProductStatusBanner
							tone="warning"
							title={t('offlineBannerTitle')}
							description={t('offlineBanner')}
							className="rounded-lg"
						/>
					) : null}
					<a
						href={`#${DESKTOP_AI_CHAT_MESSAGES_ID}`}
						className={`sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 rounded-xl px-3 py-2 text-xs outline-none ${DESKTOP_INTERACTIVE.btnPrimary}`}
					>
						{t('skipToMessages')}
					</a>
					<header className="relative flex min-w-0 flex-col gap-1.5 px-1">
						<DesktopAiChatMainHeader
							isCompactSurface={isCompactSurface}
							shellHeaderBarClusterClass={shellHeaderBarClusterClass}
							shellHeaderCollapseBtnClass={shellHeaderCollapseBtnClass}
							isEnsembleActive={isEnsembleActive}
							ensembleRosterHeroes={ensembleRosterHeroes}
							assistantHeaderLabel={assistantHeaderLabel}
							ensembleRosterSubtitle={ensembleRosterSubtitle}
							activeHeroAvatarPath={activeHeroAvatarPath}
							activeChat={activeChat}
							soloSlotCountdownLabel={solo.soloSlotCountdownLabel}
							soloCanReleaseConsultant={soloCanReleaseConsultant}
							releaseConsultantBusy={solo.releaseConsultantBusy}
							sending={sending}
							headerCollapsed={headerCollapsed}
							activeId={activeId}
							messagesCount={messages.length}
							onOpenEnsembleDossier={() => {
								setDossierHeroId(ensembleRosterHeroes[0]?.id ?? null);
								setHeroDossierOpen(true);
							}}
							onOpenHeroDossier={() => setHeroDossierOpen(true)}
							onOpenReleaseConsultantModal={() =>
								solo.setReleaseConsultantModalOpen(true)
							}
							onOpenEnsemblePlanCommands={() => {
								setEnsemblePlanCommandsOpen(true);
								void loadEnsemblePlanCommands();
							}}
							onToggleHeaderCollapsed={toggleHeaderCollapsed}
							onExportMd={handleExportMd}
							onDeleteChat={requestDeleteChat}
							lucideStroke={lucideStroke}
							t={t}
						/>
						{!headerCollapsed ? (
							<div className="flex flex-col gap-1.5 border-t border-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.05)_100%,transparent)] pt-1.5">
								<DesktopAiChatSettingsRail
									activeChat={activeChat}
									settings={settings}
									useProjectRag={useProjectRag}
									setUseProjectRag={setUseProjectRag}
									projectId={projectId}
									projectMenuRef={projectMenuRef}
									projectMenuOpen={projectMenuOpen}
									setProjectMenuOpen={setProjectMenuOpen}
									projectQuery={projectQuery}
									setProjectQuery={setProjectQuery}
									projectSearchInputRef={projectSearchInputRef}
									filteredProjects={filteredProjects}
									selectedProjectName={selectedProjectName}
									onApplyProjectBinding={applyProjectBinding}
									useTools={useTools}
									useWebSearch={useWebSearch}
									voiceIn={voiceIn}
									voiceOut={voiceOut}
									voiceAllowed={voiceAllowed}
									setPanelPref={setPanelPref}
									toolsHint={toolsHint}
									isEnsembleActive={isEnsembleActive}
									ensembleRoutingMenuRef={ensembleRoutingMenuRef}
									ensembleRoutingMenuOpen={ensembleRoutingMenuOpen}
									ensembleRoutingMode={ensembleRoutingMode}
									ensembleRoutingModeLabel={ensembleRoutingModeLabel}
									ensembleRoutingBusy={ensembleRoutingBusy}
									onEnsembleRoutingToggle={openEnsembleRoutingMenu}
									onEnsembleRoutingSelect={(mode) => {
										void applyEnsembleRoutingMode(mode);
									}}
									onCloseEnsembleRoutingMenu={() =>
										setEnsembleRoutingMenuOpen(false)
									}
									lucideStroke={lucideStroke}
									t={t}
								/>
							</div>
						) : null}
					</header>
					<DesktopAiChatContextBar
						activeChat={activeChat}
						activeId={activeId}
						attachments={attachments}
						selectedProjectName={selectedProjectName}
						lucideStroke={lucideStroke}
						t={t}
					/>
					<DesktopAiChatMessagesPane
						scrollRef={scrollRef}
						messagesRegionId={DESKTOP_AI_CHAT_MESSAGES_ID}
						messagesTestId={DESKTOP_AI_CHAT_MESSAGES_TESTID}
						shellMessagesPanelClass={shellMessagesPanelClass}
						showLoadOlderMessages={showLoadOlderMessages}
						messages={messages}
						messagesTotal={messagesTotal}
						messagesLoadingOlder={messagesLoadingOlder}
						onLoadOlderMessages={handleLoadOlderMessages}
						loadingList={loadingList}
						activeId={activeId}
						chatsCount={chats.length}
						messagesLoading={messagesLoading}
						messagesLoadState={messagesLoadState}
						onRetryLoadMessages={retryLoadMessages}
						sending={sending}
						isEnsembleActive={isEnsembleActive}
						ensembleRosterSubtitle={ensembleRosterSubtitle}
						messageListEntries={messageListEntries}
						activeChat={activeChat}
						activeHeroId={activeHeroId}
						assistantHeaderLabel={assistantHeaderLabel}
						ensembleDocConfirm={ensembleDocConfirm}
						soloSendsBlocked={soloSendsBlocked}
						assistantContextByMessageId={assistantContextByMessageId}
						webSearchSourcesByMessageId={webSearchSourcesByMessageId}
						saveBlueprintToProjectBusyId={saveBlueprintToProjectBusyId}
						showScrollDown={showScrollDown}
						lowGpu={lowGpu}
						onMessagesScroll={onMessagesScroll}
						scrollMessagesToBottom={scrollMessagesToBottom}
						onRegenerate={handleRegenerate}
						onCopyBubble={copyBubble}
						onDeleteUserMessage={setUserMessageDeleteTarget}
						onSaveBlueprintToProject={handleSaveBlueprintToProject}
						onExportBlueprintMarkdown={handleExportBlueprintMarkdown}
						onOpenBubbleHeroDossier={(heroId) => {
							setDossierHeroId(heroId);
							setHeroDossierOpen(true);
						}}
						onBubbleContextMenu={setBubbleCtxMenu}
						i18nLanguage={i18n.language}
						lucideStroke={lucideStroke}
						onOpenNewChat={solo.openHeroPicker}
						onFocusComposer={focusComposer}
						t={t}
					/>
					<DesktopAiChatStreamStatus
						streamErrorBanner={streamErrorBanner}
						streamLockClearBusy={streamLockClearBusy}
						onClearStreamLock={handleClearStreamLock}
						onRetryLastStream={handleRetryLastStream}
						toolsHistory={toolsHistory}
						i18nLanguage={i18n.language}
						lucideStroke={lucideStroke}
						t={t}
					/>
					<DesktopAiChatComposer
						voiceAllowed={voiceAllowed}
						voiceIn={voiceIn}
						sttBusy={sttBusy}
						ttsBusy={ttsBusy}
						sttMic={sttMic}
						isEnsembleActive={isEnsembleActive}
						ensembleCouncilUi={ensembleCouncilUi}
						ensembleDocConfirm={ensembleDocConfirm}
						soloSendsBlocked={soloSendsBlocked}
						ugsCreditsBalance={solo.ugsCreditsBalance}
						composerHint={composerHint}
						showEnterHint={showEnterHint}
						networkOnline={networkOnline}
						sttLevelMeterRef={sttLevelMeterRef}
						composerRegionId={DESKTOP_AI_CHAT_COMPOSER_ID}
						composerTestId={DESKTOP_AI_CHAT_COMPOSER_TESTID}
						composerTextareaId={DESKTOP_AI_CHAT_COMPOSER_ID}
						composerTextareaTestId={DESKTOP_AI_CHAT_COMPOSER_TESTID}
						composerOfflineDescId={DESKTOP_AI_CHAT_COMPOSER_OFFLINE_DESC_ID}
						shellComposerTextareaClass={shellComposerTextareaClass}
						shellComposerIconBtnClass={shellComposerIconBtnClass}
						shellComposerStopBtnClass={shellComposerStopBtnClass}
						activeId={activeId}
						input={input}
						onInputChange={(v) => {
							setInput(v);
							if (activeId) persistChatDraft(activeId, v);
						}}
						attachRef={attachRef}
						onAttach={onAttach}
						sending={sending}
						onSend={handleSend}
						onStopStream={handleStopStream}
						onMicStt={handleMicStt}
						onEnsembleDocumentConfirm={handleEnsembleDocumentConfirm}
						onOpenSoloSlotModal={() => solo.setSoloSlotModalOpen(true)}
						onDismissEnterHint={dismissEnterHint}
						sttCancelNextBlobRef={sttCancelNextBlobRef}
						lucideStroke={lucideStroke}
						t={t}
					/>
				</main>
			</div>
			<DesktopAiChatModals
				heroPickerOpen={solo.heroPickerOpen}
				heroDialogRef={solo.heroDialogRef}
				embeddedModalZ={embeddedModalZ}
				soloSlotStackedModalZ={soloSlotStackedModalZ}
				newChatKind={solo.newChatKind}
				setNewChatKind={solo.setNewChatKind}
				newChatSoloStep={solo.newChatSoloStep}
				setNewChatSoloStep={solo.setNewChatSoloStep}
				pickedHeroId={solo.pickedHeroId}
				setPickedHeroId={solo.setPickedHeroId}
				ensembleSelectedIds={ensembleSelectedIds}
				setEnsembleSelectedIds={setEnsembleSelectedIds}
				toggleEnsembleHeroPick={toggleEnsembleHeroPick}
				defaultEnsembleHeroIds={defaultEnsembleHeroIds}
				newChatSoloDuration={solo.newChatSoloDuration}
				setNewChatSoloDuration={solo.setNewChatSoloDuration}
				newChatSoloSelectedEnergy={solo.newChatSoloSelectedEnergy}
				newChatCreateBusy={solo.newChatCreateBusy}
				soloSlotTariffs={solo.soloSlotTariffs}
				ugsCreditsBalance={solo.ugsCreditsBalance}
				onCloseHeroPicker={() => {
					solo.setHeroPickerOpen(false);
					solo.setNewChatSoloStep('pick');
				}}
				onConfirmNewChat={solo.confirmNewChatWithHero}
				soloSlotModalOpen={solo.soloSlotModalOpen}
				activeId={activeId}
				soloSlotStep={solo.soloSlotStep}
				setSoloSlotStep={solo.setSoloSlotStep}
				soloSlotDuration={solo.soloSlotDuration}
				setSoloSlotDuration={solo.setSoloSlotDuration}
				soloSlotHeroPick={solo.soloSlotHeroPick}
				setSoloSlotHeroPick={solo.setSoloSlotHeroPick}
				soloSlotSelectedEnergy={solo.soloSlotSelectedEnergy}
				soloSlotPurchaseBusy={solo.soloSlotPurchaseBusy}
				onCloseSoloSlotModal={() => {
					solo.setSoloSlotModalOpen(false);
					solo.setSoloSlotStep('pick');
				}}
				onPurchaseSoloSlot={solo.purchaseSoloSlot}
				lucideStroke={lucideStroke}
				t={t}
			/>
			<DesktopAiChatBubbleContextMenu
				open={bubbleCtxMenu !== null}
				payload={bubbleCtxMenu}
				onClose={() => setBubbleCtxMenu(null)}
			/>
			<DesktopAiChatGuideModal
				key={chatGuideMountKey}
				open={chatGuideOpen}
				onClose={() => setChatGuideOpen(false)}
				onPrepareStep={prepareChatGuideStep}
				spotlightLayoutKey={headerCollapsed ? 'collapsed' : 'expanded'}
				voiceEnabled={settings.voice_enabled !== false}
			/>
			<DesktopEnsembleBlueprintCommandsModal
				open={ensemblePlanCommandsOpen}
				onClose={() => setEnsemblePlanCommandsOpen(false)}
				items={ensemblePlanCommands}
				loading={ensemblePlanCommandsLoading}
				error={ensemblePlanCommandsErr}
			/>
			<DesktopAiHeroDossierModal
				open={heroDossierOpen}
				onClose={() => {
					setDossierHeroId(null);
					setHeroDossierOpen(false);
				}}
				hero={getDesktopAiHero(heroIdForDossier ?? undefined) ?? null}
				fallbackTitle={assistantHeaderLabel}
				toolsEnvironmentLine={toolsHint}
				modelLabel={resolvedModelLabel}
				heroPromptVersion={
					getDesktopAiHero(heroIdForDossier ?? undefined)?.promptVersion ?? null
				}
			/>
			<ConfirmDeleteModal
				isOpen={deleteChatConfirmOpen}
				onClose={() => {
					if (!deleteChatBusy) setDeleteChatConfirmOpen(false);
				}}
				onConfirm={handleDeleteChat}
				title={t('deleteChatConfirmTitle')}
				itemName={activeChat?.title || t('defaultChatTitle')}
				warningMessage={t('deleteChatConfirmBody')}
				confirmButtonLabel={t('deleteChatConfirmButton')}
				confirmButtonLoadingLabel={t('deleteChatConfirmLoading')}
				cancelButtonLabel={t('cancel')}
				isDangerous
			/>
			<ConfirmDeleteModal
				isOpen={solo.releaseConsultantModalOpen}
				onClose={() => {
					if (!solo.releaseConsultantBusy) {
						solo.setReleaseConsultantModalOpen(false);
					}
				}}
				onConfirm={solo.performReleaseConsultant}
				title={t('soloSlotReleaseModalTitle')}
				warningMessage={t('soloSlotReleaseConfirm')}
				confirmButtonLabel={t('soloSlotReleaseModalConfirm')}
				confirmButtonLoadingLabel={t('soloSlotReleaseModalDeleting')}
				cancelButtonLabel={t('cancel')}
				confirmIcon={
					<UserMinusIcon
						className="h-[18px] w-[18px]"
						aria-hidden
						strokeWidth={lucideStroke}
					/>
				}
			/>
			<DeleteConfirmModal
				isOpen={userMessageDeleteTarget !== null}
				title={t('deleteMessagesTitle')}
				message={[
					t('deleteMessagesBody1'),
					t('deleteMessagesBodyCount', {
						count: pendingUserMessageDeleteCount,
					}),
					t('deleteMessagesBodyFinal'),
				].join('\n\n')}
				confirmLabel={t('deleteMessagesConfirm')}
				cancelLabel={t('cancel')}
				pendingLabel={t('deleteMessagesPending')}
				onConfirm={() => void truncateUserMessageConfirmed()}
				onCancel={() => {
					if (!userMessageDeleteLoading) setUserMessageDeleteTarget(null);
				}}
				isLoading={userMessageDeleteLoading}
			/>
		</div>
	);
};

export default DesktopAiChatApp;
