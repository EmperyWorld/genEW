/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * API client for the isolated Document Editor V2 backend contour.
 * Keeps all `/api/v1/doc-editor-v2/*` calls behind the shared authenticated API client.
 *
 * Invariants:
 * - Use `apiClient`; do not create a second axios/fetch stack.
 * - Request/response DTOs come from `doc-editor-v2-openapi.ts` (regenerate via openapi:pilot:doc-editor-v2).
 * - `DocEditorV2ConflictPayload` stays hand-typed (HTTP 409 detail shape not in OpenAPI schemas).
 *
 * Related:
 * - documentation/product/DOCUMENT-EDITOR-V2.md
 * - openapi/pilot/doc-editor-v2.openapi.json
 */

import type { components } from '@/generated/doc-editor-v2-openapi';

import { apiClient } from './api/client';

const DOC_EDITOR_V2_BASE = '/api/v1/doc-editor-v2';

type Schemas = components['schemas'];

export type DocEditorV2SourceFormat = Schemas['DocEditorV2SourceFormat'];
export type DocEditorV2EditorFormat = Schemas['DocEditorV2EditorFormat'];
export type DocEditorV2ExportFormat = Schemas['DocEditorV2ExportFormat'];
export type DocEditorV2Capabilities = Schemas['DocEditorV2Capabilities'];
export type DocEditorV2DocumentResponse =
	Schemas['DocEditorV2DocumentResponse'];
export type DocEditorV2CreateRequest = Schemas['DocEditorV2CreateRequest'];
export type DocEditorV2UpdateRequest = Schemas['DocEditorV2UpdateRequest'];
export type DocEditorV2DraftRequest = Schemas['DocEditorV2DraftRequest'];
export type DocEditorV2DraftResponse = Schemas['DocEditorV2DraftResponse'];
export type DocEditorV2StructureItem = Schemas['DocEditorV2StructureItem'];
export type DocEditorV2StructureResponse =
	Schemas['DocEditorV2StructureResponse'];
export type DocEditorV2CollaborationParticipant =
	Schemas['DocEditorV2CollaborationParticipant'];
export type DocEditorV2CollaborationStateResponse =
	Schemas['DocEditorV2CollaborationStateResponse'];
export type DocEditorV2CollaborationSnapshotRequest =
	Schemas['DocEditorV2CollaborationSnapshotRequest'];
export type DocEditorV2CollaborationSnapshotResponse =
	Schemas['DocEditorV2CollaborationSnapshotResponse'];
export type DocEditorV2EwaAction = Schemas['DocEditorV2EwaAction'];
export type DocEditorV2SelectionRange = Schemas['DocEditorV2SelectionRange'];
export type DocEditorV2EwaSuggestRequest =
	Schemas['DocEditorV2EwaSuggestRequest'];
export type DocEditorV2SuggestionResponse =
	Schemas['DocEditorV2SuggestionResponse'];
export type DocEditorV2SuggestionApplyRequest =
	Schemas['DocEditorV2SuggestionApplyRequest'];
export type DocEditorV2SuggestionApplyResponse =
	Schemas['DocEditorV2SuggestionApplyResponse'];
export type DocEditorV2ImportRequest = Schemas['DocEditorV2ImportRequest'];
export type DocEditorV2ImportResponse = Schemas['DocEditorV2ImportResponse'];
export type DocEditorV2ExportRequest = Schemas['DocEditorV2ExportRequest'];
export type DocEditorV2ExportResponse = Schemas['DocEditorV2ExportResponse'];

/** 409 version_conflict detail — not modeled as a named OpenAPI schema. */
export interface DocEditorV2ConflictPayload {
	code: 'version_conflict';
	expected_version: number;
	current_version: number;
	server_document: DocEditorV2DocumentResponse;
}

interface ApiErrorLike {
	details?: unknown;
	originalError?: {
		response?: {
			data?: {
				detail?: unknown;
				error?: unknown;
			};
		};
	};
}

export function getDocEditorV2ConflictPayload(
	error: unknown
): DocEditorV2ConflictPayload | null {
	const err = error as ApiErrorLike | null;
	const detail = err?.details ?? err?.originalError?.response?.data?.detail;
	if (
		detail &&
		typeof detail === 'object' &&
		(detail as { code?: unknown }).code === 'version_conflict'
	) {
		return detail as DocEditorV2ConflictPayload;
	}
	return null;
}

export async function getDocEditorV2Document(
	documentId: string
): Promise<DocEditorV2DocumentResponse> {
	const { data } = await apiClient.get<DocEditorV2DocumentResponse>(
		`${DOC_EDITOR_V2_BASE}/documents/${documentId}`
	);
	return data;
}

export async function createDocEditorV2Document(
	request: DocEditorV2CreateRequest
): Promise<DocEditorV2DocumentResponse> {
	const { data } = await apiClient.post<DocEditorV2DocumentResponse>(
		`${DOC_EDITOR_V2_BASE}/documents`,
		request
	);
	return data;
}

export async function updateDocEditorV2Document(
	documentId: string,
	request: DocEditorV2UpdateRequest
): Promise<DocEditorV2DocumentResponse> {
	const { data } = await apiClient.put<DocEditorV2DocumentResponse>(
		`${DOC_EDITOR_V2_BASE}/documents/${documentId}`,
		request
	);
	return data;
}

export async function putDocEditorV2Draft(
	documentId: string,
	request: DocEditorV2DraftRequest
): Promise<DocEditorV2DraftResponse> {
	const { data } = await apiClient.put<DocEditorV2DraftResponse>(
		`${DOC_EDITOR_V2_BASE}/documents/${documentId}/draft`,
		request
	);
	return data;
}

export async function getDocEditorV2Structure(
	documentId: string
): Promise<DocEditorV2StructureResponse> {
	const { data } = await apiClient.get<DocEditorV2StructureResponse>(
		`${DOC_EDITOR_V2_BASE}/documents/${documentId}/structure`
	);
	return data;
}

export async function getDocEditorV2CollaborationState(
	documentId: string
): Promise<DocEditorV2CollaborationStateResponse> {
	const { data } = await apiClient.get<DocEditorV2CollaborationStateResponse>(
		`${DOC_EDITOR_V2_BASE}/documents/${documentId}/collaboration`
	);
	return data;
}

export async function putDocEditorV2CollaborationSnapshot(
	documentId: string,
	request: DocEditorV2CollaborationSnapshotRequest
): Promise<DocEditorV2CollaborationSnapshotResponse> {
	const { data } =
		await apiClient.put<DocEditorV2CollaborationSnapshotResponse>(
			`${DOC_EDITOR_V2_BASE}/documents/${documentId}/collaboration/snapshot`,
			request
		);
	return data;
}

export async function createDocEditorV2EwaSuggestion(
	documentId: string,
	request: DocEditorV2EwaSuggestRequest
): Promise<DocEditorV2SuggestionResponse> {
	const { data } = await apiClient.post<DocEditorV2SuggestionResponse>(
		`${DOC_EDITOR_V2_BASE}/documents/${documentId}/ewa/suggest`,
		request
	);
	return data;
}

export async function applyDocEditorV2EwaSuggestion(
	documentId: string,
	suggestionId: string,
	request: DocEditorV2SuggestionApplyRequest
): Promise<DocEditorV2SuggestionApplyResponse> {
	const { data } = await apiClient.post<DocEditorV2SuggestionApplyResponse>(
		`${DOC_EDITOR_V2_BASE}/documents/${documentId}/suggestions/${suggestionId}/apply`,
		request
	);
	return data;
}

export async function importDocEditorV2Document(
	request: DocEditorV2ImportRequest
): Promise<DocEditorV2ImportResponse> {
	const { data } = await apiClient.post<DocEditorV2ImportResponse>(
		`${DOC_EDITOR_V2_BASE}/import`,
		request
	);
	return data;
}

export async function exportDocEditorV2Document(
	documentId: string,
	request: DocEditorV2ExportRequest
): Promise<DocEditorV2ExportResponse> {
	const { data } = await apiClient.post<DocEditorV2ExportResponse>(
		`${DOC_EDITOR_V2_BASE}/documents/${documentId}/export`,
		request
	);
	return data;
}
