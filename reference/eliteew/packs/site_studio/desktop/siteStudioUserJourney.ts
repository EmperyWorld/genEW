/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Derived user journey model for Site Studio guided UX: current stage, actionable steps, and blockers.
 *
 * Invariants:
 * - This module is pure and must not perform navigation, runtime actions, or HTTP calls.
 * - User-facing UI should consume this model instead of duplicating next-step rules in separate panels.
 *
 * Related:
 * - features/site-studio/desktop/UserSiteStudioApp.tsx
 * - features/site-studio/desktop/components/SiteStudioChecklist.tsx
 */
import type {
	SiteStudioApplyReport,
	SiteStudioDraftState,
	SiteStudioHealth,
	SiteStudioInstance,
} from './api';
import {
	computeSiteStudioRuntimeGuards,
	isSiteStudioPendingStatus,
} from './components/siteStudioRuntimeGuards';

export type SiteStudioJourneyStage =
	| 'setup'
	| 'ai_fill'
	| 'review'
	| 'media'
	| 'runtime'
	| 'publish'
	| 'live'
	| 'blocked';

export type SiteStudioJourneyStepId =
	| 'setup'
	| 'ai_fill'
	| 'review'
	| 'media'
	| 'runtime'
	| 'publish';

export type SiteStudioJourneyStepStatus =
	| 'done'
	| 'current'
	| 'blocked'
	| 'next';

export type SiteStudioJourneyTab =
	| 'setup'
	| 'ai'
	| 'content'
	| 'media'
	| 'autofill'
	| 'admin';

/** Map journey step → workspace surface tab (stage shell navigation). */
export function siteStudioJourneyStepToTab(
	stepId: SiteStudioJourneyStepId
): SiteStudioJourneyTab {
	switch (stepId) {
		case 'setup':
			return 'setup';
		case 'ai_fill':
			return 'autofill';
		case 'review':
			return 'content';
		case 'media':
			return 'media';
		case 'runtime':
		case 'publish':
			return 'setup';
	}
}

export type SiteStudioJourneyRuntimeAction =
	| 'provision'
	| 'start'
	| 'publish'
	| 'unpublish';

export type SiteStudioJourneyAction =
	| {
			kind: 'tab';
			labelKey: string;
			tab: SiteStudioJourneyTab;
	  }
	| {
			kind: 'runtime';
			labelKey: string;
			action: SiteStudioJourneyRuntimeAction;
	  }
	| {
			kind: 'apply_all';
			labelKey: string;
	  }
	| {
			kind: 'open_public';
			labelKey: string;
	  }
	| {
			kind: 'open_admin';
			labelKey: string;
	  };

export interface SiteStudioJourneyStep {
	id: SiteStudioJourneyStepId;
	titleKey: string;
	descriptionKey: string;
	status: SiteStudioJourneyStepStatus;
	action?: SiteStudioJourneyAction;
}

export interface SiteStudioJourneyModel {
	stage: SiteStudioJourneyStage;
	titleKey: string;
	descriptionKey: string;
	blockerKey: string | null;
	primaryAction: SiteStudioJourneyAction | null;
	secondaryActions: SiteStudioJourneyAction[];
	steps: SiteStudioJourneyStep[];
	progressDone: number;
	progressTotal: number;
	applySummary: {
		applied: number;
		skipped: number;
		failed: number;
		needsReview: boolean;
	} | null;
}

export interface ComputeSiteStudioUserJourneyInput {
	instance: SiteStudioInstance;
	health: SiteStudioHealth | null;
	drafts: SiteStudioDraftState | null;
	busyKeys: Set<string>;
	applyReports: Record<string, SiteStudioApplyReport>;
	adminShellReady: boolean;
}

const STEP_DEFS: Array<{
	id: SiteStudioJourneyStepId;
	titleKey: string;
	descriptionKey: string;
	action: SiteStudioJourneyAction;
}> = [
	{
		id: 'setup',
		titleKey: 'journey.steps.setup.title',
		descriptionKey: 'journey.steps.setup.description',
		action: {
			kind: 'tab',
			labelKey: 'journey.actions.openSetup',
			tab: 'setup',
		},
	},
	{
		id: 'ai_fill',
		titleKey: 'journey.steps.aiFill.title',
		descriptionKey: 'journey.steps.aiFill.description',
		action: {
			kind: 'tab',
			labelKey: 'journey.actions.openAutofill',
			tab: 'autofill',
		},
	},
	{
		id: 'review',
		titleKey: 'journey.steps.review.title',
		descriptionKey: 'journey.steps.review.description',
		action: {
			kind: 'tab',
			labelKey: 'journey.actions.reviewDrafts',
			tab: 'content',
		},
	},
	{
		id: 'media',
		titleKey: 'journey.steps.media.title',
		descriptionKey: 'journey.steps.media.description',
		action: {
			kind: 'tab',
			labelKey: 'journey.actions.openMedia',
			tab: 'media',
		},
	},
	{
		id: 'runtime',
		titleKey: 'journey.steps.runtime.title',
		descriptionKey: 'journey.steps.runtime.description',
		action: {
			kind: 'runtime',
			labelKey: 'journey.actions.startRuntime',
			action: 'start',
		},
	},
	{
		id: 'publish',
		titleKey: 'journey.steps.publish.title',
		descriptionKey: 'journey.steps.publish.description',
		action: {
			kind: 'runtime',
			labelKey: 'journey.actions.publish',
			action: 'publish',
		},
	},
];

function hasText(value: unknown): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}

function aggregateApplyReports(reports: Record<string, SiteStudioApplyReport>) {
	const values = Object.values(reports);
	if (!values.length) return null;
	const summary = values.reduce(
		(acc, report) => {
			acc.applied += report.applied;
			acc.skipped += report.skipped;
			acc.failed += report.failed;
			return acc;
		},
		{ applied: 0, skipped: 0, failed: 0, needsReview: false }
	);
	summary.needsReview =
		summary.skipped > 0 ||
		summary.failed > 0 ||
		values.some((report) => report.status !== 'applied');
	return summary;
}

function isStepDone(
	stepId: SiteStudioJourneyStepId,
	input: ComputeSiteStudioUserJourneyInput
): boolean {
	const { instance, health, drafts, applyReports } = input;
	switch (stepId) {
		case 'setup':
			return hasText(instance.site_title) && hasText(instance.site_topic);
		case 'ai_fill':
			return Boolean(drafts?.siteBlueprint && drafts.contentDrafts.length > 0);
		case 'review':
			return Object.values(applyReports).some((report) => report.applied > 0);
		case 'media':
			return Boolean(drafts?.imageDrafts.length);
		case 'runtime':
			return instance.status === 'running' || health?.status === 'running';
		case 'publish':
			if (health?.edge?.enabled) {
				return isSiteStudioEdgeLive(health);
			}
			return isSiteStudioCmsOpen(instance);
	}
}

function resolveCurrentStep(
	input: ComputeSiteStudioUserJourneyInput
): SiteStudioJourneyStepId {
	for (const step of STEP_DEFS) {
		if (!isStepDone(step.id, input)) {
			return step.id;
		}
	}
	return 'publish';
}

function runtimeActionForInstance(
	instance: SiteStudioInstance
): SiteStudioJourneyAction {
	if (instance.compose_file_path) {
		return {
			kind: 'runtime',
			labelKey: 'journey.actions.startRuntime',
			action: 'start',
		};
	}
	return {
		kind: 'runtime',
		labelKey: 'journey.actions.prepareRuntime',
		action: 'provision',
	};
}

/** Visitor Edge is live only with non-stub content + URL (Carrier honesty). */
export function isSiteStudioEdgeLive(health: SiteStudioHealth | null): boolean {
	const source = health?.edge?.content_source;
	return Boolean(
		health?.edge?.enabled &&
			health.edge.url &&
			(source === 'runtime_dist' || source === 'snapshot')
	);
}

function isSiteStudioCmsOpen(instance: SiteStudioInstance): boolean {
	return instance.publication_state === 'open' && Boolean(instance.public_url);
}

export function computeSiteStudioUserJourney(
	input: ComputeSiteStudioUserJourneyInput
): SiteStudioJourneyModel {
	const { instance, health, busyKeys, applyReports, adminShellReady } = input;
	const runtimeGuards = computeSiteStudioRuntimeGuards({
		instanceStatus: instance.status,
		healthStatus: health?.status,
		publicationState: instance.publication_state,
		busyKeys,
	});
	const applySummary = aggregateApplyReports(applyReports);
	const currentStep = resolveCurrentStep(input);
	const progressDone = STEP_DEFS.filter((step) =>
		isStepDone(step.id, input)
	).length;
	const isPending = isSiteStudioPendingStatus(instance.status);

	let stage: SiteStudioJourneyStage =
		currentStep === 'ai_fill' ? 'ai_fill' : currentStep;
	let titleKey = `journey.stage.${stage}.title`;
	let descriptionKey = `journey.stage.${stage}.description`;
	let blockerKey: string | null = null;
	let primaryAction: SiteStudioJourneyAction | null =
		STEP_DEFS.find((step) => step.id === currentStep)?.action ?? null;
	const secondaryActions: SiteStudioJourneyAction[] = [];

	if (currentStep === 'review') {
		primaryAction = {
			kind: 'apply_all',
			labelKey: 'journey.actions.applyDrafts',
		};
		secondaryActions.push({
			kind: 'tab',
			labelKey: 'journey.actions.reviewDrafts',
			tab: 'content',
		});
	}

	if (currentStep === 'runtime') {
		primaryAction = runtimeActionForInstance(instance);
		if (isPending) {
			stage = 'blocked';
			titleKey = 'journey.stage.blocked.title';
			descriptionKey = 'journey.stage.blocked.description';
			blockerKey = 'journey.blockers.runtimePending';
			primaryAction = {
				kind: 'tab',
				labelKey: 'journey.actions.openRuntime',
				tab: 'setup',
			};
		} else if (health && !health.worker_ready && !runtimeGuards.isRunning) {
			stage = 'blocked';
			titleKey = 'journey.stage.blocked.title';
			descriptionKey = 'journey.stage.blocked.description';
			blockerKey = 'journey.blockers.runtimeWorker';
			primaryAction = {
				kind: 'tab',
				labelKey: 'journey.actions.openRuntime',
				tab: 'setup',
			};
		}
	}

	if (currentStep === 'publish') {
		const edgeEnabled = Boolean(health?.edge?.enabled);
		const edgeLive = isSiteStudioEdgeLive(health);
		const cmsOpen = isSiteStudioCmsOpen(instance);

		if (edgeEnabled && cmsOpen && !edgeLive) {
			stage = 'blocked';
			titleKey = 'journey.stage.blocked.title';
			descriptionKey = 'journey.stage.edgeNeedsAttention.description';
			blockerKey = 'journey.blockers.edgeNeedsAttention';
			primaryAction = {
				kind: 'tab',
				labelKey: 'journey.actions.openRuntime',
				tab: 'setup',
			};
			if (adminShellReady) {
				secondaryActions.push({
					kind: 'open_admin',
					labelKey: 'journey.actions.openAdmin',
				});
			}
		} else if (runtimeGuards.isPublished && (!edgeEnabled || edgeLive)) {
			stage = 'live';
			titleKey = 'journey.stage.live.title';
			descriptionKey = edgeLive
				? 'journey.stage.edgeLive.description'
				: 'journey.stage.live.description';
			primaryAction = {
				kind: 'open_public',
				labelKey: edgeLive
					? 'journey.actions.openEdgePublic'
					: 'journey.actions.openPublic',
			};
			if (adminShellReady) {
				secondaryActions.push({
					kind: 'open_admin',
					labelKey: 'journey.actions.openAdmin',
				});
			}
		} else {
			primaryAction = {
				kind: 'runtime',
				labelKey: 'journey.actions.publish',
				action: 'publish',
			};
			if (adminShellReady) {
				secondaryActions.push({
					kind: 'open_admin',
					labelKey: 'journey.actions.openAdmin',
				});
			}
			secondaryActions.push({
				kind: 'tab',
				labelKey: 'journey.actions.openRuntime',
				tab: 'setup',
			});
		}
	}

	if (instance.last_error) {
		stage = 'blocked';
		titleKey = 'journey.stage.blocked.title';
		descriptionKey = 'journey.stage.blocked.description';
		blockerKey = 'journey.blockers.lastError';
		primaryAction = {
			kind: 'tab',
			labelKey: 'journey.actions.openRuntime',
			tab: 'setup',
		};
	}

	const steps: SiteStudioJourneyStep[] = STEP_DEFS.map((step) => {
		const done = isStepDone(step.id, input);
		let status: SiteStudioJourneyStepStatus = done ? 'done' : 'next';
		if (!done && step.id === currentStep) {
			status = stage === 'blocked' ? 'blocked' : 'current';
		}
		return {
			id: step.id,
			titleKey: step.titleKey,
			descriptionKey: step.descriptionKey,
			status,
			action: done ? undefined : step.action,
		};
	});

	return {
		stage,
		titleKey,
		descriptionKey,
		blockerKey,
		primaryAction,
		secondaryActions,
		steps,
		progressDone,
		progressTotal: STEP_DEFS.length,
		applySummary,
	};
}
