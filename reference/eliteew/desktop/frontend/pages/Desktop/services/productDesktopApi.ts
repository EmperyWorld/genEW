/**
 * Product desktop API: EWDesk news, feedback tickets, assistant FAQ/chat.
 */
import type { components } from '@/generated/product-desktop-openapi';
import { api, apiFetchWithAuth } from '../../../services/api/client';
import authSession from '../../../services/authSession';

/** Product desktop / EWDesk API (`EliteEW/api/routers/product_desktop.py` + `domains/desktop.py`). */
export const PRODUCT_DESKTOP_API_V1_BASE = '/api/v1/product-desktop' as const;

const BASE = PRODUCT_DESKTOP_API_V1_BASE;

/** GET blob for EWDesk hero when `image_content_id` is set (published posts only). */
export function ewDeskNewsLinkedImagePath(contentId: string): string {
	return `${BASE}/news-linked-image/${contentId}`;
}

/** GET blob for EWDesk hero when `video_content_id` is set (published posts only). */
export function ewDeskNewsLinkedVideoPath(contentId: string): string {
	return `${BASE}/news-linked-video/${contentId}`;
}

/** GET blob for optional audio attachment (published posts only). */
export function ewDeskNewsLinkedAudioPath(contentId: string): string {
	return `${BASE}/news-linked-audio/${contentId}`;
}

export type CompanyNewsPost = components['schemas']['CompanyNewsPostOut'];
/** List row from GET /news (body omitted; excerpt for list preview). */
export type CompanyNewsPostListItem =
	components['schemas']['CompanyNewsPostListItemOut'];

export type CompanyNewsPostListPage = {
	items: CompanyNewsPostListItem[];
	total: number;
	limit: number;
	offset: number;
	next_cursor?: string | null;
};

export type EwDeskNewsFeedFilters = {
	q?: string;
	pinnedOnly?: boolean;
	unreadOnly?: boolean;
	starredOnly?: boolean;
	sort?: 'newest' | 'oldest';
};

function normalizeEwDeskNewsFeedFilters(
	filters: EwDeskNewsFeedFilters = {}
): EwDeskNewsFeedFilters {
	const q = filters.q?.trim();
	return {
		...(q ? { q } : {}),
		...(filters.pinnedOnly ? { pinnedOnly: true } : {}),
		...(filters.unreadOnly ? { unreadOnly: true } : {}),
		...(filters.starredOnly ? { starredOnly: true } : {}),
		...(filters.sort === 'oldest' ? { sort: 'oldest' as const } : {}),
	};
}

export type CompanyNewsPostAdmin =
	components['schemas']['CompanyNewsPostAdminOut'];

export type EwDeskNewsUserState = {
	read_post_ids: string[];
	starred_post_ids: string[];
	last_seen_published_at?: string | null;
};

export type EwDeskNewsCounts = {
	unread_count: number;
	starred_count: number;
	pinned_count: number;
	total_published: number;
	latest_published_at?: string | null;
};

export type FeedbackTicket = {
	id: string;
	kind: string;
	body: string;
	status: string;
	admin_notes: string | null;
	reward_credits: number | null;
	closed_at: string | null;
	created_at: string;
	updated_at: string;
	/** Client context from submit (build, UA) */
	client_meta?: Record<string, unknown> | null;
};

/** Автор обращения (админ-очередь). */
export type FeedbackSubmitter = {
	id: string;
	username: string;
	email: string;
	full_name: string | null;
	avatar_url: string | null;
};

export type FeedbackTicketAdmin = FeedbackTicket & {
	user_id: string;
	submitter?: FeedbackSubmitter | null;
};

export type FeedbackTicketListPage = {
	items: FeedbackTicket[];
	total: number;
};

/** GET /feedback/summary — лимиты и «признание от команды» (не валюта). */
export type FeedbackSummary = {
	is_trusted: boolean;
	wish_count: number;
	wish_limit: number;
	bug_count: number;
	bug_limit: number;
	team_recognition_total: number;
};

export type FeedbackTicketAdminListPage = {
	items: FeedbackTicketAdmin[];
	total: number;
};

/** Parse total from API (number or numeric string). */
function parseFeedbackListTotal(v: unknown): number {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v === 'string') {
		const n = Number.parseInt(v, 10);
		if (Number.isFinite(n)) return n;
	}
	return 0;
}

/**
 * Normalize GET list responses so React Query always sees `{ items, total }`.
 * Handles occasional non-number `total`, nested `{ data: { items, total } }`, or empty payloads.
 */
export function normalizeFeedbackTicketListPage(
	raw: unknown
): FeedbackTicketListPage {
	if (raw == null || typeof raw !== 'object') {
		return { items: [], total: 0 };
	}
	let o = raw as Record<string, unknown>;
	if (!Array.isArray(o.items) && o.data != null && typeof o.data === 'object') {
		o = o.data as Record<string, unknown>;
	}
	const items = Array.isArray(o.items) ? (o.items as FeedbackTicket[]) : [];
	let total = parseFeedbackListTotal(o.total);
	if (items.length > 0 && total < items.length) {
		total = items.length;
	}
	return { items, total };
}

export function normalizeFeedbackAdminListPage(
	raw: unknown
): FeedbackTicketAdminListPage {
	const n = normalizeFeedbackTicketListPage(raw);
	return {
		items: n.items as FeedbackTicketAdmin[],
		total: n.total,
	};
}

export type AssistantFaqEntry = {
	id: string;
	question: string;
	answer: string;
	sort_order: number;
};

export type AssistantChatMessage = {
	id: string;
	role: string;
	content: string;
	created_at: string;
};

export async function fetchPublishedNewsPage(opts?: {
	q?: string;
	limit?: number;
	offset?: number;
	cursor?: string;
	pinnedOnly?: boolean;
	unreadOnly?: boolean;
	starredOnly?: boolean;
	sort?: 'newest' | 'oldest';
}): Promise<CompanyNewsPostListPage> {
	const params = new URLSearchParams();
	const trimmed = opts?.q?.trim();
	if (trimmed) params.set('q', trimmed);
	if (opts?.limit != null) params.set('limit', String(opts.limit));
	if (opts?.cursor) {
		params.set('cursor', opts.cursor);
	} else if (opts?.offset != null) {
		params.set('offset', String(opts.offset));
	}
	if (opts?.pinnedOnly) params.set('pinned_only', 'true');
	if (opts?.unreadOnly) params.set('unread_only', 'true');
	if (opts?.starredOnly) params.set('starred_only', 'true');
	if (opts?.sort === 'oldest') params.set('sort', 'oldest');
	const qs = params.toString();
	const url = qs ? `${BASE}/news?${qs}` : `${BASE}/news`;
	const data = await api.get<CompanyNewsPostListPage>(url);
	return {
		items: data?.items ?? [],
		total: data?.total ?? 0,
		limit: data?.limit ?? opts?.limit ?? 50,
		offset: data?.offset ?? opts?.offset ?? 0,
		next_cursor: data?.next_cursor ?? null,
	};
}

export const EWDESK_WIDGET_PREVIEW_LIMIT_FULL = 4;
export const EWDESK_WIDGET_PREVIEW_LIMIT_COMPACT = 2;

export function ewDeskNewsWidgetPreviewQueryKey(
	limit: number
): readonly ['product-desktop', 'news', 'widget-preview', number] {
	return ['product-desktop', 'news', 'widget-preview', limit] as const;
}

export async function fetchEwDeskNewsWidgetPreview(
	limit: number
): Promise<CompanyNewsPostListItem[]> {
	const page = await fetchPublishedNewsPage({ limit, offset: 0 });
	return page.items;
}

export function ewDeskNewsPagedQueryKey(
	filters: EwDeskNewsFeedFilters = {}
):
	| readonly ['product-desktop', 'news', 'paged']
	| readonly ['product-desktop', 'news', 'paged', EwDeskNewsFeedFilters] {
	const normalized = normalizeEwDeskNewsFeedFilters(filters);
	if (Object.keys(normalized).length === 0) {
		return ['product-desktop', 'news', 'paged'] as const;
	}
	return ['product-desktop', 'news', 'paged', normalized] as const;
}

export async function fetchNewsPost(id: string): Promise<CompanyNewsPost> {
	return api.get<components['schemas']['CompanyNewsPostOut']>(
		`${BASE}/news/${id}`
	);
}

export async function fetchEwDeskNewsUserState(): Promise<EwDeskNewsUserState> {
	const data = await api.get<EwDeskNewsUserState>(`${BASE}/news/my-state`);
	return {
		read_post_ids: data?.read_post_ids ?? [],
		starred_post_ids: data?.starred_post_ids ?? [],
		last_seen_published_at: data?.last_seen_published_at ?? null,
	};
}

export async function patchEwDeskNewsUserState(body: {
	read_post_ids?: string[];
	starred_post_ids?: string[];
	mark_read_ids?: string[];
	mark_unread_ids?: string[];
	last_seen_published_at?: string | null;
}): Promise<EwDeskNewsUserState> {
	return api.patch<EwDeskNewsUserState>(`${BASE}/news/my-state`, body);
}

export async function fetchEwDeskNewsCounts(): Promise<EwDeskNewsCounts> {
	const data = await api.get<EwDeskNewsCounts>(`${BASE}/news/counts`);
	return {
		unread_count: data?.unread_count ?? 0,
		starred_count: data?.starred_count ?? 0,
		pinned_count: data?.pinned_count ?? 0,
		total_published: data?.total_published ?? 0,
		latest_published_at: data?.latest_published_at ?? null,
	};
}

export async function adminListNews(): Promise<CompanyNewsPostAdmin[]> {
	const data = await api.get<
		components['schemas']['CompanyNewsPostAdminOut'][]
	>(`${BASE}/admin/news`);
	return data ?? [];
}

export async function adminCreateNews(body: {
	title: string;
	body: string;
	image_url?: string | null;
	image_content_id?: string | null;
	video_content_id?: string | null;
	audio_content_id?: string | null;
	pinned?: boolean;
	is_published?: boolean;
	published_at?: string | null;
}): Promise<CompanyNewsPostAdmin> {
	return api.post<CompanyNewsPostAdmin>(`${BASE}/admin/news`, body);
}

export async function adminUpdateNews(
	id: string,
	body: Partial<{
		title: string;
		body: string;
		image_url: string | null;
		image_content_id: string | null;
		video_content_id: string | null;
		audio_content_id: string | null;
		pinned: boolean;
		is_published: boolean;
		published_at: string | null;
	}>
): Promise<CompanyNewsPostAdmin> {
	return api.patch<CompanyNewsPostAdmin>(`${BASE}/admin/news/${id}`, body);
}

export async function adminDeleteNews(id: string): Promise<void> {
	await api.delete(`${BASE}/admin/news/${id}`);
}

export type EwDeskNewsPolishResult = {
	body: string;
	title?: string | null;
};

/** POST — rewrite draft into Markdown via UGS (admin). */
export async function adminPolishNewsBody(payload: {
	title?: string | null;
	body: string;
}): Promise<EwDeskNewsPolishResult> {
	return api.post<EwDeskNewsPolishResult>(`${BASE}/admin/news/polish-body`, {
		title: payload.title?.trim() ? payload.title.trim() : undefined,
		body: payload.body,
	});
}

export async function createFeedbackTicket(body: {
	kind: 'wish' | 'bug';
	body: string;
	client_meta?: Record<string, unknown> | null;
}): Promise<FeedbackTicket> {
	return api.post<FeedbackTicket>(`${BASE}/feedback/tickets`, body);
}

export async function fetchFeedbackSummary(): Promise<FeedbackSummary> {
	return api.get<FeedbackSummary>(`${BASE}/feedback/summary`);
}

export async function listMyFeedbackTickets(params?: {
	limit?: number;
	offset?: number;
	/** Серверный фильтр wish | bug */
	kind?: 'wish' | 'bug';
}): Promise<FeedbackTicketListPage> {
	const data = await api.get<unknown>(`${BASE}/feedback/tickets`, {
		params,
	});
	return normalizeFeedbackTicketListPage(data);
}

export async function adminListFeedbackTickets(params?: {
	status?: string;
	limit?: number;
	offset?: number;
	kind?: 'wish' | 'bug';
	/** Поиск по body и id тикета */
	q?: string;
	/** Показывать закрытые при просмотре «все статусы» (без фильтра по status). По умолчанию на сервере закрытые скрыты. */
	include_closed?: boolean;
}): Promise<FeedbackTicketAdminListPage> {
	const data = await api.get<unknown>(`${BASE}/admin/feedback/tickets`, {
		params,
	});
	return normalizeFeedbackAdminListPage(data);
}

export async function adminPatchFeedbackTicket(
	id: string,
	body: { status?: string; admin_notes?: string | null }
): Promise<FeedbackTicketAdmin> {
	return api.patch<FeedbackTicketAdmin>(
		`${BASE}/admin/feedback/tickets/${id}`,
		body
	);
}

export async function adminCloseFeedbackTicket(
	id: string,
	body: { reward_credits?: number | null; admin_notes?: string | null }
): Promise<FeedbackTicketAdmin> {
	return api.post<FeedbackTicketAdmin>(
		`${BASE}/admin/feedback/tickets/${id}/close`,
		body
	);
}

export async function fetchAssistantFaq(): Promise<AssistantFaqEntry[]> {
	const data = await api.get<AssistantFaqEntry[]>(`${BASE}/assistant/faq`);
	return data ?? [];
}

export async function listAssistantMessages(
	limit = 80
): Promise<AssistantChatMessage[]> {
	const data = await api.get<AssistantChatMessage[]>(
		`${BASE}/assistant/messages`,
		{ params: { limit } }
	);
	return data ?? [];
}

export async function clearAssistantMessages(): Promise<void> {
	await api.delete(`${BASE}/assistant/messages`);
}

export async function sendAssistantMessage(
	message: string
): Promise<AssistantChatMessage> {
	return api.post<AssistantChatMessage>(`${BASE}/assistant/chat`, {
		message,
	});
}

export async function adminListAssistantFaq(): Promise<AssistantFaqEntry[]> {
	const data = await api.get<AssistantFaqEntry[]>(
		`${BASE}/admin/assistant/faq`
	);
	return data ?? [];
}

export async function adminCreateAssistantFaq(body: {
	question: string;
	answer: string;
	sort_order?: number;
}): Promise<AssistantFaqEntry> {
	return api.post<AssistantFaqEntry>(`${BASE}/admin/assistant/faq`, body);
}

export async function adminUpdateAssistantFaq(
	id: string,
	body: Partial<{ question: string; answer: string; sort_order: number }>
): Promise<AssistantFaqEntry> {
	return api.patch<AssistantFaqEntry>(
		`${BASE}/admin/assistant/faq/${id}`,
		body
	);
}

export async function adminDeleteAssistantFaq(id: string): Promise<void> {
	await api.delete(`${BASE}/admin/assistant/faq/${id}`);
}

export type AssistantSettings = {
	llama_model: string | null;
	extra_system_prompt: string | null;
	rag_top_k: number;
	rag_enabled: boolean;
};

export type AssistantKbDocument = {
	id: string;
	title: string;
	status: string;
	chunk_count: number;
	last_error: string | null;
	created_at: string;
	updated_at: string;
	source_filename?: string | null;
	source_mime?: string | null;
};

export type AssistantKbDocumentDetail = AssistantKbDocument & { body: string };

export async function getAssistantSettings(): Promise<AssistantSettings> {
	return api.get<AssistantSettings>(`${BASE}/admin/assistant/settings`);
}

export async function patchAssistantSettings(
	body: Partial<{
		llama_model: string | null;
		extra_system_prompt: string | null;
		rag_top_k: number;
		rag_enabled: boolean;
	}>
): Promise<AssistantSettings> {
	return api.patch<AssistantSettings>(`${BASE}/admin/assistant/settings`, body);
}

export type AssistantKbSummary = {
	total: number;
	indexed: number;
	indexing: number;
	error: number;
	total_chunks: number;
};

export async function adminGetKbSummary(): Promise<AssistantKbSummary> {
	return api.get<AssistantKbSummary>(`${BASE}/admin/assistant/kb/summary`);
}

export async function adminListKbDocuments(): Promise<AssistantKbDocument[]> {
	const data = await api.get<AssistantKbDocument[]>(
		`${BASE}/admin/assistant/kb`
	);
	return data ?? [];
}

export async function adminGetKbDocument(
	id: string
): Promise<AssistantKbDocumentDetail> {
	return api.get<AssistantKbDocumentDetail>(`${BASE}/admin/assistant/kb/${id}`);
}

export async function adminCreateKbDocument(body: {
	title: string;
	body: string;
}): Promise<AssistantKbDocument> {
	return api.post<AssistantKbDocument>(`${BASE}/admin/assistant/kb`, body);
}

export async function adminUploadKbDocument(
	file: File,
	title?: string
): Promise<AssistantKbDocument> {
	const form = new FormData();
	form.append('file', file);
	if (title?.trim()) {
		form.append('title', title.trim());
	}
	return api.post<AssistantKbDocument>(
		`${BASE}/admin/assistant/kb/upload`,
		form
	);
}

export type AssistantKbBulkUploadResult = {
	ok: AssistantKbDocument[];
	failed: { filename: string; detail: string }[];
};

/** Несколько файлов за один запрос (заголовок документа — из имени файла). */
export async function adminUploadKbDocumentsBulk(
	files: File[]
): Promise<AssistantKbBulkUploadResult> {
	if (files.length === 0) {
		return { ok: [], failed: [] };
	}
	const form = new FormData();
	for (const f of files) {
		form.append('files', f);
	}
	return api.post<AssistantKbBulkUploadResult>(
		`${BASE}/admin/assistant/kb/uploads`,
		form
	);
}

export async function adminPatchKbDocument(
	id: string,
	body: { title?: string; body?: string }
): Promise<AssistantKbDocument> {
	return api.patch<AssistantKbDocument>(
		`${BASE}/admin/assistant/kb/${id}`,
		body
	);
}

export async function adminReindexKbDocument(
	id: string
): Promise<AssistantKbDocument> {
	return api.post<AssistantKbDocument>(
		`${BASE}/admin/assistant/kb/${id}/reindex`
	);
}

export async function adminDeleteKbDocument(id: string): Promise<void> {
	await api.delete(`${BASE}/admin/assistant/kb/${id}`);
}

export type AssistantKbUploadLimits = {
	max_files: number;
	max_bytes_per_file: number;
};

export async function getAssistantKbUploadLimits(): Promise<AssistantKbUploadLimits> {
	return api.get<AssistantKbUploadLimits>(
		`${BASE}/admin/assistant/kb/upload-limits`
	);
}

export type AssistantKbPurgeResult = {
	status: string;
	message: string;
	removed_documents: string;
};

export async function adminPurgeKbDocuments(): Promise<AssistantKbPurgeResult> {
	return api.post<AssistantKbPurgeResult>(`${BASE}/admin/assistant/kb/purge`, {
		confirm: 'purge',
	});
}

export type AssistantKbReindexAllResult = {
	status: string;
	message: string;
};

export type AssistantStreamErrorMeta = {
	retryAfterSeconds?: number;
	status?: number;
};

/** Stable error tokens from `sendAssistantMessageStream` — map in `mapAssistantStreamError`. */
export const ASSISTANT_STREAM_ERROR_CODE = {
	rateLimited: 'rate_limited',
	networkError: 'network_error',
	noResponseBody: 'no_response_body',
	streamError: 'stream_error',
} as const;

export type AssistantPreviewResult = {
	model: string;
	rag_enabled: boolean;
	rag_source_labels: string[];
	faq_chars: number;
	rag_chars: number;
	history_chars: number;
	prompt_chars: number;
	prompt_preview: string;
	prompt_full: string;
};

export async function adminPreviewAssistantPrompt(body: {
	message: string;
	include_my_history?: boolean;
}): Promise<AssistantPreviewResult> {
	return api.post<AssistantPreviewResult>(
		`${BASE}/admin/assistant/preview`,
		body
	);
}

export async function adminReindexAllKbDocuments(): Promise<AssistantKbReindexAllResult> {
	return api.post<AssistantKbReindexAllResult>(
		`${BASE}/admin/assistant/kb/reindex-all`,
		undefined
	);
}

export type AssistantKbSyncHandbookResult = {
	status: string;
	message?: string;
	files?: number;
	ok?: number;
	fail?: number;
	dry_run?: boolean;
	handbook_dir?: string;
};

export async function adminSyncHandbookKb(options?: {
	dryRun?: boolean;
	limit?: number;
}): Promise<AssistantKbSyncHandbookResult> {
	const params = new URLSearchParams();
	if (options?.dryRun) params.set('dry_run', 'true');
	if (options?.limit != null) params.set('limit', String(options.limit));
	const qs = params.toString();
	return api.post<AssistantKbSyncHandbookResult>(
		`${BASE}/admin/assistant/kb/sync-handbook${qs ? `?${qs}` : ''}`,
		undefined
	);
}

type StreamEvent =
	| { type: 'token'; text: string }
	| { type: 'meta'; rag_source_labels: string[] }
	| { type: 'done'; message: AssistantChatMessage }
	| { type: 'error'; message: string };

function parseSseDataBlock(block: string): StreamEvent | null {
	const lines = block
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	for (const line of lines) {
		if (!line.startsWith('data:')) continue;
		const raw = line.slice(5).trimStart();
		if (!raw) continue;
		try {
			return JSON.parse(raw) as StreamEvent;
		} catch {
			return null;
		}
	}
	return null;
}

/**
 * SSE-чат помощника (Llama stream + сохранение в БД на сервере).
 */
export async function sendAssistantMessageStream(
	message: string,
	handlers: {
		onToken: (text: string) => void;
		onMeta?: (meta: { rag_source_labels: string[] }) => void;
		onDone: (message: AssistantChatMessage) => void | Promise<void>;
		onError: (message: string, meta?: AssistantStreamErrorMeta) => void;
		onAborted?: () => void;
	},
	options?: { signal?: AbortSignal }
): Promise<void> {
	try {
		await authSession.updateToken(70);
	} catch {
		// ignore
	}
	const signal = options?.signal;
	try {
		const res = await apiFetchWithAuth(
			'/api/v1/product-desktop/assistant/chat/stream',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ message }),
				signal,
			}
		);
		if (!res.ok) {
			if (res.status === 429) {
				const retryRaw = res.headers.get('Retry-After');
				const retryAfterSeconds = Math.max(
					1,
					Number.parseInt(retryRaw ?? '60', 10) || 60
				);
				handlers.onError('rate_limited', { retryAfterSeconds });
				return;
			}
			handlers.onError(ASSISTANT_STREAM_ERROR_CODE.networkError, {
				status: res.status,
			});
			return;
		}
		const reader = res.body?.getReader();
		if (!reader) {
			handlers.onError(ASSISTANT_STREAM_ERROR_CODE.noResponseBody);
			return;
		}
		const decoder = new TextDecoder();
		let buffer = '';
		let doneHandled = false;
		while (true) {
			if (signal?.aborted) {
				await reader.cancel().catch(() => undefined);
				handlers.onAborted?.();
				return;
			}
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const parts = buffer.split('\n\n');
			buffer = parts.pop() ?? '';
			for (const block of parts) {
				if (block.startsWith(':')) continue;
				const ev = parseSseDataBlock(block);
				if (!ev) continue;
				if (ev.type === 'token' && ev.text) handlers.onToken(ev.text);
				if (ev.type === 'meta' && ev.rag_source_labels) {
					handlers.onMeta?.({ rag_source_labels: ev.rag_source_labels });
				}
				if (ev.type === 'error')
					handlers.onError(
						ev.message || ASSISTANT_STREAM_ERROR_CODE.streamError
					);
				if (ev.type === 'done' && ev.message && !doneHandled) {
					doneHandled = true;
					await Promise.resolve(handlers.onDone(ev.message));
				}
			}
		}
		if (buffer.trim() && !buffer.startsWith(':')) {
			const ev = parseSseDataBlock(buffer);
			if (ev?.type === 'done' && ev.message && !doneHandled) {
				doneHandled = true;
				await Promise.resolve(handlers.onDone(ev.message));
			}
		}
	} catch (err) {
		if (
			signal?.aborted ||
			(err instanceof DOMException && err.name === 'AbortError')
		) {
			handlers.onAborted?.();
			return;
		}
		handlers.onError(err instanceof Error ? err.message : String(err));
	}
}
