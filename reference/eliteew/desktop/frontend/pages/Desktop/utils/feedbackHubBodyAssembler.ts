/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Assembles optional structured wish/bug template blocks into ticket body text.
 *
 * Invariants:
 * - Only included blocks with non-empty trimmed text are emitted.
 * - Structured part is appended to main message in FeedbackHubApp, not replaced.
 *
 * Related:
 * - src/pages/Desktop/components/FeedbackHubApp.tsx
 */

export type FeedbackSection = { include: boolean; text: string };

export const WISH_FORM_KEYS = ['p1', 'p2', 'p3', 'p4', 'p5'] as const;
export type WishFormKey = (typeof WISH_FORM_KEYS)[number];

export const WISH_TITLE_KEYS = [
	'cheatSheetWishP1',
	'cheatSheetWishP2',
	'cheatSheetWishP3',
	'cheatSheetWishP4',
	'cheatSheetWishP5',
] as const;

export type BugFormState = {
	expected: FeedbackSection;
	actual: FeedbackSection;
	steps: FeedbackSection;
	context: FeedbackSection;
	freq: null | 'always' | 'sometimes' | 'once';
};

export const BUG_FREQ_LABEL_KEYS = {
	always: 'freqAlways',
	sometimes: 'freqSometimes',
	once: 'freqOnce',
} as const;

export function createEmptyWishForm(): Record<WishFormKey, FeedbackSection> {
	return {
		p1: { include: false, text: '' },
		p2: { include: false, text: '' },
		p3: { include: false, text: '' },
		p4: { include: false, text: '' },
		p5: { include: false, text: '' },
	};
}

export function createEmptyBugForm(): BugFormState {
	return {
		expected: { include: false, text: '' },
		actual: { include: false, text: '' },
		steps: { include: false, text: '' },
		context: { include: false, text: '' },
		freq: null,
	};
}

export function assembleWishBody(
	form: Record<WishFormKey, FeedbackSection>,
	labelForKey: (key: (typeof WISH_TITLE_KEYS)[number]) => string
): string {
	const parts: string[] = [];
	for (let i = 0; i < WISH_FORM_KEYS.length; i++) {
		const k = WISH_FORM_KEYS[i];
		const section = form[k];
		if (!section.include || !section.text.trim()) continue;
		parts.push(`${labelForKey(WISH_TITLE_KEYS[i])}: ${section.text.trim()}`);
	}
	return parts.join('\n\n');
}

export function assembleBugBody(
	form: BugFormState,
	labelForKey: (key: string) => string
): string {
	const parts: string[] = [];
	if (form.expected.include && form.expected.text.trim()) {
		parts.push(
			`${labelForKey('cheatSheetBugP1')}: ${form.expected.text.trim()}`
		);
	}
	if (form.actual.include && form.actual.text.trim()) {
		parts.push(`${labelForKey('cheatSheetBugP2')}: ${form.actual.text.trim()}`);
	}
	if (form.steps.include && form.steps.text.trim()) {
		parts.push(`${labelForKey('cheatSheetBugP3')}: ${form.steps.text.trim()}`);
	}
	if (form.freq) {
		parts.push(
			`${labelForKey('cheatSheetBugP4')}: ${labelForKey(BUG_FREQ_LABEL_KEYS[form.freq])}`
		);
	}
	if (form.context.include && form.context.text.trim()) {
		parts.push(
			`${labelForKey('cheatSheetBugP5')}: ${form.context.text.trim()}`
		);
	}
	return parts.join('\n\n');
}

/** Merges main message and optional structured template into submit body. */
export function buildFeedbackSubmitBody(
	mainMessage: string,
	structuredPart: string
): string {
	const main = mainMessage.trim();
	const extra = structuredPart.trim();
	if (!main && !extra) return '';
	if (!main) return extra;
	if (!extra) return main;
	return `${main}\n\n${extra}`;
}
