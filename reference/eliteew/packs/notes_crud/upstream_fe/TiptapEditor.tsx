/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * TipTap editor core for Ultimate Doc Editor: formatting, tables, images, collaboration,
 * comment anchors, runtime dialogs, and context/floating menus.
 *
 * Invariants:
 * - ПКМ по активному выделению не схлопывает selection (контекстное меню «Вырезать/Копировать»).
 * - Full-document HTML serialization is debounced; blur flushes the pending update.
 * - Selection handlers skip repeated same-range work before `doc.textBetween`.
 * - Visual gutter layout reads are debounced and canceled on cleanup.
 * - Boot gutter: sync stable height + viewport skeleton in useLayoutEffect; rAF viewport refine + background full.
 * - Gutter commits preserve editor scrollTop; line tops stabilized across skeleton → viewport refine.
 *
 * Related:
 * - `components/EditorContextMenu.tsx`, `TiptapEditorCollaboration.tsx`
 */

import {
	Extension,
	getText,
	getTextSerializersFromSchema,
	isTextSelection,
	type AnyExtension,
	type Editor,
} from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import * as React from 'react';
import {
	Suspense,
	lazy,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useDesktopShellTheme } from '@/hooks/useDesktopShellTheme';
import {
	markDocEditorInitialContentSynced,
	markDocEditorInitialContentSyncedIfEquivalent,
	shouldSuppressStaleEditorInitialContentSync,
} from '../utils/docEditorInitialContentSync';
import { normalizeInlineMathLatex } from '../utils/normalizeMathLatex';
import { shortenDataUrlForImageInsert } from '../utils/shortenDataUrlForImageInsert';
import { getTiptapEditorRootClassName } from '../utils/tiptapProseThemeClass';
import {
	buildTiptapSelectionRangeSignature,
	shouldSkipTiptapSelectionWork,
} from './tiptapPerformanceGuards';
import {
	cancelGutterLayoutFrame,
	scheduleGutterBackgroundFullLayout,
	scheduleGutterPostPaintWork,
	type GutterLayoutFrameHandle,
} from './tiptapGutterLayoutScheduling';
import { buildViewportGutterSkeletonLines } from './tiptapGutterStableEstimate';
import {
	resolveGutterContentRoot,
	resolveGutterScrollContainer,
} from './tiptapGutterDomContract';
import {
	applyGutterLayoutWithScrollAnchor,
	resolveCommittedGutterHeight,
	scheduleScrollAnchorAfterPaint,
	stabilizeVisualLineMetrics,
} from './tiptapGutterVisualContinuity';
import {
	type GutterLayoutScope,
	isBlockInGutterViewport,
	resolveProseMirrorViewportRect,
} from './tiptapGutterViewportScope';
import {
	applyStableGutterHeight,
	consumePendingFullLayout,
	createGutterTransitionState,
	deferScrollResizePromotion,
	markGutterFullReady,
	markGutterViewportReady,
	requestGutterFullLayoutPromotion,
	resolveGutterHeightForPhase,
	resolveScheduledGutterScope,
	type GutterTransitionState,
} from './tiptapGutterTransition';
// New formatting extensions
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { useTranslation } from 'react-i18next';
import i18n, { ULTIMATE_DOC_EDITOR_NS } from '../../../i18n/config';
import {
	DesktopAppButton,
	DesktopAppEmptyState,
	DesktopAppMenuSurface,
	DesktopAppPanel,
} from '../../../pages/Desktop/components/DesktopAppChrome';
import { useEmbeddedPortaledModalZIndex } from '@/pages/Desktop/context/DesktopWindowPortalStackContext';
import { cn } from '../../../utils/cn';
import { log } from '../../../utils/logger';
import type {
	CommentAnchorMeta,
	CommentAnchorRange,
	TiptapEditorProps,
} from '../types/editor.types';
import {
	DOC_EDITOR_RUNTIME_DIALOG_EVENT,
	type DocEditorRuntimeDialogRequest,
	type DocEditorSelectionRange,
} from '../utils/runtimeDialogEvents';
import { buildThreadDeepLink } from '../utils/threadHashLink';
import { CollaborationLocalTypingHighlight } from './collaborationLocalTypingHighlight';
import {
	ArrowPathIcon,
	BoldIcon,
	CodeBracketSquareIcon,
	ItalicIcon,
	LinkIcon,
	NumberedListIcon,
	SparklesIcon,
	SwatchIcon,
	UnderlineIcon,
} from '@heroicons/react/24/outline';

interface VisualLineMetric {
	/** Logical block index (1-based), same for wrap continuation rows of that block. */
	lineNumber: number;
	top: number;
	height: number;
	/** True for 2nd+ visual row when the block soft-wraps (show ↳ instead of re-numbering). */
	isWrapContinuation: boolean;
}

/** Rects on one visual line can differ in `top` by a subpixel; merge within this tolerance. */
const GUTTER_VISUAL_LINE_TOP_EPS_PX = 4;

/** Trailing debounce: gutter layout (getClientRects) — не на каждый keystroke. */
const GUTTER_LAYOUT_DEBOUNCE_MS = 200;

/**
 * Visual text lines inside a block (soft-wraps), using layout rects — not height/lineHeight math
 * (that breaks for line-height: normal, headings vs body, nested &lt;p&gt; in &lt;li&gt;, etc.).
 */
function measureVisualRowsInBlock(
	blockEl: HTMLElement,
	rootRect: DOMRect,
	fallbackLineHeight: number
): Array<{ top: number; height: number }> {
	const tag = blockEl.tagName;
	if (tag === 'TABLE') {
		const br = blockEl.getBoundingClientRect();
		const h = Math.max(fallbackLineHeight, br.height || fallbackLineHeight);
		return [{ top: Math.max(0, br.top - rootRect.top), height: h }];
	}
	if (tag === 'HR') {
		const br = blockEl.getBoundingClientRect();
		return [
			{
				top: Math.max(0, br.top - rootRect.top),
				height: Math.max(br.height, 12),
			},
		];
	}

	const blockRect = blockEl.getBoundingClientRect();
	const cs = window.getComputedStyle(blockEl);
	let lineHeightPx = Number.parseFloat(cs.lineHeight);
	if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) {
		const fs = Number.parseFloat(cs.fontSize);
		lineHeightPx = Number.isFinite(fs) ? fs * 1.25 : fallbackLineHeight;
	}

	const hasMeaningfulText =
		Boolean(blockEl.textContent?.trim()) ||
		Boolean(blockEl.querySelector('img,br,hr,svg,video,iframe'));

	if (!hasMeaningfulText) {
		return [
			{
				top: Math.max(0, blockRect.top - rootRect.top),
				height: Math.max(blockRect.height, lineHeightPx * 0.85, 12),
			},
		];
	}

	const range = document.createRange();
	try {
		range.selectNodeContents(blockEl);
	} catch {
		return [
			{
				top: Math.max(0, blockRect.top - rootRect.top),
				height: Math.max(blockRect.height, lineHeightPx),
			},
		];
	}

	const rects = Array.from(range.getClientRects()).filter(
		(r) => r.height > 0 && (r.width > 0 || r.right > r.left)
	);
	if (rects.length === 0) {
		return [
			{
				top: Math.max(0, blockRect.top - rootRect.top),
				height: Math.max(blockRect.height, lineHeightPx),
			},
		];
	}

	rects.sort((a, b) => a.top - b.top || a.left - b.left);

	const clusters: { top: number; bottom: number }[] = [];
	for (const r of rects) {
		const last = clusters[clusters.length - 1];
		if (last && Math.abs(r.top - last.top) < GUTTER_VISUAL_LINE_TOP_EPS_PX) {
			last.top = Math.min(last.top, r.top);
			last.bottom = Math.max(last.bottom, r.bottom);
		} else {
			clusters.push({ top: r.top, bottom: r.bottom });
		}
	}

	return clusters.map((c) => ({
		top: Math.max(0, c.top - rootRect.top),
		height: Math.max(c.bottom - c.top, lineHeightPx * 0.85, 10),
	}));
}

const EMPTY_EXTENSIONS: AnyExtension[] = [];
const COMMENT_ANCHOR_PLUGIN_KEY = new PluginKey<DecorationSet>(
	'commentAnchors'
);
const COMMENT_ANCHOR_PROFILE_EVENT = 'ultimate-doc-editor-telemetry';
const COMMENT_ANCHOR_SLOW_MS = 8;
let lastCommentAnchorProfileEmitAt = 0;

interface CommentAnchorDecorationMeta {
	anchors?: CommentAnchorRange[];
	anchorMeta?: Record<string, CommentAnchorMeta>;
	activeThreadId?: string | null;
}

type CommentAnchorProfilePhase = 'init' | 'apply';

const isCommentAnchorProfilingEnabled = (): boolean =>
	typeof import.meta.env.VITE_ULTIMATE_DOC_EDITOR_PROFILE === 'string'
		? import.meta.env.VITE_ULTIMATE_DOC_EDITOR_PROFILE !== 'false'
		: true;

const emitCommentAnchorProfile = (payload: {
	phase: CommentAnchorProfilePhase;
	durationMs: number;
	docSize: number;
	anchorCount: number;
	activeThread: boolean;
}): void => {
	if (typeof window === 'undefined' || !isCommentAnchorProfilingEnabled()) {
		return;
	}

	const now = Date.now();
	const shouldEmit =
		payload.durationMs >= COMMENT_ANCHOR_SLOW_MS ||
		payload.docSize >= 50_000 ||
		now - lastCommentAnchorProfileEmitAt > 4_000;
	if (!shouldEmit) {
		return;
	}

	lastCommentAnchorProfileEmitAt = now;
	window.dispatchEvent(
		new CustomEvent(COMMENT_ANCHOR_PROFILE_EVENT, {
			detail: {
				name: 'comment_anchor_decorations_profile',
				timestamp: new Date().toISOString(),
				...payload,
			},
		})
	);
	log.debug('TiptapEditor', 'Comment anchor decorations profile', payload);
};

function normalizeAnchorsForDoc(
	doc: ProseMirrorNode,
	anchors: CommentAnchorRange[]
): CommentAnchorRange[] {
	const maxPos = Math.max(1, doc.content.size);
	return anchors
		.map((anchor) => {
			const start = Math.min(Math.max(1, anchor.start), maxPos);
			const end = Math.min(Math.max(start + 1, anchor.end), maxPos);
			if (start >= end) {
				return null;
			}

			return {
				...anchor,
				start,
				end,
			};
		})
		.filter((anchor): anchor is CommentAnchorRange => anchor !== null);
}

function buildCommentAnchorDecorations(
	doc: ProseMirrorNode,
	anchors: CommentAnchorRange[],
	anchorMeta: Record<string, CommentAnchorMeta>,
	activeThreadId?: string | null,
	profilePhase: CommentAnchorProfilePhase = 'apply'
): DecorationSet {
	const startedAt = performance.now();
	const normalizedAnchors = normalizeAnchorsForDoc(doc, anchors);
	if (normalizedAnchors.length === 0) {
		emitCommentAnchorProfile({
			phase: profilePhase,
			durationMs: Number((performance.now() - startedAt).toFixed(2)),
			docSize: doc.content.size,
			anchorCount: 0,
			activeThread: Boolean(activeThreadId),
		});
		return DecorationSet.empty;
	}

	const decorations = normalizedAnchors.map((anchor) => {
		const classNames = ['comment-anchor-range'];
		if (anchor.resolved) {
			classNames.push('comment-anchor-resolved');
		} else {
			classNames.push('comment-anchor-open');
		}
		if (activeThreadId && anchor.threadId === activeThreadId) {
			classNames.push('comment-anchor-active');
		}

		const threadMeta = anchorMeta[anchor.threadId];
		const unresolved =
			threadMeta?.unresolvedComments ?? (anchor.resolved ? 0 : 1);
		const total = threadMeta?.totalComments ?? 1;
		const statusLabel =
			unresolved > 0
				? i18n.t(`${ULTIMATE_DOC_EDITOR_NS}:commentAnchors.statusOpen`)
				: i18n.t(`${ULTIMATE_DOC_EDITOR_NS}:commentAnchors.statusResolved`);
		const title = i18n.t(
			`${ULTIMATE_DOC_EDITOR_NS}:commentAnchors.anchorTitle`,
			{ status: statusLabel, unresolved, total }
		);

		return Decoration.inline(anchor.start, anchor.end, {
			class: classNames.join(' '),
			'data-comment-thread-id': anchor.threadId,
			title,
		});
	});

	const result = DecorationSet.create(doc, decorations);
	emitCommentAnchorProfile({
		phase: profilePhase,
		durationMs: Number((performance.now() - startedAt).toFixed(2)),
		docSize: doc.content.size,
		anchorCount: normalizedAnchors.length,
		activeThread: Boolean(activeThreadId),
	});
	return result;
}

const CommentAnchorExtension = Extension.create({
	name: 'commentAnchors',
	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: COMMENT_ANCHOR_PLUGIN_KEY,
				state: {
					init(_, state) {
						return buildCommentAnchorDecorations(
							state.doc,
							[],
							{},
							null,
							'init'
						);
					},
					apply(transaction, oldDecorationSet) {
						const mapped = oldDecorationSet.map(
							transaction.mapping,
							transaction.doc
						);
						const meta = transaction.getMeta(COMMENT_ANCHOR_PLUGIN_KEY) as
							| CommentAnchorDecorationMeta
							| undefined;
						if (!meta) {
							return mapped;
						}

						return buildCommentAnchorDecorations(
							transaction.doc,
							meta.anchors ?? [],
							meta.anchorMeta ?? {},
							meta.activeThreadId ?? null,
							'apply'
						);
					},
				},
				props: {
					decorations(state) {
						return this.getState(state);
					},
				},
			}),
		];
	},
});

const CollaborativeTiptapEditor = lazy(() =>
	import('./TiptapEditorCollaboration').then((module) => ({
		default: module.CollaborativeTiptapEditor,
	}))
);
const EditorContextMenu = lazy(() =>
	import('../components/EditorContextMenu').then((module) => ({
		default: module.EditorContextMenu,
	}))
);
const ColorPicker = lazy(() =>
	import('../components/ColorPicker').then((module) => ({
		default: module.ColorPicker,
	}))
);
const RuntimeImageDialog = lazy(() =>
	import('../components/dialogs/RuntimeImageDialog').then((module) => ({
		default: module.RuntimeImageDialog,
	}))
);
const RuntimeLinkDialog = lazy(() =>
	import('../components/dialogs/RuntimeLinkDialog').then((module) => ({
		default: module.RuntimeLinkDialog,
	}))
);
const RuntimeTextPromptDialog = lazy(() =>
	import('../components/dialogs/RuntimeTextPromptDialog').then((module) => ({
		default: module.RuntimeTextPromptDialog,
	}))
);

type EditorInsertDialogRequest = Extract<
	DocEditorRuntimeDialogRequest,
	{ type: 'link' | 'image' | 'formula' }
>;

/**
 * Custom Image extension with automatic upload to SeaweedFS (S3 storage)
 */
const CustomImage = Image.extend({
	addProseMirrorPlugins() {
		return [...(this.parent?.() || [])];
	},
});

interface TiptapEditorCoreProps extends TiptapEditorProps {
	collaborationExtensions?: AnyExtension[];
}

interface TiptapEditorInnerProps extends TiptapEditorCoreProps {
	optionalExtensions: AnyExtension[];
}

interface AnchorQuickMenuState {
	threadId: string;
	x: number;
	y: number;
}

const TiptapEditorInner: React.FC<TiptapEditorInnerProps> = ({
	initialContent = '',
	editable = true,
	documentId,
	documentSyncKey = '',
	shellWindowStyle,
	desktopUiScale = 1,
	commentJumpFlashToken,
	commentAnchors = [],
	commentAnchorMeta = {},
	activeCommentThreadId = null,
	onCommentAnchorAction,
	onCommentAnchorClick,
	activeCollaborators = [],
	optionalExtensions,
	collaborationExtensions = EMPTY_EXTENSIONS,
	onDocumentChange,
	onDocumentFlush,
	onUpdate,
	onSelectionUpdate,
	onEditorReady,
	onEditorUnmounted,
}) => {
	const { t } = useTranslation(ULTIMATE_DOC_EDITOR_NS);
	const editorPlaceholder = t('editorPlaceholder');
	const [emptyOnboardingDismissed, setEmptyOnboardingDismissed] =
		useState(false);
	const [contextMenuOpen, setContextMenuOpen] = useState(false);
	const [contextMenuPosition, setContextMenuPosition] = useState({
		x: 0,
		y: 0,
	});
	const [colorPickerOpen, setColorPickerOpen] = useState<
		'text' | 'highlight' | null
	>(null);
	const [colorPickerPosition, setColorPickerPosition] = useState({
		x: 0,
		y: 0,
	});
	const [pendingColorRange, setPendingColorRange] =
		useState<DocEditorSelectionRange | null>(null);
	const [runtimeDialogRequest, setRuntimeDialogRequest] =
		useState<EditorInsertDialogRequest | null>(null);
	const [anchorQuickMenu, setAnchorQuickMenu] =
		useState<AnchorQuickMenuState | null>(null);
	const [copiedThreadId, setCopiedThreadId] = useState<string | null>(null);
	const [floatingChromePaused, setFloatingChromePaused] = useState(false);
	const embeddedModalZ = useEmbeddedPortaledModalZIndex();

	const hasCollab = collaborationExtensions.length > 0;

	const shellTheme = useDesktopShellTheme();
	const editorRootClassName = useMemo(
		() => getTiptapEditorRootClassName(shellTheme),
		[shellTheme]
	);

	/**
	 * Окно редактора внутри рабочего стола с `transform: scale(...)`.
	 * По умолчанию BubbleMenu/FloatingMenu используют `strategy: 'absolute'` — якорь «уезжает» относительно клика.
	 */
	const tiptapFloatingUiOptions = useMemo(
		() => ({
			strategy: 'fixed' as const,
			flip: true as const,
			shift: { padding: 8 },
		}),
		[]
	);

	const onDocumentChangeRef = useRef(onDocumentChange);
	const onDocumentFlushRef = useRef(onDocumentFlush);
	const onUpdateRef = useRef(onUpdate);
	const onSelectionUpdateRef = useRef(onSelectionUpdate);
	const copiedTimeoutRef = useRef<number | null>(null);
	const lastSelectionRangeSignatureRef = useRef<string>('');

	useEffect(() => {
		onDocumentChangeRef.current = onDocumentChange;
		onDocumentFlushRef.current = onDocumentFlush;
		onUpdateRef.current = onUpdate;
		onSelectionUpdateRef.current = onSelectionUpdate;
		return () => {
			onDocumentChangeRef.current = undefined;
			onDocumentFlushRef.current = undefined;
			onUpdateRef.current = undefined;
			onSelectionUpdateRef.current = undefined;
		};
	}, [onDocumentChange, onDocumentFlush, onUpdate, onSelectionUpdate]);

	useEffect(() => {
		let timeoutId = 0;
		const onResize = (): void => {
			setFloatingChromePaused(true);
			window.clearTimeout(timeoutId);
			timeoutId = window.setTimeout(() => {
				setFloatingChromePaused(false);
			}, 220);
		};
		window.addEventListener('resize', onResize, { passive: true });
		return (): void => {
			window.removeEventListener('resize', onResize);
			window.clearTimeout(timeoutId);
		};
	}, []);

	const editor = useEditor(
		{
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2, 3, 4, 5, 6] },
					codeBlock: false,
					link: false,
					underline: false,
					horizontalRule: false,
					...(hasCollab ? { undoRedo: false as const } : {}),
				}),
				Placeholder.configure({
					placeholder: editorPlaceholder,
				}),
				// Text formatting extensions
				TextStyle,
				Color.configure({
					types: ['textStyle'],
				}),
				Highlight.configure({
					multicolor: true,
					HTMLAttributes: {
						class: 'highlight',
					},
				}),
				Underline,
				Subscript,
				Superscript,
				TextAlign.configure({
					types: ['heading', 'paragraph'],
					defaultAlignment: 'left',
				}),
				FontFamily.configure({
					types: ['textStyle'],
				}),
				// Task lists (checkboxes)
				TaskList.configure({
					HTMLAttributes: {
						class: 'task-list',
					},
				}),
				TaskItem.configure({
					nested: true,
					HTMLAttributes: {
						class: 'task-item',
					},
				}),
				// Horizontal rule (divider)
				HorizontalRule.configure({
					HTMLAttributes: {
						class: 'horizontal-rule',
					},
				}),
				CommentAnchorExtension,
				...optionalExtensions,
				...collaborationExtensions,
				...(hasCollab ? [CollaborationLocalTypingHighlight] : []),
				Table.configure({
					resizable: true,
					HTMLAttributes: {
						class: 'editor-table',
					},
				}),
				TableRow.configure({
					HTMLAttributes: {
						class: 'editor-table-row',
					},
				}),
				TableCell.configure({
					HTMLAttributes: {
						class: 'editor-table-cell',
					},
				}),
				TableHeader.configure({
					HTMLAttributes: {
						class: 'editor-table-header',
					},
				}),
				CustomImage.configure({
					inline: false,
					allowBase64: true,
					HTMLAttributes: {
						class: 'editor-content-image',
					},
				}),
				Link.configure({
					openOnClick: false,
					/** Иначе `blob:` (PDF из панели до upload) и кастомные схемы отбрасываются при parseHTML. */
					protocols: ['blob'],
					HTMLAttributes: {
						class: 'editor-link',
					},
				}),
			],
			content: initialContent,
			editable,
			editorProps: {
				attributes: {
					class: getTiptapEditorRootClassName('dark'),
				},
			},
			onUpdate: ({ editor: ed, transaction }) => {
				if (onDocumentChangeRef.current) {
					onDocumentChangeRef.current({ editor: ed, transaction });
					return;
				}
				if (onUpdateRef.current && transaction.docChanged) {
					onUpdateRef.current(ed.getHTML());
				}
			},
			onSelectionUpdate: ({ editor: ed }) => {
				const { from, to } = ed.state.selection;
				const doc = ed.state.doc;
				const rangeSignature = buildTiptapSelectionRangeSignature({
					from,
					to,
					docContentSize: doc.content.size,
				});
				if (
					shouldSkipTiptapSelectionWork(
						lastSelectionRangeSignatureRef.current,
						rangeSignature
					)
				) {
					return;
				}
				lastSelectionRangeSignatureRef.current = rangeSignature;
				const text = doc.textBetween(from, to);
				let line = 1;
				let column = 1;
				if (doc.content.childCount > 0) {
					let pos = 1;
					for (let i = 0; i < doc.content.childCount; i++) {
						const node = doc.content.child(i);
						const end = pos + node.nodeSize;
						if (from >= pos && from < end) {
							line = i + 1;
							column = Math.max(1, from - pos + 1);
							break;
						}
						pos = end;
					}
				}
				onSelectionUpdateRef.current?.(text, { from, to, line, column });
			},
		},
		[
			collaborationExtensions,
			documentId,
			editorPlaceholder,
			hasCollab,
			optionalExtensions,
		]
	);

	useEffect(() => {
		if (!editor) return;
		lastSelectionRangeSignatureRef.current = '';
	}, [editor]);

	useEffect(() => {
		if (!editor) return;
		editor.setOptions({
			editorProps: {
				...editor.options.editorProps,
				attributes: {
					...editor.options.editorProps?.attributes,
					class: editorRootClassName,
				},
			},
		});
	}, [editor, editorRootClassName]);

	// When collaboration is on, Y.Doc is source of truth — do not overwrite from initialContent (avoids duplicate content on sync)
	useEffect(() => {
		if (!editor || hasCollab) return;
		const currentHtml = editor.getHTML();
		const syncKey =
			documentSyncKey || (documentId != null ? String(documentId) : '');
		if (
			markDocEditorInitialContentSyncedIfEquivalent({
				incomingHtml: initialContent,
				currentHtml,
				documentSyncKey: syncKey,
				lastSyncedDocumentKeyRef,
			})
		) {
			return;
		}
		if (
			shouldSuppressStaleEditorInitialContentSync({
				isEditorFocused: editor.isFocused,
				incomingHtml: initialContent,
				currentHtml,
				documentSyncKey: syncKey,
				lastSyncedDocumentKeyRef,
			})
		) {
			return;
		}
		editor.commands.setContent(initialContent, { emitUpdate: false });
		markDocEditorInitialContentSynced(lastSyncedDocumentKeyRef, syncKey);
	}, [editor, initialContent, hasCollab, documentId, documentSyncKey]);

	useEffect(() => {
		setEmptyOnboardingDismissed(false);
	}, []);

	// Update editable state
	useEffect(() => {
		if (editor) {
			editor.setEditable(editable);
		}
	}, [editor, editable]);

	const hasNotifiedReady = useRef(false);
	const lastSyncedDocumentKeyRef = useRef<string | null>(null);

	const editorHostRef = useRef<HTMLDivElement | null>(null);
	const flashTimeoutRef = useRef<number | null>(null);
	const visualLinesRafRef = useRef<number | null>(null);
	const gutterLayoutTimerRef = useRef<number | null>(null);
	const gutterBootstrapFrameRef = useRef<GutterLayoutFrameHandle | null>(null);
	const gutterBackgroundFullFrameRef = useRef<GutterLayoutFrameHandle | null>(
		null
	);
	const gutterTransitionRef = useRef<GutterTransitionState>(
		createGutterTransitionState()
	);
	const previousVisualLinesRef = useRef<VisualLineMetric[]>([]);
	const [visualLines, setVisualLines] = useState<VisualLineMetric[]>([
		{ lineNumber: 1, top: 24, height: 32, isWrapContinuation: false },
	]);
	const [gutterHeight, setGutterHeight] = useState(500);
	const [gutterTrackTransitionEnabled, setGutterTrackTransitionEnabled] =
		useState(false);
	const isMountedRef = useRef(true);
	useEffect(() => {
		return () => {
			if (flashTimeoutRef.current !== null) {
				window.clearTimeout(flashTimeoutRef.current);
			}
			if (visualLinesRafRef.current !== null) {
				window.cancelAnimationFrame(visualLinesRafRef.current);
			}
			if (gutterLayoutTimerRef.current !== null) {
				window.clearTimeout(gutterLayoutTimerRef.current);
			}
			cancelGutterLayoutFrame(gutterBootstrapFrameRef.current);
			gutterBootstrapFrameRef.current = null;
			cancelGutterLayoutFrame(gutterBackgroundFullFrameRef.current);
			gutterBackgroundFullFrameRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (!editor) {
			return;
		}

		const transaction = editor.state.tr.setMeta(COMMENT_ANCHOR_PLUGIN_KEY, {
			anchors: commentAnchors,
			anchorMeta: commentAnchorMeta,
			activeThreadId: activeCommentThreadId,
		} satisfies CommentAnchorDecorationMeta);
		editor.view.dispatch(transaction);
	}, [activeCommentThreadId, commentAnchorMeta, commentAnchors, editor]);

	useEffect(() => {
		if (!commentJumpFlashToken) {
			return;
		}

		const root = resolveGutterContentRoot(
			editorHostRef.current
		) as HTMLElement | null;
		if (!root) {
			return;
		}

		root.classList.remove('comment-anchor-flash');
		void root.offsetWidth;
		root.classList.add('comment-anchor-flash');

		if (flashTimeoutRef.current !== null) {
			window.clearTimeout(flashTimeoutRef.current);
		}
		flashTimeoutRef.current = window.setTimeout(() => {
			root.classList.remove('comment-anchor-flash');
			flashTimeoutRef.current = null;
		}, 1300);
	}, [commentJumpFlashToken]);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const updateVisualLines = useCallback(
		(scope: GutterLayoutScope = 'full'): void => {
			if (!isMountedRef.current) {
				return;
			}
			if (!editor || (editor as { isDestroyed?: boolean }).isDestroyed) {
				return;
			}

			const root = resolveGutterContentRoot(editorHostRef.current);
			if (!root) {
				setVisualLines([
					{ lineNumber: 1, top: 24, height: 32, isWrapContinuation: false },
				]);
				setGutterHeight(500);
				return;
			}

			if (scope === 'full') {
				markGutterFullReady(gutterTransitionRef.current);
			}

			const viewportRect =
				scope === 'viewport' ? resolveProseMirrorViewportRect(root) : null;

			const rootRect = root.getBoundingClientRect();
			const rootStyle = window.getComputedStyle(root);
			const fallbackLineHeight = Number.parseFloat(rootStyle.lineHeight) || 32;
			const nextLines: VisualLineMetric[] = [];
			let nextLineNumber = 1;

			const shouldMeasureBlock = (element: HTMLElement): boolean => {
				if (scope === 'full' || !viewportRect) {
					return true;
				}
				return isBlockInGutterViewport(element, viewportRect);
			};

			/**
			 * One block index per logical block; continuation visual rows use ↳. Row geometry
			 * comes from layout (getClientRects), not height/lineHeight division.
			 */
			const pushBlockGutterRows = (element: HTMLElement): void => {
				const blockNum = nextLineNumber;
				const rows = measureVisualRowsInBlock(
					element,
					rootRect,
					fallbackLineHeight
				);
				rows.forEach((row, index) => {
					nextLines.push({
						lineNumber: blockNum,
						top: row.top,
						height: row.height,
						isWrapContinuation: index > 0,
					});
				});
				nextLineNumber += 1;
			};

			const processBlock = (element: HTMLElement): void => {
				if (!shouldMeasureBlock(element)) {
					nextLineNumber += 1;
					return;
				}
				const tag = element.tagName;
				if ((tag === 'UL' || tag === 'OL') && element.children.length > 0) {
					Array.from(element.children).forEach((child) => {
						if (child instanceof HTMLElement && child.tagName === 'LI') {
							if (!shouldMeasureBlock(child)) {
								nextLineNumber += 1;
								return;
							}
							pushBlockGutterRows(child);
						}
					});
					return;
				}
				if (tag === 'BLOCKQUOTE' && element.children.length > 0) {
					Array.from(element.children).forEach((child) => {
						if (child instanceof HTMLElement) {
							processBlock(child);
						}
					});
					return;
				}

				pushBlockGutterRows(element);
			};

			const blocks = Array.from(root.children).filter(
				(child): child is HTMLElement => child instanceof HTMLElement
			);

			if (blocks.length === 0) {
				nextLines.push({
					lineNumber: 1,
					top: 24,
					height: fallbackLineHeight,
					isWrapContinuation: false,
				});
			} else {
				blocks.forEach(processBlock);
			}

			if (nextLines.length === 0) {
				nextLines.push({
					lineNumber: 1,
					top: 24,
					height: fallbackLineHeight,
					isWrapContinuation: false,
				});
			}

			setVisualLines(nextLines);
			const scrollContainer = resolveGutterScrollContainer(root);
			const layoutPhase =
				scope === 'full' ? 'full' : gutterTransitionRef.current.phase;
			const stabilizedLines =
				layoutPhase !== 'full' && previousVisualLinesRef.current.length > 0
					? stabilizeVisualLineMetrics(
							previousVisualLinesRef.current,
							nextLines
						)
					: nextLines;
			const heightBefore = gutterTransitionRef.current.stableHeightPx;
			const stableHeight = resolveGutterHeightForPhase(
				gutterTransitionRef.current,
				root.scrollHeight,
				layoutPhase
			);
			const { shouldAnimateHeight } = resolveCommittedGutterHeight(
				layoutPhase,
				heightBefore,
				root.scrollHeight
			);
			const scrollTopBefore = scrollContainer?.scrollTop ?? 0;

			applyGutterLayoutWithScrollAnchor(
				scrollContainer,
				heightBefore,
				stableHeight,
				() => {
					previousVisualLinesRef.current = stabilizedLines;
					setGutterTrackTransitionEnabled(shouldAnimateHeight);
					setVisualLines(stabilizedLines);
					setGutterHeight(stableHeight);
				}
			);
			scheduleScrollAnchorAfterPaint(scrollContainer, scrollTopBefore);
		},
		[editor]
	);

	const scheduleUpdateVisualLines = useCallback((): void => {
		if (!requestGutterFullLayoutPromotion(gutterTransitionRef.current)) {
			return;
		}
		if (gutterLayoutTimerRef.current !== null) {
			window.clearTimeout(gutterLayoutTimerRef.current);
		}
		gutterLayoutTimerRef.current = window.setTimeout(() => {
			gutterLayoutTimerRef.current = null;
			if (visualLinesRafRef.current !== null) {
				return;
			}
			visualLinesRafRef.current = window.requestAnimationFrame(() => {
				visualLinesRafRef.current = null;
				const scope = resolveScheduledGutterScope(
					gutterTransitionRef.current.phase
				);
				updateVisualLines(scope);
			});
		}, GUTTER_LAYOUT_DEBOUNCE_MS);
	}, [updateVisualLines]);

	const flushUpdateVisualLines = useCallback((): void => {
		if (gutterLayoutTimerRef.current !== null) {
			window.clearTimeout(gutterLayoutTimerRef.current);
			gutterLayoutTimerRef.current = null;
		}
		if (visualLinesRafRef.current !== null) {
			window.cancelAnimationFrame(visualLinesRafRef.current);
			visualLinesRafRef.current = null;
		}
		markGutterFullReady(gutterTransitionRef.current);
		updateVisualLines('full');
	}, [updateVisualLines]);

	const runViewportGutterInitialLayout = useCallback((): void => {
		updateVisualLines('viewport');
	}, [updateVisualLines]);

	const bootstrapGutterLayout = useCallback((): void => {
		if (!editor || (editor as { isDestroyed?: boolean }).isDestroyed) {
			return;
		}
		const root = resolveGutterContentRoot(editorHostRef.current);
		if (!root) {
			return;
		}

		const rootStyle = window.getComputedStyle(root);
		const fallbackLineHeight = Number.parseFloat(rootStyle.lineHeight) || 32;
		const skeletonLines = buildViewportGutterSkeletonLines(
			root,
			fallbackLineHeight
		);
		const scrollContainer = resolveGutterScrollContainer(root);
		const stableHeight = applyStableGutterHeight(
			gutterTransitionRef.current,
			root.scrollHeight
		);
		const scrollTopBefore = scrollContainer?.scrollTop ?? 0;

		applyGutterLayoutWithScrollAnchor(scrollContainer, 0, stableHeight, () => {
			previousVisualLinesRef.current = skeletonLines;
			setGutterTrackTransitionEnabled(false);
			setGutterHeight(stableHeight);
			setVisualLines(skeletonLines);
		});
		scheduleScrollAnchorAfterPaint(scrollContainer, scrollTopBefore);

		const hadPendingFull = markGutterViewportReady(gutterTransitionRef.current);

		cancelGutterLayoutFrame(gutterBootstrapFrameRef.current);
		gutterBootstrapFrameRef.current = scheduleGutterPostPaintWork(() => {
			gutterBootstrapFrameRef.current = null;
			if (!isMountedRef.current) {
				return;
			}
			runViewportGutterInitialLayout();
		});

		cancelGutterLayoutFrame(gutterBackgroundFullFrameRef.current);
		gutterBackgroundFullFrameRef.current = scheduleGutterBackgroundFullLayout(
			() => {
				gutterBackgroundFullFrameRef.current = null;
				if (!isMountedRef.current) {
					return;
				}
				if (
					hadPendingFull ||
					consumePendingFullLayout(gutterTransitionRef.current)
				) {
					scheduleUpdateVisualLines();
					return;
				}
				if (gutterTransitionRef.current.phase === 'viewport') {
					scheduleUpdateVisualLines();
				}
			}
		);
	}, [editor, runViewportGutterInitialLayout, scheduleUpdateVisualLines]);

	useLayoutEffect(() => {
		if (!editor) {
			return;
		}
		gutterTransitionRef.current = createGutterTransitionState();
		previousVisualLinesRef.current = [];
		bootstrapGutterLayout();
	}, [editor, bootstrapGutterLayout]);

	useEffect(() => {
		if (!editor) return;

		editor.on('update', scheduleUpdateVisualLines);

		const handleBlur = (): void => {
			onDocumentFlushRef.current?.({ editor });
			flushUpdateVisualLines();
		};
		editor.on('blur', handleBlur);

		const root = resolveGutterContentRoot(editorHostRef.current);
		const resizeObserver =
			typeof ResizeObserver !== 'undefined'
				? new ResizeObserver(() => {
						if (deferScrollResizePromotion(gutterTransitionRef.current)) {
							return;
						}
						scheduleUpdateVisualLines();
					})
				: null;

		if (root && resizeObserver) {
			resizeObserver.observe(root);
		}

		const scrollContainer = resolveGutterScrollContainer(root);

		const handleGutterScrollPromote = (): void => {
			if (deferScrollResizePromotion(gutterTransitionRef.current)) {
				return;
			}
			if (gutterTransitionRef.current.phase !== 'full') {
				scheduleUpdateVisualLines();
			}
		};

		scrollContainer?.addEventListener('scroll', handleGutterScrollPromote, {
			passive: true,
		});

		const handleResize = (): void => {
			if (deferScrollResizePromotion(gutterTransitionRef.current)) {
				return;
			}
			scheduleUpdateVisualLines();
		};

		window.addEventListener('resize', handleResize);

		return () => {
			editor.off('update', scheduleUpdateVisualLines);
			editor.off('blur', handleBlur);
			window.removeEventListener('resize', handleResize);
			scrollContainer?.removeEventListener('scroll', handleGutterScrollPromote);
			resizeObserver?.disconnect();
			cancelGutterLayoutFrame(gutterBootstrapFrameRef.current);
			gutterBootstrapFrameRef.current = null;
			cancelGutterLayoutFrame(gutterBackgroundFullFrameRef.current);
			gutterBackgroundFullFrameRef.current = null;
			if (visualLinesRafRef.current !== null) {
				window.cancelAnimationFrame(visualLinesRafRef.current);
				visualLinesRafRef.current = null;
			}
			if (gutterLayoutTimerRef.current !== null) {
				window.clearTimeout(gutterLayoutTimerRef.current);
				gutterLayoutTimerRef.current = null;
			}
		};
	}, [editor, flushUpdateVisualLines, scheduleUpdateVisualLines]);

	useEffect(() => {
		if (!editor || (editor as { isDestroyed?: boolean }).isDestroyed) {
			hasNotifiedReady.current = false;
			return;
		}
		if (hasNotifiedReady.current) {
			return;
		}
		if (typeof onEditorReady === 'function') {
			onEditorReady(editor);
		}
		hasNotifiedReady.current = true;
	}, [editor, onEditorReady]);

	useEffect(() => {
		if (!editor) {
			return;
		}
		return () => {
			onEditorUnmounted?.();
		};
	}, [editor, onEditorUnmounted]);

	const getCurrentSelectionRange = useCallback(():
		| DocEditorSelectionRange
		| undefined => {
		if (!editor || editor.state.selection.empty) {
			return undefined;
		}

		return {
			from: editor.state.selection.from,
			to: editor.state.selection.to,
		};
	}, [editor]);

	const getSelectedTextForRange = useCallback(
		(range?: DocEditorSelectionRange): string => {
			if (!editor || !range || range.from === range.to) {
				return '';
			}

			return editor.state.doc.textBetween(range.from, range.to);
		},
		[editor]
	);

	const closeColorPicker = useCallback(() => {
		setColorPickerOpen(null);
		setPendingColorRange(null);
	}, []);

	const openRuntimeDialog = useCallback(
		(request: DocEditorRuntimeDialogRequest) => {
			if (!editor) {
				return;
			}

			const resolvedRange = request.range ?? getCurrentSelectionRange();
			setContextMenuOpen(false);

			if (request.type === 'textColor' || request.type === 'highlightColor') {
				setPendingColorRange(resolvedRange ?? null);
				setColorPickerPosition(request.position);
				setColorPickerOpen(request.type === 'textColor' ? 'text' : 'highlight');
				return;
			}

			if (request.type === 'link') {
				setRuntimeDialogRequest({
					type: 'link',
					range: resolvedRange,
					initialUrl: request.initialUrl,
					initialText: request.initialText,
					selectedText:
						request.selectedText ?? getSelectedTextForRange(resolvedRange),
				});
				return;
			}

			if (request.type === 'image') {
				setRuntimeDialogRequest({
					type: 'image',
					range: resolvedRange,
					initialUrl: request.initialUrl,
					initialAlt: request.initialAlt,
				});
				return;
			}

			if (request.type === 'formula') {
				setRuntimeDialogRequest({
					type: 'formula',
					range: resolvedRange,
					initialValue: request.initialValue,
				});
				return;
			}
		},
		[editor, getCurrentSelectionRange, getSelectedTextForRange]
	);

	useEffect(() => {
		const handleRuntimeDialogRequest = (event: Event): void => {
			const detail = (event as CustomEvent<DocEditorRuntimeDialogRequest>)
				.detail;
			if (!detail) {
				return;
			}

			openRuntimeDialog(detail);
		};

		window.addEventListener(
			DOC_EDITOR_RUNTIME_DIALOG_EVENT,
			handleRuntimeDialogRequest
		);
		return (): void => {
			window.removeEventListener(
				DOC_EDITOR_RUNTIME_DIALOG_EVENT,
				handleRuntimeDialogRequest
			);
		};
	}, [openRuntimeDialog]);

	const applyPendingTextColor = useCallback(
		(color: string) => {
			if (!editor) {
				return;
			}

			const chain = editor.chain().focus();
			if (pendingColorRange) {
				chain.setTextSelection(pendingColorRange);
			}
			chain.setColor(color).run();
			closeColorPicker();
		},
		[closeColorPicker, editor, pendingColorRange]
	);

	const applyPendingHighlightColor = useCallback(
		(color: string) => {
			if (!editor) {
				return;
			}

			const chain = editor.chain().focus();
			if (pendingColorRange) {
				chain.setTextSelection(pendingColorRange);
			}
			chain.toggleHighlight({ color }).run();
			closeColorPicker();
		},
		[closeColorPicker, editor, pendingColorRange]
	);

	const handleRuntimeLinkSubmit = useCallback(
		(url: string, text: string) => {
			if (
				!editor ||
				!runtimeDialogRequest ||
				runtimeDialogRequest.type !== 'link'
			) {
				return;
			}

			const selectedText = runtimeDialogRequest.selectedText?.trim() ?? '';
			const finalText = text.trim() || selectedText || url;
			const range = runtimeDialogRequest.range;
			const chain = editor.chain().focus();

			if (range && range.from !== range.to) {
				if (selectedText && finalText === selectedText) {
					chain.setTextSelection(range).setLink({ href: url }).run();
				} else {
					chain
						.deleteRange(range)
						.insertContent({
							type: 'text',
							text: finalText,
							marks: [{ type: 'link', attrs: { href: url } }],
						})
						.run();
				}
			} else {
				chain
					.insertContent({
						type: 'text',
						text: finalText,
						marks: [{ type: 'link', attrs: { href: url } }],
					})
					.run();
			}

			setRuntimeDialogRequest(null);
		},
		[editor, runtimeDialogRequest]
	);

	const handleRuntimeImageSubmit = useCallback(
		(url: string, alt: string) => {
			if (
				!editor ||
				!runtimeDialogRequest ||
				runtimeDialogRequest.type !== 'image'
			) {
				return;
			}

			const chain = editor.chain().focus();
			if (runtimeDialogRequest.range) {
				chain.deleteRange(runtimeDialogRequest.range);
			}
			chain
				.setImage({ src: shortenDataUrlForImageInsert(url.trim()), alt })
				.run();
			setRuntimeDialogRequest(null);
		},
		[editor, runtimeDialogRequest]
	);

	const handleRuntimeFormulaSubmit = useCallback(
		(value: string) => {
			if (
				!editor ||
				!runtimeDialogRequest ||
				runtimeDialogRequest.type !== 'formula'
			) {
				return;
			}

			const latex = normalizeInlineMathLatex(value);
			if (!latex) {
				setRuntimeDialogRequest(null);
				return;
			}

			const chain = editor.chain().focus();
			if (runtimeDialogRequest.range) {
				chain.deleteRange(runtimeDialogRequest.range);
			}
			chain
				.insertContent({
					type: 'inlineMath',
					attrs: { latex },
				})
				.run();
			setRuntimeDialogRequest(null);
		},
		[editor, runtimeDialogRequest]
	);

	const handleEditorClickCapture = useCallback(
		(event: React.MouseEvent<HTMLDivElement>): void => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) {
				return;
			}

			const anchor = target.closest(
				'[data-comment-thread-id]'
			) as HTMLElement | null;
			if (!anchor) {
				return;
			}

			const threadId = anchor.dataset.commentThreadId;
			if (!threadId) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			setAnchorQuickMenu({
				threadId,
				x: event.clientX,
				y: event.clientY,
			});
		},
		[]
	);

	const emitAnchorAction = useCallback(
		(threadId: string, action: 'open' | 'reply' | 'resolve'): void => {
			if (onCommentAnchorAction) {
				onCommentAnchorAction({ threadId, action });
			} else {
				onCommentAnchorClick?.(threadId);
			}
			setAnchorQuickMenu(null);
		},
		[onCommentAnchorAction, onCommentAnchorClick]
	);

	const handleOpenAnchorThread = useCallback(
		(threadId: string): void => {
			emitAnchorAction(threadId, 'open');
		},
		[emitAnchorAction]
	);

	const handleReplyAnchorThread = useCallback(
		(threadId: string): void => {
			emitAnchorAction(threadId, 'reply');
		},
		[emitAnchorAction]
	);

	const handleResolveAnchorThread = useCallback(
		(threadId: string): void => {
			emitAnchorAction(threadId, 'resolve');
		},
		[emitAnchorAction]
	);

	const handleCopyThreadLink = useCallback(
		async (threadId: string): Promise<void> => {
			const link = buildThreadDeepLink(window.location.href, threadId, {
				documentId,
			});
			try {
				await navigator.clipboard.writeText(link);
				setCopiedThreadId(threadId);
				if (copiedTimeoutRef.current !== null) {
					window.clearTimeout(copiedTimeoutRef.current);
				}
				copiedTimeoutRef.current = window.setTimeout(() => {
					setCopiedThreadId((current) =>
						current === threadId ? null : current
					);
					copiedTimeoutRef.current = null;
				}, 1800);
			} catch {
				window.prompt(
					i18n.t(`${ULTIMATE_DOC_EDITOR_NS}:commentAnchors.promptCopyLink`),
					link
				);
			}
		},
		[documentId]
	);

	useEffect(() => {
		if (!anchorQuickMenu) {
			return;
		}

		const handlePointerDown = (event: MouseEvent): void => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) {
				return;
			}

			if (target.closest('[data-anchor-quick-menu="true"]')) {
				return;
			}

			setAnchorQuickMenu(null);
		};

		const handleKeyDown = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') {
				setAnchorQuickMenu(null);
			}
		};

		window.addEventListener('pointerdown', handlePointerDown);
		window.addEventListener('keydown', handleKeyDown);

		return () => {
			window.removeEventListener('pointerdown', handlePointerDown);
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [anchorQuickMenu]);

	const bubbleMenuShouldShow = useCallback(
		({
			editor: ed,
			element,
			view,
			state,
			from,
			to,
		}: {
			editor: Editor;
			element: HTMLElement;
			view: EditorView;
			state: EditorState;
			from: number;
			to: number;
		}) => {
			if (!ed || (ed as { isDestroyed?: boolean }).isDestroyed) {
				return false;
			}
			const docView = (view as { docView?: unknown }).docView;
			if (!docView) {
				return false;
			}
			const { doc, selection } = state;
			const { empty } = selection;
			const isEmptyTextBlock =
				!doc.textBetween(from, to).length && isTextSelection(state.selection);
			const isChildOfMenu = element.contains(document.activeElement);
			const hasEditorFocus = view.hasFocus() || isChildOfMenu;
			if (!hasEditorFocus || empty || isEmptyTextBlock || !ed.isEditable) {
				return false;
			}
			return true;
		},
		[]
	);

	const floatingMenuShouldShow = useCallback(
		({
			editor: ed,
			view,
			state,
		}: {
			editor: Editor;
			view: EditorView;
			state: EditorState;
			oldState?: EditorState;
			from: number;
			to: number;
		}) => {
			if (!ed || (ed as { isDestroyed?: boolean }).isDestroyed) {
				return false;
			}
			const docViewFloating = (view as { docView?: unknown }).docView;
			if (!docViewFloating) {
				return false;
			}
			const { selection } = state;
			const { $anchor, empty } = selection;
			const isRootDepth = $anchor.depth === 1;
			const textSerializers = getTextSerializersFromSchema(ed.schema);
			const parentText = getText($anchor.parent, { textSerializers });
			const isEmptyTextBlock =
				$anchor.parent.isTextblock &&
				!$anchor.parent.type.spec.code &&
				!$anchor.parent.textContent &&
				$anchor.parent.childCount === 0 &&
				!parentText;
			if (
				!view.hasFocus() ||
				!empty ||
				!isRootDepth ||
				!isEmptyTextBlock ||
				!ed.isEditable
			) {
				return false;
			}
			return true;
		},
		[]
	);

	const shouldPreserveContextMenuSelection = useCallback(
		(clientX: number, clientY: number): boolean => {
			if (!editor) {
				return false;
			}
			const { selection } = editor.state;
			if (selection.empty || selection.from >= selection.to) {
				return false;
			}
			const coords = editor.view.posAtCoords({
				left: clientX,
				top: clientY,
			});
			if (!coords) {
				return true;
			}
			return coords.pos >= selection.from && coords.pos <= selection.to;
		},
		[editor]
	);

	const handleContextMenu = useCallback(
		(event: React.MouseEvent) => {
			if (!editable || !editor) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();

			const target = event.target as HTMLElement | null;
			const dom = editor.view.dom;

			const imgEl = target?.closest?.('img');
			if (imgEl && dom.contains(imgEl)) {
				try {
					const pos = editor.view.posAtDOM(imgEl as Node, 0);
					if (typeof pos === 'number') {
						editor.chain().focus().setNodeSelection(pos).run();
					}
				} catch {
					/* ignore ambiguous DOM */
				}
			} else {
				const anchorEl = target?.closest?.('a');
				if (anchorEl && dom.contains(anchorEl)) {
					try {
						const pos = editor.view.posAtDOM(anchorEl as Node, 0);
						if (typeof pos === 'number') {
							editor.chain().focus().setTextSelection(pos).run();
						}
					} catch {
						/* ignore */
					}
				} else if (
					shouldPreserveContextMenuSelection(event.clientX, event.clientY)
				) {
					if (!editor.view.hasFocus()) {
						editor.chain().focus().run();
					}
				} else {
					const coords = editor.view.posAtCoords({
						left: event.clientX,
						top: event.clientY,
					});
					if (coords) {
						editor.chain().focus().setTextSelection(coords.pos).run();
					} else {
						editor.chain().focus().run();
					}
				}
			}

			setContextMenuPosition({ x: event.clientX, y: event.clientY });
			setContextMenuOpen(true);
		},
		[editable, editor, shouldPreserveContextMenuSelection]
	);

	const showEmptyOnboarding =
		Boolean(editor) &&
		editable &&
		!(editor?.getText() ?? '').replace(/\u00a0/g, ' ').trim() &&
		!emptyOnboardingDismissed;

	if (!editor) {
		return (
			<DesktopAppPanel className="flex h-64 items-center justify-center">
				<DesktopAppEmptyState
					title={t('loadingEditorTitle')}
					description={t('loadingEditorDesc')}
				/>
			</DesktopAppPanel>
		);
	}

	return (
		<DesktopAppPanel
			className="tiptap-editor-wrapper flex min-h-0 flex-col overflow-hidden"
			onContextMenu={handleContextMenu}
		>
			{showEmptyOnboarding ? (
				<section
					className="shrink-0 border-b border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-accent)_12%,var(--desktop-surface-soft))] px-4 py-3"
					aria-label={t('shell.onboarding.emptyTitle')}
				>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-sm text-(--desktop-text-secondary)">
							<span className="font-semibold text-(--desktop-text-primary)">
								{t('shell.onboarding.emptyTitle')}
							</span>{' '}
							{t('shell.onboarding.emptyBody')}
						</p>
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							className="shrink-0 self-start sm:self-center"
							onClick={() => setEmptyOnboardingDismissed(true)}
						>
							{t('shell.onboarding.dismiss')}
						</DesktopAppButton>
					</div>
				</section>
			) : null}
			{/* Bubble Menu - appears when text is selected */}
			{editor && !floatingChromePaused && (
				<BubbleMenu
					editor={editor}
					shouldShow={bubbleMenuShouldShow}
					resizeDelay={120}
					options={tiptapFloatingUiOptions}
					className="bg-transparent! border-none! p-0! shadow-none!"
				>
					<DesktopAppMenuSurface className="flex items-center gap-1 p-2">
						<DesktopAppButton
							type="button"
							variant={editor.isActive('bold') ? 'accent' : 'ghost'}
							active={editor.isActive('bold')}
							size="icon"
							onClick={() => editor.chain().focus().toggleBold().run()}
							title={t('bubbleMenu.bold')}
							aria-label={t('bubbleMenu.boldAria')}
						>
							<BoldIcon width={18} height={18} />
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant={editor.isActive('italic') ? 'accent' : 'ghost'}
							active={editor.isActive('italic')}
							size="icon"
							onClick={() => editor.chain().focus().toggleItalic().run()}
							title={t('bubbleMenu.italic')}
							aria-label={t('bubbleMenu.italicAria')}
						>
							<ItalicIcon width={18} height={18} />
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant={editor.isActive('underline') ? 'accent' : 'ghost'}
							active={editor.isActive('underline')}
							size="icon"
							onClick={() => editor.chain().focus().toggleUnderline().run()}
							title={t('bubbleMenu.underline')}
							aria-label={t('bubbleMenu.underlineAria')}
						>
							<UnderlineIcon width={18} height={18} />
						</DesktopAppButton>
						<div className="mx-1 h-6 w-px bg-(--desktop-border-subtle)" />
						<div className="relative">
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="icon"
								onClick={(e) => {
									const rect = e.currentTarget.getBoundingClientRect();
									setPendingColorRange(getCurrentSelectionRange() ?? null);
									setColorPickerPosition({ x: rect.left, y: rect.bottom + 8 });
									setColorPickerOpen('text');
								}}
								title={t('bubbleMenu.textColor')}
								aria-label={t('bubbleMenu.textColorAria')}
							>
								<SwatchIcon width={18} height={18} />
							</DesktopAppButton>
						</div>
						<div className="relative">
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="icon"
								onClick={(e) => {
									const rect = e.currentTarget.getBoundingClientRect();
									setPendingColorRange(getCurrentSelectionRange() ?? null);
									setColorPickerPosition({ x: rect.left, y: rect.bottom + 8 });
									setColorPickerOpen('highlight');
								}}
								title={t('bubbleMenu.highlight')}
								aria-label={t('bubbleMenu.highlightAria')}
							>
								<SparklesIcon width={18} height={18} />
							</DesktopAppButton>
						</div>
						<div className="mx-1 h-6 w-px bg-(--desktop-border-subtle)" />
						<DesktopAppButton
							type="button"
							variant={editor.isActive('link') ? 'accent' : 'ghost'}
							active={editor.isActive('link')}
							size="icon"
							onClick={() => {
								const range = getCurrentSelectionRange();
								const selectedText = getSelectedTextForRange(range);
								openRuntimeDialog({
									type: 'link',
									range,
									initialUrl: editor.getAttributes('link').href || '',
									initialText: selectedText,
									selectedText,
								});
							}}
							title={t('bubbleMenu.link')}
							aria-label={t('bubbleMenu.linkAria')}
						>
							<LinkIcon width={18} height={18} />
						</DesktopAppButton>
					</DesktopAppMenuSurface>
				</BubbleMenu>
			)}

			{/* Floating Menu - appears on empty lines */}
			{editor && !floatingChromePaused && (
				<FloatingMenu
					editor={editor}
					shouldShow={floatingMenuShouldShow}
					resizeDelay={120}
					options={tiptapFloatingUiOptions}
					className="bg-transparent! border-none! p-0! shadow-none!"
				>
					<DesktopAppMenuSurface className="flex max-w-[min(100vw-2rem,520px)] flex-wrap items-center gap-1 p-2">
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							onClick={() =>
								editor.chain().focus().toggleHeading({ level: 1 }).run()
							}
						>
							H1
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							onClick={() =>
								editor.chain().focus().toggleHeading({ level: 2 }).run()
							}
						>
							H2
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							onClick={() =>
								editor.chain().focus().toggleHeading({ level: 3 }).run()
							}
						>
							H3
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							onClick={() =>
								editor.chain().focus().toggleHeading({ level: 4 }).run()
							}
						>
							H4
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							onClick={() =>
								editor.chain().focus().toggleHeading({ level: 5 }).run()
							}
						>
							H5
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							onClick={() =>
								editor.chain().focus().toggleHeading({ level: 6 }).run()
							}
						>
							H6
						</DesktopAppButton>
						<div className="mx-1 h-6 w-px shrink-0 bg-(--desktop-border-subtle)" />
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => editor.chain().focus().toggleBulletList().run()}
						>
							{t('floatingMenu.bulletList')}
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							className="gap-1.5"
							onClick={() => editor.chain().focus().toggleOrderedList().run()}
							title={t('floatingMenu.orderedListTitle')}
						>
							<NumberedListIcon width={16} height={16} className="opacity-80" />
							<span className="hidden sm:inline">
								{t('floatingMenu.orderedListLabel')}
							</span>
						</DesktopAppButton>
						<DesktopAppButton
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => editor.chain().focus().toggleTaskList().run()}
						>
							{t('floatingMenu.taskList')}
						</DesktopAppButton>
					</DesktopAppMenuSurface>
				</FloatingMenu>
			)}

			<div className="flex min-h-0 flex-1">
				{/* Номера блоков слева; мягкий перенос — строка с ↳; подсветка коллаба только на первой строке блока */}
				<div
					className="relative w-10 shrink-0 select-none border-r border-(--desktop-border-subtle) bg-(--desktop-surface-soft) font-mono text-sm text-(--desktop-text-dim) motion-reduce:transition-none"
					aria-hidden
				>
					<div
						data-gutter-track
						className={cn(
							'relative',
							gutterTrackTransitionEnabled &&
								'transition-[height] duration-150 ease-out motion-reduce:transition-none'
						)}
						style={{ height: gutterHeight }}
					>
						{visualLines.map((entry) => {
							const lineNum = entry.lineNumber;
							const onLine = activeCollaborators.filter(
								(c) =>
									!entry.isWrapContinuation &&
									c.cursor_position &&
									(c.cursor_position as { line?: number }).line === lineNum
							);
							const first = onLine[0];
							const color = first?.color?.trim() || '#3b82f6';
							const safeColor = /^#[0-9A-Fa-f]{6}$/.test(color)
								? color
								: '#3b82f6';
							const title =
								onLine.length > 0
									? onLine
											.map((c) =>
												t('gutter.collabEditing', {
													name:
														c.username ||
														c.email ||
														t('collabRemoteUserFallback'),
												})
											)
											.join(', ')
									: undefined;

							return (
								<div
									key={`${lineNum}-${entry.top}-${entry.isWrapContinuation ? 'w' : 'b'}`}
									className={cn(
										'absolute left-0 right-0 rounded-r pr-2 text-right transition-colors duration-150 ease-out motion-reduce:transition-none',
										entry.isWrapContinuation &&
											'text-[0.95rem] text-(--desktop-text-dim) opacity-75'
									)}
									style={{
										top: entry.top,
										height: entry.height,
										lineHeight: `${entry.height}px`,
										...(onLine.length > 0
											? {
													backgroundColor: `${safeColor}18`,
													borderLeft: `3px solid ${safeColor}`,
													marginLeft: '-3px',
													color: safeColor,
												}
											: undefined),
									}}
									title={title}
								>
									{entry.isWrapContinuation ? (
										<span aria-hidden title={t('gutter.lineWrapTitle')}>
											↳
										</span>
									) : (
										lineNum
									)}
									{onLine.length > 1 && (
										<span
											className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5"
											title={title}
										>
											{onLine.slice(0, 3).map((c) => {
												const ccolor =
													c.color?.trim() && /^#[0-9A-Fa-f]{6}$/.test(c.color)
														? c.color
														: '#3b82f6';
												return (
													<span
														key={c.user_id}
														className="h-1.5 w-1.5 shrink-0 rounded-full"
														style={{ backgroundColor: ccolor }}
													/>
												);
											})}
										</span>
									)}
								</div>
							);
						})}
					</div>
				</div>
				<div
					ref={editorHostRef}
					className="min-h-0 min-w-0 flex-1"
					onClickCapture={handleEditorClickCapture}
				>
					<EditorContent editor={editor} />
				</div>
			</div>

			{/* Context Menu */}
			{contextMenuOpen ? (
				<Suspense fallback={null}>
					<EditorContextMenu
						editor={editor}
						isOpen={contextMenuOpen}
						position={contextMenuPosition}
						onClose={() => setContextMenuOpen(false)}
						shellWindowStyle={shellWindowStyle}
						desktopUiScale={desktopUiScale}
					/>
				</Suspense>
			) : null}
			{runtimeDialogRequest?.type === 'link' ? (
				<Suspense fallback={null}>
					<RuntimeLinkDialog
						isOpen
						onClose={() => setRuntimeDialogRequest(null)}
						onSubmit={handleRuntimeLinkSubmit}
						initialUrl={runtimeDialogRequest.initialUrl}
						initialText={runtimeDialogRequest.initialText}
						selectedText={runtimeDialogRequest.selectedText}
					/>
				</Suspense>
			) : null}
			{runtimeDialogRequest?.type === 'image' ? (
				<Suspense fallback={null}>
					<RuntimeImageDialog
						isOpen
						onClose={() => setRuntimeDialogRequest(null)}
						onSubmit={handleRuntimeImageSubmit}
						initialUrl={runtimeDialogRequest.initialUrl}
						initialAlt={runtimeDialogRequest.initialAlt}
					/>
				</Suspense>
			) : null}
			{runtimeDialogRequest?.type === 'formula' ? (
				<Suspense fallback={null}>
					<RuntimeTextPromptDialog
						isOpen
						onClose={() => setRuntimeDialogRequest(null)}
						onSubmit={handleRuntimeFormulaSubmit}
						title={t('formulaDialog.title')}
						description={t('formulaDialog.description')}
						label={t('formulaDialog.label')}
						placeholder={t('formulaDialog.placeholder')}
						submitLabel={t('formulaDialog.submit')}
						initialValue={runtimeDialogRequest.initialValue}
						icon={CodeBracketSquareIcon}
					/>
				</Suspense>
			) : null}
			{colorPickerOpen ? (
				<Suspense fallback={null}>
					<ColorPicker
						type={colorPickerOpen}
						currentColor={
							colorPickerOpen === 'text'
								? editor.getAttributes('textStyle').color || '#000000'
								: editor.getAttributes('highlight').color || '#FFFF00'
						}
						onColorChange={
							colorPickerOpen === 'text'
								? applyPendingTextColor
								: applyPendingHighlightColor
						}
						onClose={closeColorPicker}
						position={colorPickerPosition}
					/>
				</Suspense>
			) : null}
			{anchorQuickMenu ? (
				<DesktopAppMenuSurface
					data-anchor-quick-menu="true"
					className="fixed min-w-[220px] p-2"
					style={{
						zIndex: embeddedModalZ.content,
						left: Math.max(12, anchorQuickMenu.x + 10),
						top: Math.max(12, anchorQuickMenu.y + 8),
					}}
				>
					<div className="px-2 pb-2 pt-1">
						<div className="text-xs font-semibold text-(--desktop-text-primary)">
							{t('anchorQuickMenu.title')}
						</div>
						<div className="mt-0.5 text-[11px] text-(--desktop-text-muted)">
							{t('anchorQuickMenu.stats', {
								open:
									commentAnchorMeta[anchorQuickMenu.threadId]
										?.unresolvedComments ?? 0,
								total:
									commentAnchorMeta[anchorQuickMenu.threadId]?.totalComments ??
									0,
							})}
						</div>
					</div>
					<DesktopAppButton
						type="button"
						variant="accent"
						size="sm"
						className="w-full justify-start"
						onClick={() => handleOpenAnchorThread(anchorQuickMenu.threadId)}
					>
						{t('anchorQuickMenu.openThread')}
					</DesktopAppButton>
					<DesktopAppButton
						type="button"
						variant="neutral"
						size="sm"
						className="mt-1 w-full justify-start"
						onClick={() => handleReplyAnchorThread(anchorQuickMenu.threadId)}
					>
						{t('anchorQuickMenu.replyThread')}
					</DesktopAppButton>
					<DesktopAppButton
						type="button"
						variant="neutral"
						size="sm"
						className="mt-1 w-full justify-start"
						disabled={
							(commentAnchorMeta[anchorQuickMenu.threadId]
								?.unresolvedComments ?? 0) === 0
						}
						onClick={() => handleResolveAnchorThread(anchorQuickMenu.threadId)}
					>
						{t('anchorQuickMenu.resolveThread')}
					</DesktopAppButton>
					<DesktopAppButton
						type="button"
						variant="neutral"
						size="sm"
						className="mt-1 w-full justify-start"
						onClick={() => void handleCopyThreadLink(anchorQuickMenu.threadId)}
					>
						{copiedThreadId === anchorQuickMenu.threadId
							? t('anchorQuickMenu.linkCopied')
							: t('anchorQuickMenu.copyLink')}
					</DesktopAppButton>
					<DesktopAppButton
						type="button"
						variant="ghost"
						size="sm"
						className="mt-1 w-full justify-start"
						onClick={() => setAnchorQuickMenu(null)}
					>
						{t('anchorQuickMenu.cancel')}
					</DesktopAppButton>
				</DesktopAppMenuSurface>
			) : null}
			<style>{`
        .tiptap.ProseMirror {
          color: var(--desktop-text-primary);
        }

        .tiptap.ProseMirror ::selection {
          background: rgba(var(--desktop-accent-rgb), 0.28);
        }

        .tiptap.ProseMirror.comment-anchor-flash {
          animation: comment-anchor-pulse 1.2s ease-out;
        }

        .tiptap .comment-anchor-range {
          border-radius: 4px;
          box-decoration-break: clone;
          transition: background-color 140ms ease, box-shadow 140ms ease;
        }
        @media (prefers-reduced-motion: reduce) {
          .tiptap .comment-anchor-range {
            transition: none;
          }
          .tiptap.ProseMirror.comment-anchor-flash {
            animation: none;
          }
        }
        .tiptap .comment-anchor-open {
          background: rgba(59, 130, 246, 0.2);
          box-shadow: inset 0 -1px 0 rgba(96, 165, 250, 0.5);
        }
        .tiptap .comment-anchor-resolved {
          background: rgba(34, 197, 94, 0.14);
          box-shadow: inset 0 -1px 0 rgba(74, 222, 128, 0.35);
        }
        .tiptap .comment-anchor-active {
          background: rgba(var(--desktop-accent-rgb), 0.35);
          box-shadow: inset 0 -1px 0 rgba(var(--desktop-accent-rgb), 0.95), 0 0 0 1px rgba(var(--desktop-accent-rgb), 0.45);
        }

        @keyframes comment-anchor-pulse {
          0% {
            box-shadow: inset 0 0 0 1px rgba(var(--desktop-accent-rgb), 0.78), 0 0 0 0 rgba(var(--desktop-accent-rgb), 0.22);
            background: linear-gradient(120deg, rgba(var(--desktop-accent-rgb), 0.16), transparent 40%);
          }
          70% {
            box-shadow: inset 0 0 0 1px rgba(var(--desktop-accent-rgb), 0.2), 0 0 0 10px rgba(var(--desktop-accent-rgb), 0);
            background: linear-gradient(120deg, rgba(var(--desktop-accent-rgb), 0.04), transparent 40%);
          }
          100% {
            box-shadow: inset 0 0 0 1px rgba(var(--desktop-accent-rgb), 0.08), 0 0 0 14px rgba(var(--desktop-accent-rgb), 0);
            background: transparent;
          }
        }

        /* Совместное редактирование: чужие курсоры и выделения (TipTap CollaborationCaret + y-tiptap) */
        .tiptap .collaboration-carets__caret.doc-collab-remote-caret,
        .ProseMirror .collaboration-carets__caret.doc-collab-remote-caret {
          position: relative;
          z-index: 6;
          pointer-events: none;
          vertical-align: text-top;
          min-height: 1.35em;
          margin-left: -1px;
        }
        .tiptap .collaboration-carets__label.doc-collab-remote-label,
        .ProseMirror .collaboration-carets__label.doc-collab-remote-label {
          position: absolute;
          left: 0;
          bottom: 100%;
          margin-bottom: 4px;
          margin-left: -2px;
          max-width: min(14rem, 70vw);
          padding: 3px 9px 4px;
          border-radius: 0.5rem;
          font-size: 11px;
          font-weight: 600;
          line-height: 1.2;
          color: rgba(255, 255, 255, 0.98);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          box-shadow:
            0 4px 14px rgba(0, 0, 0, 0.22),
            0 0 0 1px rgba(0, 0, 0, 0.14);
          z-index: 10;
          pointer-events: none;
        }
        .tiptap .ProseMirror-yjs-selection,
        .tiptap .doc-collab-remote-selection {
          border-radius: 5px;
          opacity: 0.58;
        }

        /* Локальный пользователь: мягкая подсветка блока, где стоит курсор (совместный режим) */
        .tiptap .doc-collab-local-typing-block {
          border-radius: 6px;
          background: rgba(var(--desktop-accent-rgb), 0.1);
          box-shadow:
            inset 0 0 0 1px rgba(var(--desktop-accent-rgb), 0.28),
            0 0 0 1px rgba(var(--desktop-accent-rgb), 0.06);
        }
        @media (prefers-reduced-motion: reduce) {
          .tiptap .doc-collab-local-typing-block {
            box-shadow: inset 0 0 0 1px rgba(var(--desktop-accent-rgb), 0.32);
          }
        }
        /* Легаси-классы y-prosemirror (если встретятся в старых путях) */
        .tiptap [class*="collaboration-cursor__selection"],
        .ProseMirror [class*="collaboration-cursor__selection"] {
          border-radius: 4px;
          opacity: 0.52;
        }

        /*
         * Bullet / ordered lists: Tailwind preflight sets list-style: none and zero padding on ul/ol.
         * We do not use @tailwindcss/typography here, so .prose does not restore markers — lists looked "broken"
         * while toggleBulletList / toggleOrderedList still updated the document (toolbar stayed "active").
         */
        .tiptap.ProseMirror ul:not(.task-list) {
          list-style-type: disc;
          list-style-position: outside;
          padding-left: 1.5rem;
          margin: 0.75rem 0;
        }
        .tiptap.ProseMirror ol:not(.task-list) {
          list-style-type: decimal;
          list-style-position: outside;
          padding-left: 1.5rem;
          margin: 0.75rem 0;
        }
        .tiptap.ProseMirror ul:not(.task-list) ul {
          list-style-type: circle;
        }
        .tiptap.ProseMirror ul:not(.task-list) ul ul {
          list-style-type: square;
        }
        .tiptap.ProseMirror li > p {
          margin: 0.25rem 0;
        }
        .tiptap.ProseMirror li > p:first-child {
          margin-top: 0;
        }
        .tiptap.ProseMirror li > p:last-child {
          margin-bottom: 0;
        }

        /* Task list styles */
        .task-list {
          list-style: none;
          padding-left: 0;
        }
        .task-item {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
        }
        .task-item input[type="checkbox"] {
          margin-top: 0.25rem;
          cursor: pointer;
        }

        /* Highlight styles */
        .highlight {
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
        }

        /* Horizontal rule styles */
        .horizontal-rule {
          border: none;
          border-top: 2px solid rgba(var(--desktop-accent-rgb), 0.35);
          margin: 1.5rem 0;
        }

        /* Math formula styles */
        .math-formula {
          display: inline-block;
          margin: 0.5rem 0;
        }

        /* Code block improvements */
        .code-block {
          position: relative;
        }
        .code-block pre {
          margin: 0;
          padding: 1rem;
          background: var(--desktop-surface-soft);
          color: var(--desktop-text-primary);
          border: 1px solid var(--desktop-border-subtle);
          border-radius: var(--desktop-radius-lg);
          overflow-x: auto;
        }
        .editor-table {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid var(--desktop-border-subtle);
          overflow: hidden;
          border-radius: var(--desktop-radius-lg);
        }
        .editor-table-row {
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .editor-table-cell {
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 0.5rem 0.75rem;
        }
        .editor-table-header {
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 0.5rem 0.75rem;
          background: var(--desktop-surface-soft);
          font-weight: 700;
        }
        .editor-content-image {
          display: block;
          max-width: 100%;
          height: auto;
          border-radius: var(--desktop-radius-lg);
          box-shadow: var(--desktop-shadow-soft);
        }
        .editor-link {
          color: rgb(var(--desktop-accent-rgb));
          text-decoration: underline;
          cursor: pointer;
        }
      `}</style>
		</DesktopAppPanel>
	);
};

export const TiptapEditorCore: React.FC<TiptapEditorCoreProps> = ({
	collaborationExtensions = EMPTY_EXTENSIONS,
	...props
}) => {
	const { t } = useTranslation(ULTIMATE_DOC_EDITOR_NS);
	const [optionalExtensions, setOptionalExtensions] = useState<
		AnyExtension[] | null
	>(null);

	useEffect(() => {
		let isCancelled = false;

		void import('./createOptionalTiptapExtensions')
			.then(({ createOptionalTiptapExtensions }) => {
				if (!isCancelled) {
					setOptionalExtensions(createOptionalTiptapExtensions());
				}
			})
			.catch((error) => {
				log.error(
					'TiptapEditor',
					'Failed to load optional editor extensions',
					error instanceof Error ? error : undefined,
					error
				);
				if (!isCancelled) {
					setOptionalExtensions(EMPTY_EXTENSIONS);
				}
			});

		return () => {
			isCancelled = true;
		};
	}, []);

	if (!optionalExtensions) {
		return (
			<DesktopAppPanel className="flex h-64 items-center justify-center">
				<DesktopAppEmptyState
					title={t('loadingEditorTitle')}
					description={t('loadingEditorExtensions')}
				/>
			</DesktopAppPanel>
		);
	}

	return (
		<TiptapEditorInner
			{...props}
			collaborationExtensions={collaborationExtensions}
			optionalExtensions={optionalExtensions}
		/>
	);
};

export const TiptapEditor: React.FC<TiptapEditorProps> = (props) => {
	const { documentId, enableCollaboration = false } = props;
	const { t } = useTranslation(ULTIMATE_DOC_EDITOR_NS);

	if (enableCollaboration && documentId) {
		return (
			<Suspense
				fallback={
					<div
						className="flex min-h-[min(640px,70vh)] w-full flex-col items-center justify-center gap-3 px-4 text-center text-slate-400"
						role="status"
						aria-live="polite"
					>
						<ArrowPathIcon
							className="h-10 w-10 shrink-0 animate-spin text-[rgb(var(--desktop-accent-rgb))]"
							aria-hidden
						/>
						<span className="font-medium text-(--desktop-text-secondary)">
							{t('collabLoading')}
						</span>
						<span className="text-xs text-(--desktop-text-muted)">
							{t('collabStatus.connecting')}
						</span>
					</div>
				}
			>
				<CollaborativeTiptapEditor {...props} />
			</Suspense>
		);
	}

	return <TiptapEditorCore {...props} />;
};
