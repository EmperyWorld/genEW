/**
 * Desktop App Store Admin API
 * Catalog CRUD, access groups CRUD, user access group assignment. Requires admin role.
 */

import { api } from '../../../services/api/client';

const BASE = '/api/v1/desktop/admin';

export interface CatalogAccessGroupRef {
	id: string;
	name: string;
}

export interface CatalogAppResponse {
	id: string;
	app_id: string;
	name: string;
	description: string | null;
	app_component: string;
	category: string;
	gradient: string | null;
	color: string | null;
	sort_order: number;
	allow_multiple_windows?: boolean;
	max_window_instances?: number;
	is_system: boolean;
	is_factory?: boolean;
	ew_monthly_price?: number;
	trial_duration_days?: number;
	is_featured_new?: boolean;
	new_until?: string | null;
	maintenance_mode?: boolean;
	maintenance_title?: string | null;
	maintenance_reason?: string | null;
	maintenance_expected_outcome?: string | null;
	maintenance_eta_note?: string | null;
	icon_url?: string | null;
	icon_url_2x?: string | null;
	preview_url?: string | null;
	preview_url_2x?: string | null;
	access_groups: CatalogAccessGroupRef[];
	created_at: string;
	updated_at: string;
}

export interface CatalogAppCreate {
	app_id: string;
	name: string;
	description?: string | null;
	app_component: string;
	category?: string;
	gradient?: string | null;
	color?: string | null;
	sort_order?: number;
	allow_multiple_windows?: boolean;
	max_window_instances?: number;
	is_system?: boolean;
	is_factory?: boolean;
	ew_monthly_price?: number;
	trial_duration_days?: number;
	is_featured_new?: boolean;
	new_until?: string | null;
	maintenance_mode?: boolean;
	maintenance_title?: string | null;
	maintenance_reason?: string | null;
	maintenance_expected_outcome?: string | null;
	maintenance_eta_note?: string | null;
	icon_url?: string | null;
	icon_url_2x?: string | null;
	preview_url?: string | null;
	preview_url_2x?: string | null;
	access_group_ids?: string[];
}

export interface CatalogAppUpdate {
	name?: string | null;
	description?: string | null;
	app_component?: string | null;
	category?: string | null;
	gradient?: string | null;
	color?: string | null;
	sort_order?: number | null;
	allow_multiple_windows?: boolean | null;
	max_window_instances?: number | null;
	is_system?: boolean | null;
	is_factory?: boolean | null;
	ew_monthly_price?: number | null;
	trial_duration_days?: number | null;
	is_featured_new?: boolean | null;
	new_until?: string | null;
	maintenance_mode?: boolean | null;
	maintenance_title?: string | null;
	maintenance_reason?: string | null;
	maintenance_expected_outcome?: string | null;
	maintenance_eta_note?: string | null;
	icon_url?: string | null;
	icon_url_2x?: string | null;
	preview_url?: string | null;
	preview_url_2x?: string | null;
	access_group_ids?: string[];
}

function normCatalogDescription(
	value: string | null | undefined
): string | null {
	if (value === undefined || value === null) return null;
	return value;
}

function normCatalogUrl(value: string | null | undefined): string | null {
	if (value === undefined || value === null) return null;
	const t = value.trim();
	return t || null;
}

function catalogAccessGroupIdsSignature(ids: string[] | undefined): string {
	return [...(ids ?? [])].sort().join(',');
}

/**
 * Тело PATCH только с изменёнными полями.
 * Важно для `app_component`: при неизменном значении не шлём поле — иначе бэкенд
 * снова прогоняет валидатор реестра Desktop; на старых API без Kirs* в списке
 * это давало 422 при любом сохранении формы для приложений КИРС.
 */
export function buildCatalogPatchPayload(
	app: CatalogAppResponse,
	form: CatalogAppUpdate
): CatalogAppUpdate {
	const out: CatalogAppUpdate = {};
	if ((form.name ?? '') !== (app.name ?? '')) {
		out.name = form.name;
	}
	if (
		normCatalogDescription(form.description) !==
		normCatalogDescription(app.description)
	) {
		out.description = form.description;
	}
	const fc = (form.app_component ?? '').trim();
	const ac = (app.app_component ?? '').trim();
	if (fc !== ac) {
		out.app_component = form.app_component;
	}
	if ((form.category ?? '') !== (app.category ?? '')) {
		out.category = form.category;
	}
	if ((form.sort_order ?? 0) !== (app.sort_order ?? 0)) {
		out.sort_order = form.sort_order;
	}
	if (
		(form.allow_multiple_windows ?? false) !==
		(app.allow_multiple_windows ?? false)
	) {
		out.allow_multiple_windows = form.allow_multiple_windows;
	}
	if ((form.max_window_instances ?? 1) !== (app.max_window_instances ?? 1)) {
		out.max_window_instances = form.max_window_instances;
	}
	if ((form.is_system ?? false) !== (app.is_system ?? false)) {
		out.is_system = form.is_system;
	}
	if ((form.is_factory ?? false) !== (app.is_factory ?? false)) {
		out.is_factory = form.is_factory;
	}
	if ((form.ew_monthly_price ?? 0) !== (app.ew_monthly_price ?? 0)) {
		out.ew_monthly_price = form.ew_monthly_price;
	}
	if ((form.trial_duration_days ?? 0) !== (app.trial_duration_days ?? 0)) {
		out.trial_duration_days = form.trial_duration_days;
	}
	if ((form.is_featured_new ?? false) !== (app.is_featured_new ?? false)) {
		out.is_featured_new = form.is_featured_new;
	}
	const normUntil = (v: string | null | undefined) => (v ?? '').trim() || null;
	if (normUntil(form.new_until) !== normUntil(app.new_until)) {
		out.new_until = form.new_until ?? null;
	}
	if ((form.maintenance_mode ?? false) !== (app.maintenance_mode ?? false)) {
		out.maintenance_mode = form.maintenance_mode;
	}
	if (normUntil(form.maintenance_title) !== normUntil(app.maintenance_title)) {
		out.maintenance_title = form.maintenance_title ?? null;
	}
	if (
		normUntil(form.maintenance_reason) !== normUntil(app.maintenance_reason)
	) {
		out.maintenance_reason = form.maintenance_reason ?? null;
	}
	if (
		normUntil(form.maintenance_expected_outcome) !==
		normUntil(app.maintenance_expected_outcome)
	) {
		out.maintenance_expected_outcome =
			form.maintenance_expected_outcome ?? null;
	}
	if (
		normUntil(form.maintenance_eta_note) !== normUntil(app.maintenance_eta_note)
	) {
		out.maintenance_eta_note = form.maintenance_eta_note ?? null;
	}
	if (normCatalogUrl(form.icon_url) !== normCatalogUrl(app.icon_url)) {
		out.icon_url = form.icon_url ?? null;
	}
	if (normCatalogUrl(form.icon_url_2x) !== normCatalogUrl(app.icon_url_2x)) {
		out.icon_url_2x = form.icon_url_2x ?? null;
	}
	if (normCatalogUrl(form.preview_url) !== normCatalogUrl(app.preview_url)) {
		out.preview_url = form.preview_url ?? null;
	}
	if (
		normCatalogUrl(form.preview_url_2x) !== normCatalogUrl(app.preview_url_2x)
	) {
		out.preview_url_2x = form.preview_url_2x ?? null;
	}
	const formG = catalogAccessGroupIdsSignature(form.access_group_ids);
	const appG = catalogAccessGroupIdsSignature(
		(app.access_groups ?? []).map((g) => g.id)
	);
	if (formG !== appG) {
		out.access_group_ids = form.access_group_ids;
	}
	return out;
}

export interface AccessGroupResponse {
	id: string;
	name: string;
	description: string | null;
	created_at: string;
	updated_at: string;
}

export interface AccessGroupCreate {
	name: string;
	description?: string | null;
}

export interface AccessGroupUpdate {
	name?: string | null;
	description?: string | null;
}

export interface UserAppAccessGroupResponse {
	id: string;
	username: string;
	email: string;
	role: string;
	/** UGS / генерации (кредиты), не путать с EW магазина */
	ugs_credits?: number;
	ew_balance?: number;
	app_access_group_id: string | null;
	app_access_group_name: string | null;
}

export interface UserAppAccessGroupUpdate {
	app_access_group_id?: string | null;
}

export interface UserEwBalanceSetBody {
	ew_balance: number;
}

export interface UserUgsCreditsSetBody {
	ugs_credits: number;
}

export interface WebSearchQuotaStatus {
	user_id: string;
	monthly_limit: number;
	monthly_used: number;
	monthly_remaining: number;
	coins: number;
	total_remaining: number;
	period_month: string;
}

export interface UserWebSearchQuotaPatch {
	web_search_coins?: number;
	web_search_coins_delta?: number;
	web_search_monthly_limit?: number;
	reset_monthly_limit?: boolean;
}

export async function getCatalog(): Promise<CatalogAppResponse[]> {
	return api.get<CatalogAppResponse[]>(`${BASE}/catalog`);
}

export async function createCatalogApp(
	data: CatalogAppCreate
): Promise<CatalogAppResponse> {
	return api.post<CatalogAppResponse>(`${BASE}/catalog`, data);
}

export async function getCatalogApp(
	appId: string
): Promise<CatalogAppResponse> {
	return api.get<CatalogAppResponse>(`${BASE}/catalog/${appId}`);
}

export async function updateCatalogApp(
	appId: string,
	data: CatalogAppUpdate
): Promise<CatalogAppResponse> {
	return api.patch<CatalogAppResponse>(`${BASE}/catalog/${appId}`, data);
}

export async function deleteCatalogApp(appId: string): Promise<void> {
	await api.delete(`${BASE}/catalog/${appId}`);
}

export async function getAccessGroups(): Promise<AccessGroupResponse[]> {
	return api.get<AccessGroupResponse[]>(`${BASE}/access-groups`);
}

export async function createAccessGroup(
	data: AccessGroupCreate
): Promise<AccessGroupResponse> {
	return api.post<AccessGroupResponse>(`${BASE}/access-groups`, data);
}

export async function updateAccessGroup(
	groupId: string,
	data: AccessGroupUpdate
): Promise<AccessGroupResponse> {
	return api.patch<AccessGroupResponse>(
		`${BASE}/access-groups/${groupId}`,
		data
	);
}

export async function deleteAccessGroup(groupId: string): Promise<void> {
	await api.delete(`${BASE}/access-groups/${groupId}`);
}

export async function getUsers(): Promise<UserAppAccessGroupResponse[]> {
	return api.get<UserAppAccessGroupResponse[]>(`${BASE}/users`);
}

export async function updateUserAccessGroup(
	userId: string,
	data: UserAppAccessGroupUpdate
): Promise<UserAppAccessGroupResponse> {
	return api.patch<UserAppAccessGroupResponse>(`${BASE}/users/${userId}`, data);
}

export async function updateUserEwBalance(
	userId: string,
	data: UserEwBalanceSetBody
): Promise<UserAppAccessGroupResponse> {
	return api.patch<UserAppAccessGroupResponse>(
		`${BASE}/users/${userId}/ew-balance`,
		data
	);
}

export async function updateUserUgsCredits(
	userId: string,
	data: UserUgsCreditsSetBody
): Promise<UserAppAccessGroupResponse> {
	return api.patch<UserAppAccessGroupResponse>(
		`${BASE}/users/${userId}/ugs-credits`,
		data
	);
}

export async function getUserWebSearchQuota(
	userId: string
): Promise<WebSearchQuotaStatus> {
	return api.get<WebSearchQuotaStatus>(
		`${BASE}/users/${userId}/web-search-quota`
	);
}

export async function patchUserWebSearchQuota(
	userId: string,
	data: UserWebSearchQuotaPatch
): Promise<WebSearchQuotaStatus> {
	return api.patch<WebSearchQuotaStatus>(
		`${BASE}/users/${userId}/web-search-quota`,
		data
	);
}
