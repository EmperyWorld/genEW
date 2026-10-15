/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Survey Hub product-desktop API client (user + admin).
 *
 * Related:
 * - api/routers/product_desktop_surveys.py
 * - documentation/product/SURVEY-HUB.md
 */
import { api } from '../../../services/api/client';
import { PRODUCT_DESKTOP_API_V1_BASE } from './productDesktopApi';

const BASE = PRODUCT_DESKTOP_API_V1_BASE;

export type SurveyRewardSpec = {
	ugs_credits: number;
	ew_balance: number;
	web_search_coins: number;
};

export type SurveyQuestion = {
	id?: string;
	question_key: string;
	question_type: string;
	prompt: string;
	help_text?: string | null;
	required: boolean;
	sort_order: number;
	options_json: Record<string, unknown>;
	validation_json: Record<string, unknown>;
};

export type SurveyAdmin = {
	id: string;
	title: string;
	description_user: string;
	description_admin: string | null;
	status: string;
	audience_mode: string;
	reward: SurveyRewardSpec;
	gaf_notify_body_template: string | null;
	closes_at: string | null;
	published_at: string | null;
	sort_order: number;
	created_at: string;
	updated_at: string;
	access_group_ids: string[];
	user_ids: string[];
	questions: SurveyQuestion[];
	question_count: number;
	eligible_count: number | null;
	completed_count: number | null;
};

export type SurveyAiDraft = {
	title: string;
	description_user: string;
	description_admin?: string | null;
	gaf_notify_body_template?: string | null;
	reward: SurveyRewardSpec;
	questions: SurveyQuestion[];
};

export type SurveyResultsSummary = {
	survey_id: string;
	title: string;
	status?: string;
	eligible_users: number;
	completed_count: number;
	completion_rate: number;
	questions: Array<Record<string, unknown>>;
};

export type SurveyUserListItem = {
	id: string;
	title: string;
	description_user: string;
	status: string;
	reward: SurveyRewardSpec;
	closes_at: string | null;
	published_at: string | null;
	question_count: number;
	completed: boolean;
	completed_at: string | null;
	reward_granted: SurveyRewardSpec | null;
};

export type SurveyUserDetail = {
	id: string;
	title: string;
	description_user: string;
	reward: SurveyRewardSpec;
	closes_at: string | null;
	questions: SurveyQuestion[];
	completed: boolean;
	completed_at: string | null;
};

export type SurveySummary = {
	available_count: number;
	completed_count: number;
	total_reward_ugs: number;
	total_reward_ew: number;
	total_reward_coins: number;
};

export type SurveySubmitResult = {
	response_id: string;
	submitted_at: string;
	reward_granted: SurveyRewardSpec;
};

export type SurveyResponseMe = {
	survey_id: string;
	answers: Record<string, unknown>;
	submitted_at: string;
	reward_granted: SurveyRewardSpec | null;
};

export async function fetchSurveySummary(): Promise<SurveySummary> {
	return api.get<SurveySummary>(`${BASE}/surveys/summary`);
}

export async function fetchSurveys(
	filter?: 'available' | 'completed'
): Promise<{
	items: SurveyUserListItem[];
	total: number;
}> {
	return api.get(`${BASE}/surveys`, {
		params: filter ? { filter } : undefined,
	});
}

export async function fetchSurveyDetail(
	surveyId: string
): Promise<SurveyUserDetail> {
	return api.get<SurveyUserDetail>(`${BASE}/surveys/${surveyId}`);
}

export async function submitSurveyResponse(
	surveyId: string,
	body: {
		answers: Record<string, unknown>;
		client_meta?: Record<string, unknown>;
	}
): Promise<SurveySubmitResult> {
	return api.post<SurveySubmitResult>(
		`${BASE}/surveys/${surveyId}/responses`,
		body
	);
}

export async function fetchMySurveyResponse(
	surveyId: string
): Promise<SurveyResponseMe> {
	return api.get<SurveyResponseMe>(`${BASE}/surveys/${surveyId}/responses/me`);
}

export async function adminListSurveys(status?: string): Promise<{
	items: SurveyAdmin[];
	total: number;
}> {
	return api.get(`${BASE}/admin/surveys`, {
		params: status ? { status } : undefined,
	});
}

export async function adminSurveyAiDraft(body: {
	brief: string;
	mode?: 'create' | 'refine';
	draft?: SurveyAiDraft;
	supplement?: string;
}): Promise<SurveyAiDraft> {
	return api.post<SurveyAiDraft>(`${BASE}/admin/surveys/ai/draft`, body);
}

export async function adminCreateSurvey(body: {
	title: string;
	description_user?: string;
	description_admin?: string | null;
	audience_mode?: string;
	reward?: SurveyRewardSpec;
	gaf_notify_body_template?: string | null;
	closes_at?: string | null;
	sort_order?: number;
}): Promise<SurveyAdmin> {
	return api.post<SurveyAdmin>(`${BASE}/admin/surveys`, body);
}

export async function adminGetSurvey(surveyId: string): Promise<SurveyAdmin> {
	return api.get<SurveyAdmin>(`${BASE}/admin/surveys/${surveyId}`);
}

export async function adminPatchSurvey(
	surveyId: string,
	body: Partial<{
		title: string;
		description_user: string;
		description_admin: string | null;
		audience_mode: string;
		reward: SurveyRewardSpec;
		gaf_notify_body_template: string | null;
		closes_at: string | null;
		sort_order: number;
	}>
): Promise<SurveyAdmin> {
	return api.patch<SurveyAdmin>(`${BASE}/admin/surveys/${surveyId}`, body);
}

export async function adminReplaceSurveyQuestions(
	surveyId: string,
	questions: SurveyQuestion[]
): Promise<SurveyAdmin> {
	return api.put<SurveyAdmin>(
		`${BASE}/admin/surveys/${surveyId}/questions`,
		questions
	);
}

export async function adminReplaceSurveyAudience(
	surveyId: string,
	body: {
		audience_mode: string;
		access_group_ids: string[];
		user_ids: string[];
	}
): Promise<SurveyAdmin> {
	return api.put<SurveyAdmin>(
		`${BASE}/admin/surveys/${surveyId}/audience`,
		body
	);
}

export async function adminPreviewSurveyAudience(
	surveyId: string
): Promise<{ eligible_count: number }> {
	return api.post(`${BASE}/admin/surveys/${surveyId}/preview-audience`, {});
}

export async function adminPublishSurvey(
	surveyId: string
): Promise<SurveyAdmin> {
	return api.post<SurveyAdmin>(`${BASE}/admin/surveys/${surveyId}/publish`, {});
}

export async function adminArchiveSurvey(
	surveyId: string
): Promise<SurveyAdmin> {
	return api.post<SurveyAdmin>(`${BASE}/admin/surveys/${surveyId}/archive`, {});
}

export async function adminSurveyResultsSummary(
	surveyId: string
): Promise<SurveyResultsSummary> {
	return api.get<SurveyResultsSummary>(
		`${BASE}/admin/surveys/${surveyId}/results/summary`
	);
}

export async function adminSurveyResultsResponses(
	surveyId: string,
	params?: {
		limit?: number;
		offset?: number;
		submitted_from?: string;
		submitted_to?: string;
		submitted_sort?: 'asc' | 'desc';
	}
): Promise<{
	items: Array<{
		id: string;
		user_id: string;
		answers_json: Record<string, unknown>;
		reward_granted_json: SurveyRewardSpec | null;
		submitted_at: string;
	}>;
	total: number;
}> {
	return api.get(`${BASE}/admin/surveys/${surveyId}/results/responses`, {
		params,
	});
}

export async function adminQueueSurveyGafNotify(
	surveyId: string,
	mode: 'undelivered' | 'incomplete'
): Promise<{ queued: boolean; mode: string }> {
	return api.post(
		`${BASE}/admin/surveys/${surveyId}/gaf-notify`,
		{},
		{
			params: { mode },
		}
	);
}
