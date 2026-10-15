/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Build desktop welcome tour steps with anchor-aware body text when spotlight targets are hidden.
 *
 * Invariants:
 * - When a highlight selector has no visible match, use `bodyHidden` i18n and drop the spotlight.
 * - Re-resolves on tour open and on each step prepare (widgets panel may be disabled).
 *
 * Related:
 * - desktopWelcomeGuideConstants.ts, DesktopWelcomeScreen.tsx
 */

import { findVisibleGuideHighlight } from '@/components/guided-tour/guideTourHighlightTarget';
import type { SpotlightGuideStep } from '@/components/guided-tour/SpotlightGuideModal';
import { useBuiltGuideSteps } from '@/components/guided-tour/useBuiltGuideSteps';
import type { TFunction } from 'i18next';
import { useCallback, useState } from 'react';
import {
	DESKTOP_WELCOME_GUIDE_ROOT_ID,
	DESKTOP_WELCOME_GUIDE_STEP_DEFS,
} from './desktopWelcomeGuideConstants';

function resolveWelcomeGuideStep(
	step: SpotlightGuideStep,
	t: TFunction,
	rootId: string
): SpotlightGuideStep {
	if (!step.highlightSelector) return step;
	if (typeof document === 'undefined') return step;

	const root = document.getElementById(rootId);
	if (!root) {
		return fallbackWelcomeGuideStep(step, t);
	}

	const el = findVisibleGuideHighlight(root, step.highlightSelector);
	if (el) return step;

	return fallbackWelcomeGuideStep(step, t);
}

function fallbackWelcomeGuideStep(
	step: SpotlightGuideStep,
	t: TFunction
): SpotlightGuideStep {
	const hiddenBody = t(`guide.steps.${step.id}.bodyHidden`, {
		defaultValue: '',
	});
	return {
		...step,
		highlightSelector: null,
		body: hiddenBody || step.body,
	};
}

export function useDesktopWelcomeGuideSteps(
	t: TFunction,
	resolveKey: number
): SpotlightGuideStep[] {
	const baseSteps = useBuiltGuideSteps(
		t,
		'guide.steps',
		DESKTOP_WELCOME_GUIDE_STEP_DEFS
	);

	void resolveKey;
	return baseSteps.map((step) =>
		resolveWelcomeGuideStep(step, t, DESKTOP_WELCOME_GUIDE_ROOT_ID)
	);
}

/** Bump `resolveKey` when the active step changes so anchors re-check in the DOM. */
export function useDesktopWelcomeGuideStepResolver(): {
	resolveKey: number;
	onPrepareStep: (stepId: string) => void;
} {
	const [resolveKey, setResolveKey] = useState(0);
	const onPrepareStep = useCallback((_stepId: string) => {
		setResolveKey((k) => k + 1);
	}, []);
	return { resolveKey, onPrepareStep };
}
