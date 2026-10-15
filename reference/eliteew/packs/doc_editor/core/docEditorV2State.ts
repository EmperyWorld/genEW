/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Pure state/projection helpers for Document Editor V2 save, draft and conflict flows.
 * Keeps canonical payload construction out of React components.
 *
 * Invariants:
 * - Save payloads always carry HTML, Markdown-ish text and plain text projections together.
 * - Version conflicts keep the server document explicit instead of overwriting local text silently.
 *
 * Related:
 * - src/features/documentEditorV2/DocEditorV2.tsx
 * - src/services/documentEditorV2Api.ts
 */

import type {
	DocEditorV2CollaborationParticipant,
	DocEditorV2CreateRequest,
	DocEditorV2DocumentResponse,
	DocEditorV2DraftRequest,
	DocEditorV2StructureItem,
	DocEditorV2SuggestionResponse,
	DocEditorV2UpdateRequest,
} from '@/services/documentEditorV2Api';

import type {
	DocEditorV2Collaborator,
	DocEditorV2ImportWarning,
	DocEditorV2OutlineItem,
	DocEditorV2SaveStatus,
	DocEditorV2ShellState,
	DocEditorV2Suggestion,
} from './types';

export interface DocEditorV2EditorDraft {
	title: string;
	contentHtml: string;
	plainText: string;
}

export interface DocEditorV2ViewModel {
	document: DocEditorV2DocumentResponse | null;
	draft: DocEditorV2EditorDraft;
	saveStatus: DocEditorV2SaveStatus;
	conflictDocument: DocEditorV2DocumentResponse | null;
	structureItems: DocEditorV2StructureItem[];
	participants: DocEditorV2CollaborationParticipant[];
	suggestions: DocEditorV2SuggestionResponse[];
	errorMessage: string | null;
}

export interface DocEditorV2StateLabels {
	collaboratorName: string;
	defaultPreview: string;
	fidelityWarningDetail: string;
	newVersionLabel: string;
	ownerName: string;
	untitledTitle: string;
	viewerName: string;
	versionLabel: (version: number) => string;
}

const DEFAULT_STATE_LABELS: DocEditorV2StateLabels = {
	collaboratorName: 'Редактор',
	defaultPreview: 'Начните писать документ V2…',
	fidelityWarningDetail:
		'Контур импорта/экспорта сообщил замечание о точности для этого документа.',
	newVersionLabel: 'новый документ',
	ownerName: 'Владелец',
	untitledTitle: 'Без названия',
	viewerName: 'Наблюдатель',
	versionLabel: (version) => `v${version}`,
};

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

export function plainTextToHtml(plainText: string): string {
	const paragraphs = (plainText || '').split(/\n{2,}/);
	if (paragraphs.length === 0) {
		return '<p></p>';
	}
	return paragraphs
		.map((paragraph) => {
			const lines = paragraph.split('\n').map((line) => escapeHtml(line));
			return `<p>${lines.join('<br />')}</p>`;
		})
		.join('');
}

export function htmlToPlainText(html: string): string {
	return (html || '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p\s*>/gi, '\n\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export function htmlToMarkdownish(html: string): string {
	return `${htmlToPlainText(html)}\n`;
}

export function documentToDraft(
	document: DocEditorV2DocumentResponse | null,
	fallbackTitle: string
): DocEditorV2EditorDraft {
	if (!document) {
		return {
			title: fallbackTitle,
			contentHtml: '<p></p>',
			plainText: '',
		};
	}
	return {
		title: document.title,
		contentHtml: document.content_html || plainTextToHtml(document.plain_text),
		plainText: document.plain_text,
	};
}

export function buildCreateRequest(
	draft: DocEditorV2EditorDraft,
	labels: Pick<DocEditorV2StateLabels, 'untitledTitle'> = DEFAULT_STATE_LABELS
): DocEditorV2CreateRequest {
	return {
		title: draft.title.trim() || labels.untitledTitle,
		editor_format: 'html',
		content_html: draft.contentHtml,
		content_markdown: htmlToMarkdownish(draft.contentHtml),
		plain_text: draft.plainText,
		source_format: 'html',
	};
}

export function buildUpdateRequest(
	document: DocEditorV2DocumentResponse,
	draft: DocEditorV2EditorDraft,
	forceSave = false,
	labels: Pick<DocEditorV2StateLabels, 'untitledTitle'> = DEFAULT_STATE_LABELS
): DocEditorV2UpdateRequest {
	return {
		...buildCreateRequest(draft, labels),
		expected_version: document.version,
		force_save: forceSave,
	};
}

export function buildDraftRequest(
	document: DocEditorV2DocumentResponse,
	draft: DocEditorV2EditorDraft,
	labels: Pick<DocEditorV2StateLabels, 'untitledTitle'> = DEFAULT_STATE_LABELS
): DocEditorV2DraftRequest {
	return {
		base_document_version: document.version,
		title: draft.title.trim() || labels.untitledTitle,
		editor_format: 'html',
		content_html: draft.contentHtml,
		content_markdown: htmlToMarkdownish(draft.contentHtml),
		plain_text: draft.plainText,
	};
}

export function structureToOutlineItems(
	items: DocEditorV2StructureItem[]
): DocEditorV2OutlineItem[] {
	return items.map((item) => ({
		id: item.id,
		title: item.title,
		level: item.level >= 3 ? 3 : item.level === 2 ? 2 : 1,
		status: 'ready',
	}));
}

export function warningsFromDocument(
	document: DocEditorV2DocumentResponse | null,
	labels: Pick<
		DocEditorV2StateLabels,
		'fidelityWarningDetail'
	> = DEFAULT_STATE_LABELS
): DocEditorV2ImportWarning[] {
	return (document?.parse_warnings ?? []).map((warning, index) => ({
		id: `warning-${index}`,
		title: warning,
		detail: labels.fidelityWarningDetail,
		tone: 'warning',
	}));
}

export function participantsToCollaborators(
	participants: DocEditorV2CollaborationParticipant[],
	labels: Pick<
		DocEditorV2StateLabels,
		'collaboratorName' | 'ownerName' | 'viewerName'
	> = DEFAULT_STATE_LABELS
): DocEditorV2Collaborator[] {
	const seen = new Set<string>();
	return participants
		.filter((participant) => {
			if (seen.has(participant.user_id)) return false;
			seen.add(participant.user_id);
			return true;
		})
		.map((participant) => ({
			id: participant.user_id,
			name:
				participant.role === 'owner'
					? labels.ownerName
					: participant.can_save
						? labels.collaboratorName
						: labels.viewerName,
			role: participant.role,
			isActive: participant.is_active,
		}));
}

export function suggestionsToRailItems(
	suggestions: DocEditorV2SuggestionResponse[]
): DocEditorV2Suggestion[] {
	return suggestions.map((suggestion) => ({
		id: suggestion.id,
		title: suggestion.title,
		description:
			suggestion.replacement_text ??
			suggestion.comment_text ??
			suggestion.explanation,
		source: 'ewa',
		status:
			suggestion.status === 'needs_approval'
				? 'needs-approval'
				: suggestion.status === 'blocked'
					? 'blocked'
					: 'queued',
	}));
}

export function buildShellStateFromViewModel(
	viewModel: DocEditorV2ViewModel,
	labels: DocEditorV2StateLabels = DEFAULT_STATE_LABELS
): Partial<DocEditorV2ShellState> {
	const document = viewModel.document;
	return {
		documentId: document?.document_id ?? null,
		title: viewModel.draft.title,
		versionLabel: document
			? labels.versionLabel(document.version)
			: labels.newVersionLabel,
		saveStatus: viewModel.saveStatus,
		wordCount: viewModel.draft.plainText
			.split(/\s+/)
			.filter((word) => word.length > 0).length,
		plainTextPreview: viewModel.draft.plainText || labels.defaultPreview,
		collaborators: participantsToCollaborators(viewModel.participants, labels),
		outlineItems: structureToOutlineItems(viewModel.structureItems),
		importWarnings: warningsFromDocument(document, labels),
		suggestions: suggestionsToRailItems(viewModel.suggestions),
	};
}
