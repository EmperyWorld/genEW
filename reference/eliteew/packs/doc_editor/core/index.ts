/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Public exports for the isolated Document Editor V2 frontend feature.
 *
 * Invariants:
 * - Consumers import V2 explicitly; legacy DocEditor default behavior is not re-exported from here.
 *
 * Related:
 * - documentation/product/DOCUMENT-EDITOR-V2.md
 */

export { DocEditorV2, default } from './DocEditorV2';
export { DocEditorV2Core } from './DocEditorV2Core';
export { DocEditorV2Shell } from './DocEditorV2Shell';
export {
	buildCreateRequest,
	buildDraftRequest,
	buildShellStateFromViewModel,
	buildUpdateRequest,
	documentToDraft,
	htmlToMarkdownish,
	htmlToPlainText,
	participantsToCollaborators,
	plainTextToHtml,
	structureToOutlineItems,
	suggestionsToRailItems,
	warningsFromDocument,
} from './docEditorV2State';
export type {
	DocEditorV2EditorDraft,
	DocEditorV2ViewModel,
} from './docEditorV2State';
export type {
	DocEditorV2Collaborator,
	DocEditorV2ImportWarning,
	DocEditorV2OutlineItem,
	DocEditorV2SaveStatus,
	DocEditorV2ShellProps,
	DocEditorV2ShellState,
	DocEditorV2Suggestion,
} from './types';
