/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Preview-only seed state for the first Document Editor V2 shell.
 * Separates shell demo content from component layout while the API contract is not wired.
 *
 * Invariants:
 * - Data here is static preview state, not persisted document state.
 * - Remove or replace with generated/OpenAPI-backed state when the v2 service exists.
 *
 * Related:
 * - documentation/product/DOCUMENT-EDITOR-V2.md
 */

import type { DocEditorV2SaveStatus, DocEditorV2ShellState } from './types';

export const DOC_EDITOR_V2_DEFAULT_SHELL_STATE: DocEditorV2ShellState = {
	documentId: null,
	title: 'Новый документ V2',
	versionLabel: 'новый документ',
	saveStatus: 'draft',
	wordCount: 1284,
	plainTextPreview: 'Начните писать документ V2…',
	collaborators: [
		{ id: 'owner', name: 'Владелец', role: 'owner', isActive: true },
		{ id: 'ewa', name: 'ЕВА', role: 'reviewer', isActive: true },
	],
	outlineItems: [
		{ id: 'intro', title: 'Цель документа', level: 1, status: 'ready' },
		{ id: 'model', title: 'Сохранение', level: 2, status: 'ready' },
		{
			id: 'collab',
			title: 'Совместная работа',
			level: 2,
			status: 'placeholder',
		},
	],
	importWarnings: [
		{
			id: 'docx-fidelity',
			title: 'Здесь появятся замечания импорта',
			detail:
				'Предупреждения о точности импорта останутся видимыми до сохранения документа.',
			tone: 'info',
		},
	],
	suggestions: [],
};

export const DOC_EDITOR_V2_SAVE_STATUS_CLASS: Record<
	DocEditorV2SaveStatus,
	string
> = {
	draft: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
	synced: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
	saving: 'border-sky-400/30 bg-sky-500/10 text-sky-100',
	conflict: 'border-red-400/35 bg-red-500/10 text-red-100',
	readonly:
		'border-(--desktop-border-subtle) bg-(--desktop-surface-soft) text-(--desktop-text-secondary)',
};
