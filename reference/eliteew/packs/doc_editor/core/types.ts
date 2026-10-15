/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Local UI type boundary for Document Editor V2 shell/core state before the OpenAPI pilot exists.
 * Keeps UI state isolated from the legacy UltimateDocEditor contracts.
 *
 * Invariants:
 * - These types describe shell state only and must not become a parallel API DTO source once generated v2 types exist.
 * - EWA suggestions are read-only until the guarded apply contract is implemented.
 *
 * Related:
 * - documentation/product/DOCUMENT-EDITOR-V2.md
 */

import type { ReactNode } from 'react';

export type DocEditorV2SaveStatus =
	| 'draft'
	| 'synced'
	| 'saving'
	| 'conflict'
	| 'readonly';

export interface DocEditorV2Collaborator {
	id: string;
	name: string;
	role: 'owner' | 'editor' | 'reviewer' | 'viewer';
	isActive?: boolean;
}

export interface DocEditorV2OutlineItem {
	id: string;
	title: string;
	level: 1 | 2 | 3;
	status?: 'ready' | 'needs-review' | 'placeholder';
}

export interface DocEditorV2ImportWarning {
	id: string;
	title: string;
	detail: string;
	tone: 'info' | 'warning';
}

export interface DocEditorV2Suggestion {
	id: string;
	title: string;
	description: string;
	source: 'ewa' | 'review';
	status: 'queued' | 'needs-approval' | 'blocked';
}

export interface DocEditorV2ShellState {
	documentId: string | null;
	title: string;
	versionLabel: string;
	saveStatus: DocEditorV2SaveStatus;
	wordCount: number;
	plainTextPreview: string;
	collaborators: DocEditorV2Collaborator[];
	outlineItems: DocEditorV2OutlineItem[];
	importWarnings: DocEditorV2ImportWarning[];
	suggestions: DocEditorV2Suggestion[];
}

export interface DocEditorV2ShellProps {
	state?: Partial<DocEditorV2ShellState>;
	className?: string;
	editorCanvas?: ReactNode;
	statusDescription?: string;
	onImportFile?: (file: File) => void;
	onOpenPaperless?: () => void;
	onExportMarkdown?: () => void;
	onRequestEwaSuggestion?: () => void;
	onApplySuggestion?: (suggestionId: string) => void;
	onFallbackToLegacy?: () => void;
}
