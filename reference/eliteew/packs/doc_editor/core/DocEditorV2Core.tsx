/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Minimal TipTap/ProseMirror editing core for Document Editor V2.
 * Owns the editable canvas UI and emits canonical HTML/plain-text projections to the per-window state.
 *
 * Invariants:
 * - Core never saves by itself; callers perform guarded create/save/draft requests.
 * - Disabled/read-only mode must keep the editor non-editable when capabilities deny editing.
 *
 * Related:
 * - src/features/documentEditorV2/DocEditorV2.tsx
 * - documentation/product/DOCUMENT-EDITOR-V2.md
 */

import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { DOC_EDITOR_V2_NS } from '@/i18n/namespaces';
import {
	DesktopAppButton,
	DesktopAppStatusBadge,
} from '@/pages/Desktop/components/DesktopAppChrome';
import { cn } from '@/utils/cn';

import type { DocEditorV2EditorDraft } from './docEditorV2State';
import type { DocEditorV2SaveStatus } from './types';

export interface DocEditorV2CoreProps {
	draft: DocEditorV2EditorDraft;
	saveStatus: DocEditorV2SaveStatus;
	canEdit: boolean;
	canSaveDraft: boolean;
	errorMessage?: string | null;
	onDraftChange: (draft: DocEditorV2EditorDraft) => void;
	onSave: () => void;
	onSaveDraft: () => void;
	onForceSave?: () => void;
}

export function DocEditorV2Core({
	draft,
	saveStatus,
	canEdit,
	canSaveDraft,
	errorMessage,
	onDraftChange,
	onSave,
	onSaveDraft,
	onForceSave,
}: DocEditorV2CoreProps) {
	const { t } = useTranslation(DOC_EDITOR_V2_NS);
	const editor = useEditor({
		extensions: [StarterKit],
		content: draft.contentHtml,
		editable: canEdit,
		immediatelyRender: false,
		editorProps: {
			attributes: {
				class:
					'doc-editor-v2-prosemirror min-h-[28rem] outline-none text-base leading-8 text-(--desktop-text-secondary)',
				'aria-label': t('aria.editableSurface'),
			},
		},
		onUpdate: ({ editor: nextEditor }) => {
			onDraftChange({
				...draft,
				contentHtml: nextEditor.getHTML(),
				plainText: nextEditor.getText({ blockSeparator: '\n\n' }),
			});
		},
	});

	useEffect(() => {
		editor?.setEditable(canEdit);
	}, [canEdit, editor]);

	useEffect(() => {
		if (!editor || editor.isDestroyed) return;
		if (editor.getHTML() === draft.contentHtml) return;
		editor.commands.setContent(draft.contentHtml, { emitUpdate: false });
	}, [draft.contentHtml, editor]);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--desktop-border-subtle) px-3 py-2">
				<label className="min-w-0 flex-1">
					<span className="sr-only">{t('aria.titleInput')}</span>
					<input
						value={draft.title}
						onChange={(event) =>
							onDraftChange({ ...draft, title: event.currentTarget.value })
						}
						disabled={!canEdit}
						className="w-full rounded-(--desktop-radius) border border-transparent bg-transparent px-2 py-1 text-base font-semibold text-(--desktop-text-primary) outline-none transition focus:border-(--desktop-border-strong) focus:bg-(--desktop-surface-soft)"
					/>
				</label>
				<div className="flex flex-wrap items-center gap-2">
					<DesktopAppStatusBadge>
						{canEdit ? t('core.editable') : t('core.readOnly')}
					</DesktopAppStatusBadge>
					<DesktopAppButton
						type="button"
						variant="ghost"
						size="sm"
						disabled={!canSaveDraft || !canEdit}
						onClick={onSaveDraft}
					>
						{t('actions.saveDraft')}
					</DesktopAppButton>
					<DesktopAppButton
						type="button"
						variant="primary"
						size="sm"
						disabled={!canEdit || saveStatus === 'saving'}
						onClick={onSave}
					>
						{saveStatus === 'saving' ? t('actions.saving') : t('actions.save')}
					</DesktopAppButton>
					{saveStatus === 'conflict' && onForceSave ? (
						<DesktopAppButton
							type="button"
							variant="neutral"
							size="sm"
							onClick={onForceSave}
						>
							{t('actions.forceSaveLocal')}
						</DesktopAppButton>
					) : null}
				</div>
			</div>
			{errorMessage ? (
				<div className="border-b border-red-400/20 bg-red-500/10 px-4 py-2 text-sm text-red-100">
					{errorMessage}
				</div>
			) : null}
			<div
				className={cn(
					'min-h-0 flex-1 overflow-auto p-5',
					!canEdit && 'opacity-80'
				)}
			>
				<div className="mx-auto min-h-full max-w-3xl rounded-(--desktop-radius-lg) border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-panel-strong)_86%,white_4%)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
					<EditorContent editor={editor} />
				</div>
			</div>
		</div>
	);
}

export default DocEditorV2Core;
