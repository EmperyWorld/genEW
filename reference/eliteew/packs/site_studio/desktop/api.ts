/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Typed HTTP client for the personal Site Studio desktop workspace.
 * Includes lifecycle job and worker diagnostics returned by the backend runtime APIs.
 *
 * Invariants:
 * - Public storefront requests use the public URL; authenticated admin changes go through the Desktop proxy base.
 * - Runtime action responses keep `job_id` optional so old transient responses do not break callers.
 *
 * Related:
 * - `features/site-studio/desktop/UserSiteStudioApp.tsx`
 * - `api/routers/desktop_sites.py`
 */
import { apiClient, apiFetchWithAuth } from '@/services/api/client';
import { runUgsStreamWithRegistry } from '@/services/api/ugs/runUgsStreamWithRegistry';
import type { UGSStreamCallbacks } from '@/services/api/ugs/stream';
import { resizeImageForUpload } from '@/utils/imageResize';

/** Thrown when an image URL cannot be fetched before upload; map in UI via `getSiteStudioUserFacingMessage`. */
export class SiteStudioImageFetchError extends Error {
	constructor(public readonly httpStatus: number) {
		super('SITE_STUDIO_IMAGE_FETCH_FAILED');
		this.name = 'SiteStudioImageFetchError';
		Object.setPrototypeOf(this, SiteStudioImageFetchError.prototype);
	}
}

export const SITE_STUDIO_API_BASE = '/api/v1/desktop/site-studio';
export const SITE_STUDIO_AI_API_BASE = '/api/v1/desktop/site-studio/ai';
export const SITE_STUDIO_PROXY_API_BASE = '/api/v1/desktop/site-studio/proxy';
export const SITE_MANAGER_OPS_API_BASE = '/api/v1/desktop/site-manager/ops';

/** Matches backend `SiteStudioActionResponse` in `api/routers/desktop_sites.py`. */
export interface SiteStudioActionResponse {
	status: string;
	queued: boolean;
	detail: string;
	job_id?: string | null;
	worker_ready?: boolean | null;
}
const SITE_STUDIO_UPLOAD_MAX_BYTES = 900 * 1024;
const SITE_STUDIO_UPLOAD_MAX_DIMENSION = 1600;

function getAxiosLikeStatusCode(error: unknown): number | undefined {
	if (typeof error !== 'object' || error === null) {
		return undefined;
	}
	const e = error as { statusCode?: unknown; response?: { status?: unknown } };
	const code = e.statusCode ?? e.response?.status;
	return typeof code === 'number' ? code : undefined;
}

export interface SiteStudioInstance {
	id: string;
	user_id: string;
	template_key: string;
	site_slug: string;
	site_title: string;
	site_topic: string;
	brief_json: Record<string, unknown>;
	status: string;
	public_hostname: string;
	publication_state: string;
	public_url: string | null;
	api_base_url: string | null;
	opened_at: string | null;
	closed_at: string | null;
	admin_email: string | null;
	runtime_dir: string | null;
	source_dir: string | null;
	env_dir: string | null;
	compose_file_path: string | null;
	compose_project_name: string | null;
	ports_json: Record<string, unknown>;
	db_name: string | null;
	last_error: string | null;
	last_provisioned_at: string | null;
	created_at: string;
	updated_at: string;
	/** KIRS project-site only */
	marketing_project_id?: string | null;
	client_access_json?: Record<string, unknown> | null;
}

export interface SiteStudioLifecycleJob {
	id: string;
	instance_scope: string;
	instance_id: string;
	site_slug: string | null;
	task_type: string;
	status: string;
	stage: string | null;
	queued: boolean;
	worker_id: string | null;
	attempts: number;
	last_error: string | null;
	metadata_json: Record<string, unknown>;
	created_at: string;
	queued_at: string | null;
	started_at: string | null;
	finished_at: string | null;
	updated_at: string;
	duration_ms: number | null;
}

export interface SiteStudioEdgeHealth {
	enabled: boolean;
	ssh_configured: boolean;
	port: number | null;
	url: string | null;
	last_error: string | null;
	deployed_at?: string | null;
	/** runtime_dist | snapshot | stub — honesty for Edge pack origin. */
	content_source?: 'runtime_dist' | 'snapshot' | 'stub' | null;
}

export interface SiteStudioHealth {
	status: string;
	api_ok: boolean;
	public_ok: boolean;
	api_error: string | null;
	public_error: string | null;
	ports: Record<string, unknown>;
	public_hostname: string | null;
	publication_state: string | null;
	public_url: string | null;
	api_base_url: string | null;
	worker_ready: boolean;
	worker_id: string | null;
	worker_last_seen_at: string | null;
	worker_last_seen_age_seconds: number | null;
	worker_ready_window_seconds: number | null;
	last_job: SiteStudioLifecycleJob | null;
	pending_job: SiteStudioLifecycleJob | null;
	/** Present when API returns Edge Carrier snapshot (LAN Site-Image URL). */
	edge?: SiteStudioEdgeHealth | null;
}

export interface SiteStudioDomainBinding {
	id: string;
	instance_scope: string;
	instance_id: string;
	hostname: string;
	status: string;
	verification_method: string;
	verification_name: string;
	verification_token_preview: string;
	expected_cname: string | null;
	verified_at: string | null;
	last_checked_at: string | null;
	route_ready_at: string | null;
	tls_status: string;
	last_error: string | null;
	metadata_json: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface SiteManagerOpsOverview {
	worker: {
		worker_ready: boolean;
		worker_id: string | null;
		worker_last_seen_at: string | null;
		worker_last_seen_age_seconds: number | null;
		worker_ready_window_seconds: number | null;
	};
	jobs: SiteStudioLifecycleJob[];
	domains: SiteStudioDomainBinding[];
	dns_outbox: SiteManagerOpsDnsOutboxRow[];
	instances: SiteManagerOpsRuntimeInstance[];
	reconcile: {
		count: number;
		entries: SiteManagerOpsReconcileEntry[];
		generated_at: string;
	};
	audit_events: SiteManagerOpsAuditEvent[];
	overview_limits?: Record<
		string,
		{
			limit: number;
			returned: number;
			truncated: boolean;
		}
	>;
	generated_at: string;
}

export interface SiteManagerOpsRuntimeInstancesPage {
	items: SiteManagerOpsRuntimeInstance[];
	limit: number;
	offset: number;
	returned: number;
	has_more: boolean;
}

export interface SiteManagerOpsDnsOutboxRow {
	id: string;
	binding_id: string;
	hostname: string;
	target_hostname: string;
	status: string;
	requested_at: string;
	applied_at: string | null;
	last_error: string | null;
	metadata_json: Record<string, unknown>;
}

export interface SiteManagerOpsRuntimeInstance {
	instance_scope: 'user' | 'project' | string;
	id: string;
	site_slug: string;
	site_title: string;
	status: string;
	publication_state: string;
	public_hostname: string;
	public_url: string | null;
	api_base_url: string | null;
	compose_project_name: string | null;
	runtime_dir: string | null;
	source_dir: string | null;
	env_dir: string | null;
	compose_file_path: string | null;
	updated_at: string;
	last_error: string | null;
	marketing_project_id: string | null;
	client_access_json: Record<string, unknown>;
}

export interface SiteManagerOpsRepairInstance {
	id: string;
	site_slug: string;
	status: string;
	publication_state: string;
	public_hostname: string;
	last_error: string | null;
	updated_at: string;
}

export interface SiteManagerOpsReconcileIssue {
	code: string;
	severity: string;
	next_action: string;
	message: string;
	age_seconds?: number | null;
	path?: string | null;
	compose_project_name?: string | null;
}

export interface SiteManagerOpsReconcileEntry {
	instance: SiteManagerOpsRuntimeInstance;
	issues: SiteManagerOpsReconcileIssue[];
}

export interface SiteManagerOpsAuditEvent {
	id: string;
	actor_user_id: string | null;
	action: string;
	target_type: string;
	target_id: string | null;
	before_json: Record<string, unknown> | null;
	after_json: Record<string, unknown> | null;
	result_json: Record<string, unknown> | null;
	metadata_json: Record<string, unknown>;
	created_at: string;
}

export interface SiteManagerOpsTemplateItem {
	template_key: string;
	profile_id: string | null;
	profile_loaded: boolean;
	block_count: number;
	has_site_settings: boolean;
	runtime_mode: string;
	api_image: string | null;
	frontend_image: string | null;
	images_ready: boolean;
}

export interface SiteManagerOpsTemplateRegistry {
	templates: SiteManagerOpsTemplateItem[];
	runtime_mode: string;
}

export interface SiteManagerOpsSmokeCheck {
	key: string;
	ok: boolean;
	severity: 'hard' | 'soft' | string;
	message: string;
}

export interface SiteManagerOpsSmokeResult {
	instance_scope: 'user' | 'project';
	instance_id: string;
	status: 'passed' | 'failed' | string;
	checks: SiteManagerOpsSmokeCheck[];
	hard_failure_count: number;
	generated_at: string;
}

export interface SiteStudioAiCatalog {
	contentPacks: SiteStudioContentPackCatalogItem[];
	imageSlots: SiteStudioImageSlotCatalogItem[];
}

export interface SiteStudioContentPackCatalogItem {
	key: string;
	title: string;
	description: string;
	blockCount: number;
}

export interface SiteStudioImageSlotCatalogItem {
	slotId: string;
	title: string;
	description: string;
	page: string;
	section: string;
	key: string;
	alt: string;
	recommendedWidth: number;
	recommendedHeight: number;
}

export interface SiteStudioChatMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	createdAt: string;
}

export interface SiteStudioContentBlockDraft {
	page: string;
	section: string;
	key: string;
	label: string;
	value: string;
	maxLength?: number;
}

export interface SiteStudioContentDraft {
	id: string;
	draftKey: string;
	title: string;
	summary: string;
	createdAt: string;
	blocks: SiteStudioContentBlockDraft[];
}

export interface SiteStudioSeoDraft {
	id: string;
	title: string;
	summary: string;
	createdAt: string;
	siteSettings: {
		siteTitle?: string;
		siteDescription?: string;
	};
	keywords: string[];
	suggestions: string[];
}

export interface SiteStudioImageDraft {
	id: string;
	slotId: string;
	title: string;
	description: string;
	page: string;
	section: string;
	key: string;
	alt: string;
	imageUrl: string;
	prompt: string;
	negativePrompt?: string;
	width: number;
	height: number;
	createdAt: string;
}

export interface SiteStudioDraftState {
	brief: string;
	siteBlueprint: Record<string, unknown> | null;
	assistantMessages: SiteStudioChatMessage[];
	contentDrafts: SiteStudioContentDraft[];
	seoDrafts: SiteStudioSeoDraft[];
	imageDrafts: SiteStudioImageDraft[];
}

export interface SiteStudioAssistResponse {
	message: SiteStudioChatMessage;
	drafts: SiteStudioDraftState;
}

export interface SiteStudioContentDraftResponse {
	draft: SiteStudioContentDraft;
	drafts: SiteStudioDraftState;
}

export interface SiteStudioSeoDraftResponse {
	draft: SiteStudioSeoDraft;
	drafts: SiteStudioDraftState;
}

export interface SiteStudioImageDraftResponse {
	draft: SiteStudioImageDraft;
	drafts: SiteStudioDraftState;
}

export interface SiteStudioApplyReport {
	kind: 'content' | 'seo' | 'image';
	status: 'applied' | 'partial' | 'failed';
	applied: number;
	skipped: number;
	failed: number;
	message: string;
}

async function streamSiteStudioAiTask<T>(
	path: string,
	body: Record<string, unknown>,
	callbacks?: UGSStreamCallbacks
): Promise<T> {
	const result = await runUgsStreamWithRegistry(
		`${SITE_STUDIO_AI_API_BASE}${path}`,
		body,
		{ callbacks }
	);
	return result as T;
}

export async function getSiteStudioInstance(): Promise<SiteStudioInstance | null> {
	try {
		const { data } = await apiClient.get<SiteStudioInstance>(
			`${SITE_STUDIO_API_BASE}/instance`
		);
		return data;
	} catch (error: unknown) {
		if (getAxiosLikeStatusCode(error) === 404) {
			return null;
		}
		throw error;
	}
}

export async function createSiteStudioInstance(payload: {
	site_title: string;
	site_topic: string;
	brief_json: Record<string, unknown>;
	template_key?: string;
}): Promise<SiteStudioInstance> {
	const { data } = await apiClient.post<SiteStudioInstance>(
		`${SITE_STUDIO_API_BASE}/instance`,
		payload
	);
	return data;
}

export async function updateSiteStudioInstance(payload: {
	site_title?: string;
	site_topic?: string;
	brief_json?: Record<string, unknown>;
}): Promise<SiteStudioInstance> {
	const { data } = await apiClient.patch<SiteStudioInstance>(
		`${SITE_STUDIO_API_BASE}/instance`,
		payload
	);
	return data;
}

async function wasSiteStudioInstanceDeleted(): Promise<boolean> {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			const instance = await getSiteStudioInstance();
			if (!instance) {
				return true;
			}
		} catch {
			// Ignore transient transport errors while the browser/network settles.
		}

		if (attempt < 2) {
			await new Promise((resolve) => window.setTimeout(resolve, 500));
		}
	}

	return false;
}

export async function deleteSiteStudioInstance(): Promise<void> {
	try {
		await apiClient.delete(`${SITE_STUDIO_API_BASE}/instance`);
	} catch (error: unknown) {
		if (getAxiosLikeStatusCode(error) === 404) {
			return;
		}

		if (await wasSiteStudioInstanceDeleted()) {
			return;
		}

		throw error;
	}
}

async function postInstanceAction(
	path: string
): Promise<SiteStudioActionResponse> {
	const { data } = await apiClient.post<SiteStudioActionResponse>(
		`${SITE_STUDIO_API_BASE}${path}`
	);
	return data;
}

export async function provisionSiteStudioInstance(): Promise<SiteStudioActionResponse> {
	return postInstanceAction('/instance/provision');
}

export async function startSiteStudioInstance(): Promise<SiteStudioActionResponse> {
	return postInstanceAction('/instance/start');
}

export async function stopSiteStudioInstance(): Promise<SiteStudioActionResponse> {
	return postInstanceAction('/instance/stop');
}

export async function redeploySiteStudioInstance(): Promise<SiteStudioActionResponse> {
	return postInstanceAction('/instance/redeploy');
}

export async function publishSiteStudioInstance(): Promise<SiteStudioInstance> {
	const { data } = await apiClient.post<SiteStudioInstance>(
		`${SITE_STUDIO_API_BASE}/instance/publish`
	);
	return data;
}

export async function unpublishSiteStudioInstance(): Promise<SiteStudioInstance> {
	const { data } = await apiClient.post<SiteStudioInstance>(
		`${SITE_STUDIO_API_BASE}/instance/unpublish`
	);
	return data;
}

export async function getSiteStudioHealth(): Promise<SiteStudioHealth> {
	const { data } = await apiClient.get<SiteStudioHealth>(
		`${SITE_STUDIO_API_BASE}/instance/health`
	);
	return data;
}

export async function getSiteManagerOpsOverview(): Promise<SiteManagerOpsOverview> {
	const { data } = await apiClient.get<SiteManagerOpsOverview>(
		`${SITE_MANAGER_OPS_API_BASE}/overview`
	);
	return data;
}

export async function getSiteManagerOpsInstances(params: {
	q?: string;
	scope?: 'user' | 'project';
	status?: string;
	limit?: number;
	offset?: number;
}): Promise<SiteManagerOpsRuntimeInstancesPage> {
	const { data } = await apiClient.get<SiteManagerOpsRuntimeInstancesPage>(
		`${SITE_MANAGER_OPS_API_BASE}/instances`,
		{ params }
	);
	return data;
}

export async function listSiteManagerOpsAuditEvents(): Promise<
	SiteManagerOpsAuditEvent[]
> {
	const { data } = await apiClient.get<SiteManagerOpsAuditEvent[]>(
		`${SITE_MANAGER_OPS_API_BASE}/audit-events`
	);
	return data;
}

export async function getSiteManagerOpsTemplates(): Promise<SiteManagerOpsTemplateRegistry> {
	const { data } = await apiClient.get<SiteManagerOpsTemplateRegistry>(
		`${SITE_MANAGER_OPS_API_BASE}/templates`
	);
	return data;
}

export async function cancelSiteManagerLifecycleJob(
	jobId: string
): Promise<SiteStudioLifecycleJob> {
	const { data } = await apiClient.post<SiteStudioLifecycleJob>(
		`${SITE_MANAGER_OPS_API_BASE}/jobs/${jobId}/cancel`
	);
	return data;
}

export async function retrySiteManagerLifecycleJob(
	jobId: string
): Promise<SiteStudioActionResponse> {
	const { data } = await apiClient.post<SiteStudioActionResponse>(
		`${SITE_MANAGER_OPS_API_BASE}/jobs/${jobId}/retry`
	);
	return data;
}

export async function markSiteManagerDnsOutboxApplied(
	outboxId: string
): Promise<SiteManagerOpsDnsOutboxRow> {
	const { data } = await apiClient.post<SiteManagerOpsDnsOutboxRow>(
		`${SITE_MANAGER_OPS_API_BASE}/dns-outbox/${outboxId}/mark-applied`
	);
	return data;
}

export async function markSiteManagerDomainTlsReady(
	bindingId: string,
	certificateSummary?: string
): Promise<SiteStudioDomainBinding> {
	const { data } = await apiClient.post<SiteStudioDomainBinding>(
		`${SITE_MANAGER_OPS_API_BASE}/domains/${bindingId}/mark-tls-ready`,
		{ certificate_summary: certificateSummary ?? null }
	);
	return data;
}

export async function markSiteManagerReconcileFailed(payload: {
	instance_scope: 'user' | 'project';
	instance_id: string;
	reason: string;
}): Promise<SiteManagerOpsRepairInstance> {
	const { data } = await apiClient.post<SiteManagerOpsRepairInstance>(
		`${SITE_MANAGER_OPS_API_BASE}/reconcile/${payload.instance_scope}/${payload.instance_id}/mark-failed`,
		{ reason: payload.reason }
	);
	return data;
}

export async function runSiteManagerPublishSmoke(payload: {
	instance_scope: 'user' | 'project';
	instance_id: string;
	run_live?: boolean;
}): Promise<SiteManagerOpsSmokeResult> {
	const { data } = await apiClient.post<SiteManagerOpsSmokeResult>(
		`${SITE_MANAGER_OPS_API_BASE}/smoke/publish`,
		payload
	);
	return data;
}

export async function listSiteStudioDomainBindings(): Promise<
	SiteStudioDomainBinding[]
> {
	const { data } = await apiClient.get<SiteStudioDomainBinding[]>(
		`${SITE_STUDIO_API_BASE}/instance/domains`
	);
	return data;
}

export async function createSiteStudioDomainBinding(
	hostname: string
): Promise<SiteStudioDomainBinding> {
	const { data } = await apiClient.post<SiteStudioDomainBinding>(
		`${SITE_STUDIO_API_BASE}/instance/domains`,
		{ hostname }
	);
	return data;
}

export async function verifySiteStudioDomainBinding(
	bindingId: string
): Promise<SiteStudioDomainBinding> {
	const { data } = await apiClient.post<SiteStudioDomainBinding>(
		`${SITE_STUDIO_API_BASE}/instance/domains/${bindingId}/verify`
	);
	return data;
}

export async function requestSiteStudioDomainRoute(
	bindingId: string
): Promise<SiteStudioDomainBinding> {
	const { data } = await apiClient.post<SiteStudioDomainBinding>(
		`${SITE_STUDIO_API_BASE}/instance/domains/${bindingId}/request-route`
	);
	return data;
}

export async function activateSiteStudioDomainBinding(
	bindingId: string
): Promise<SiteStudioDomainBinding> {
	const { data } = await apiClient.post<SiteStudioDomainBinding>(
		`${SITE_STUDIO_API_BASE}/instance/domains/${bindingId}/activate`
	);
	return data;
}

export async function disableSiteStudioDomainBinding(
	bindingId: string
): Promise<SiteStudioDomainBinding> {
	const { data } = await apiClient.post<SiteStudioDomainBinding>(
		`${SITE_STUDIO_API_BASE}/instance/domains/${bindingId}/disable`
	);
	return data;
}

export async function getSiteStudioAiCatalog(): Promise<SiteStudioAiCatalog> {
	const { data } = await apiClient.get<SiteStudioAiCatalog>(
		`${SITE_STUDIO_AI_API_BASE}/catalog`
	);
	return data;
}

export async function getSiteStudioDrafts(): Promise<SiteStudioDraftState> {
	const { data } = await apiClient.get<SiteStudioDraftState>(
		`${SITE_STUDIO_AI_API_BASE}/drafts`
	);
	return data;
}

export async function generateSiteStudioBrief(payload: {
	prompt?: string;
	callbacks?: UGSStreamCallbacks;
}): Promise<SiteStudioDraftState> {
	const { callbacks, ...body } = payload;
	return streamSiteStudioAiTask<SiteStudioDraftState>(
		'/brief/generate/stream',
		body,
		callbacks
	);
}

export async function assistSiteStudio(payload: {
	message: string;
	callbacks?: UGSStreamCallbacks;
}): Promise<SiteStudioAssistResponse> {
	const { callbacks, ...body } = payload;
	return streamSiteStudioAiTask<SiteStudioAssistResponse>(
		'/assist/stream',
		body,
		callbacks
	);
}

export async function generateSiteStudioContentPack(payload: {
	pack_key: string;
	callbacks?: UGSStreamCallbacks;
}): Promise<SiteStudioContentDraftResponse> {
	const { callbacks, ...body } = payload;
	return streamSiteStudioAiTask<SiteStudioContentDraftResponse>(
		'/content/generate/stream',
		body,
		callbacks
	);
}

export async function generateSiteStudioSeoPack(
	callbacks?: UGSStreamCallbacks
): Promise<SiteStudioSeoDraftResponse> {
	return streamSiteStudioAiTask<SiteStudioSeoDraftResponse>(
		'/seo/generate/stream',
		{},
		callbacks
	);
}

export async function streamSiteStudioImageGeneration(
	body: Record<string, unknown>,
	callbacks?: UGSStreamCallbacks
): Promise<Record<string, unknown>> {
	return runUgsStreamWithRegistry(
		`${SITE_STUDIO_AI_API_BASE}/images/generate/stream`,
		body,
		{ callbacks }
	);
}

export async function saveSiteStudioImageDraft(payload: {
	slot_id: string;
	image_url: string;
	prompt: string;
	negative_prompt?: string;
	width?: number;
	height?: number;
}): Promise<SiteStudioImageDraftResponse> {
	const { data } = await apiClient.post<SiteStudioImageDraftResponse>(
		`${SITE_STUDIO_AI_API_BASE}/images/save`,
		payload
	);
	return data;
}

export async function applySiteStudioContentDraft(
	draft: SiteStudioContentDraft
): Promise<SiteStudioApplyReport> {
	await apiClient.put(`${SITE_STUDIO_PROXY_API_BASE}/content/blocks/bulk`, {
		blocks: draft.blocks.map((block) => ({
			page: block.page,
			section: block.section,
			key: block.key,
			value: block.value,
		})),
	});
	return {
		kind: 'content',
		status: 'applied',
		applied: draft.blocks.length,
		skipped: 0,
		failed: 0,
		message: `${draft.blocks.length} content blocks applied`,
	};
}

export async function applySiteStudioSeoDraft(
	draft: SiteStudioSeoDraft
): Promise<SiteStudioApplyReport> {
	await apiClient.patch(`${SITE_STUDIO_PROXY_API_BASE}/admin/site-settings`, {
		siteTitle: draft.siteSettings.siteTitle,
		siteDescription: draft.siteSettings.siteDescription,
	});
	return {
		kind: 'seo',
		status: 'applied',
		applied: 1,
		skipped: 0,
		failed: 0,
		message: 'SEO/site settings applied',
	};
}

export function isSiteStudioDataUrl(value: string): boolean {
	return value.startsWith('data:');
}

function dataUrlToBlob(value: string): Blob {
	const [meta, body] = value.split(',', 2);
	const mimeMatch = meta.match(/data:(.*?);base64/);
	const mimeType = mimeMatch?.[1] || 'image/png';
	const binary = window.atob(body || '');
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return new Blob([bytes], { type: mimeType });
}

export async function fetchSiteStudioImageBlob(
	imageUrl: string
): Promise<Blob> {
	if (isSiteStudioDataUrl(imageUrl)) {
		return dataUrlToBlob(imageUrl);
	}

	const response = await apiFetchWithAuth(imageUrl, { method: 'GET' });
	if (!response.ok) {
		throw new SiteStudioImageFetchError(response.status);
	}
	return response.blob();
}

function inferImageExtension(mimeType?: string): string {
	if (!mimeType) return 'png';
	if (mimeType.includes('webp')) return 'webp';
	if (mimeType.includes('jpeg')) return 'jpg';
	if (mimeType.includes('svg')) return 'svg';
	return 'png';
}

export async function applySiteStudioImageDraft(
	draft: SiteStudioImageDraft
): Promise<SiteStudioApplyReport> {
	const blob = await fetchSiteStudioImageBlob(draft.imageUrl);
	const sourceFile = new File(
		[blob],
		`${draft.slotId.replace(/\./g, '-')}.${inferImageExtension(blob.type)}`,
		{ type: blob.type || 'image/png' }
	);
	const slotMaxDimension = Math.max(draft.width || 0, draft.height || 0);
	const maxDimension =
		slotMaxDimension > 0
			? Math.min(SITE_STUDIO_UPLOAD_MAX_DIMENSION, slotMaxDimension)
			: SITE_STUDIO_UPLOAD_MAX_DIMENSION;
	let uploadFile = sourceFile;
	try {
		uploadFile = await resizeImageForUpload(
			sourceFile,
			SITE_STUDIO_UPLOAD_MAX_BYTES,
			maxDimension
		);
	} catch (error) {
		console.warn(
			'Failed to optimize Site Studio image upload; falling back to original file',
			error
		);
	}
	const formData = new FormData();
	formData.append('image', uploadFile);
	formData.append('page', draft.page);
	formData.append('section', draft.section);
	formData.append('key', draft.key);
	formData.append('alt', draft.alt || draft.title);
	formData.append('hint', draft.prompt);
	await apiClient.post(
		`${SITE_STUDIO_PROXY_API_BASE}/content/images/upload`,
		formData,
		{
			headers: {
				'Content-Type': 'multipart/form-data',
			},
		}
	);
	return {
		kind: 'image',
		status: 'applied',
		applied: 1,
		skipped: 0,
		failed: 0,
		message: 'Image draft uploaded',
	};
}

export function extractSiteStudioImageUrl(
	payload: unknown
): string | undefined {
	let bestCandidate: string | undefined;

	const rememberCandidate = (candidate: string | undefined): void => {
		if (!candidate) return;
		if (!bestCandidate) {
			bestCandidate = candidate;
			return;
		}
		if (isSiteStudioDataUrl(bestCandidate) && !isSiteStudioDataUrl(candidate)) {
			bestCandidate = candidate;
		}
	};

	if (typeof payload === 'string') {
		const trimmed = payload.trim();
		return trimmed ? trimmed : undefined;
	}

	if (!payload || typeof payload !== 'object') {
		return undefined;
	}

	if (Array.isArray(payload)) {
		for (const item of payload) {
			const candidate = extractSiteStudioImageUrl(item);
			if (candidate) return candidate;
		}
		return undefined;
	}

	const record = payload as Record<string, unknown>;
	const directKeys = [
		'image_url',
		'imageUrl',
		'url',
		'signed_url',
		'download_url',
	];
	for (const key of directKeys) {
		rememberCandidate(extractSiteStudioImageUrl(record[key]));
	}

	const nestedKeys = [
		'result',
		'data',
		'payload',
		'output_data',
		'images',
		'assets',
		'storage_reference',
	];
	for (const key of nestedKeys) {
		rememberCandidate(extractSiteStudioImageUrl(record[key]));
	}

	return bestCandidate;
}
