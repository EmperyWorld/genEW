/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Synchronizes external document HTML into a mounted TipTap editor without
 * overwriting live user input for the same focused document.
 *
 * Invariants:
 * - Yjs collaboration remains the source of truth when enabled.
 * - Equivalent initial content must still mark the document sync key, otherwise
 *   the next store debounce can be mistaken for a document switch.
 * - Programmatic TipTap writes must set `programmaticUpdateRef` before content mutation.
 *
 * Related:
 * - src/components/UltimateDocEditor/utils/docEditorInitialContentSync.ts
 */

import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { agentDebugLog } from '../utils/agentDebugLog';
import {
	markDocEditorInitialContentSynced,
	markDocEditorInitialContentSyncedIfEquivalent,
	shouldSuppressStaleEditorInitialContentSync,
} from '../utils/docEditorInitialContentSync';

export interface UseDocEditorTipTapContentSyncParams {
	tiptapEditor: Editor | null;
	editorInitialContent: string;
	collaborationEnabledForEditor: boolean;
	programmaticUpdateRef: MutableRefObject<boolean>;
	/** Stable key for open document (tab / file / canonical id). */
	documentSyncKey: string;
}

export interface UseDocEditorTipTapContentSyncResult {
	markSkipNextEditorInitialSync: () => void;
}

export function useDocEditorTipTapContentSync(
	params: UseDocEditorTipTapContentSyncParams
): UseDocEditorTipTapContentSyncResult {
	const {
		tiptapEditor,
		editorInitialContent,
		collaborationEnabledForEditor,
		programmaticUpdateRef,
		documentSyncKey,
	} = params;

	const suppressNextEditorInitialSyncRef = useRef(false);
	const lastSyncedDocumentKeyRef = useRef<string | null>(null);

	const markSkipNextEditorInitialSync = useCallback((): void => {
		suppressNextEditorInitialSyncRef.current = true;
	}, []);

	useEffect(() => {
		if (!tiptapEditor) {
			return;
		}
		if (collaborationEnabledForEditor) {
			return;
		}

		const incomingHtml = editorInitialContent;
		const currentHtml = tiptapEditor.getHTML();

		if (
			markDocEditorInitialContentSyncedIfEquivalent({
				incomingHtml,
				currentHtml,
				documentSyncKey,
				lastSyncedDocumentKeyRef,
			})
		) {
			return;
		}

		if (!incomingHtml) {
			// #region agent log (debug ddc74d)
			agentDebugLog({
				hypothesisId: 'H2',
				location: 'useDocEditorTipTapContentSync.ts:editorInitialContentSync',
				message: 'clearContent branch',
				data: {
					currentLen: currentHtml.length,
					incomingEmpty: true,
				},
				runId: 'pre-fix',
			});
			// #endregion
			programmaticUpdateRef.current = true;
			tiptapEditor.commands.clearContent(true);
			markDocEditorInitialContentSynced(
				lastSyncedDocumentKeyRef,
				documentSyncKey
			);
			return;
		}

		if (suppressNextEditorInitialSyncRef.current) {
			suppressNextEditorInitialSyncRef.current = false;
			// #region agent log (debug ddc74d)
			agentDebugLog({
				hypothesisId: 'H2',
				location: 'useDocEditorTipTapContentSync.ts:editorInitialContentSync',
				message: 'skipped setContent after pending insert',
				data: {
					incomingLen: incomingHtml.length,
					currentLen: currentHtml.length,
				},
				runId: 'post-fix',
			});
			// #endregion
			return;
		}

		if (
			shouldSuppressStaleEditorInitialContentSync({
				isEditorFocused: tiptapEditor.isFocused,
				incomingHtml,
				currentHtml,
				documentSyncKey,
				lastSyncedDocumentKeyRef,
			})
		) {
			// #region agent log (debug ddc74d)
			agentDebugLog({
				hypothesisId: 'H2',
				location: 'useDocEditorTipTapContentSync.ts:editorInitialContentSync',
				message: 'skipped stale setContent while focused',
				data: {
					incomingLen: incomingHtml.length,
					currentLen: currentHtml.length,
					documentSyncKey,
				},
				runId: 'cursor-jump-fix',
			});
			// #endregion
			return;
		}

		// #region agent log (debug ddc74d)
		agentDebugLog({
			hypothesisId: 'H2',
			location: 'useDocEditorTipTapContentSync.ts:editorInitialContentSync',
			message: 'setContent overwrite',
			data: {
				incomingLen: incomingHtml.length,
				currentLen: currentHtml.length,
			},
			runId: 'pre-fix',
		});
		// #endregion
		programmaticUpdateRef.current = true;
		tiptapEditor.commands.setContent(incomingHtml, { emitUpdate: false });
		markDocEditorInitialContentSynced(
			lastSyncedDocumentKeyRef,
			documentSyncKey
		);
	}, [
		tiptapEditor,
		editorInitialContent,
		collaborationEnabledForEditor,
		programmaticUpdateRef,
		documentSyncKey,
	]);

	return { markSkipNextEditorInitialSync };
}
