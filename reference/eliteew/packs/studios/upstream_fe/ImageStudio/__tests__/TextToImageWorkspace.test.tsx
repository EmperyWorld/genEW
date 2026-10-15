/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Behavioral checks for Text-to-image empty state and success handoff CTAs.
 *
 * Invariants:
 * - Empty canvas copy visible without result; handoff buttons appear with result.
 *
 * Related:
 * - workspaces/TextToImageWorkspace.tsx
 */

import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImageStudioTextToImageWorkspace } from '../workspaces/TextToImageWorkspace';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, opts?: Record<string, unknown>) => {
			if (opts && typeof opts === 'object') {
				let out = key;
				for (const [k, v] of Object.entries(opts)) {
					if (k === 'defaultValue' && typeof v === 'string') return v;
					out = out.replaceAll(`{{${k}}}`, String(v));
				}
				return out;
			}
			return key;
		},
		i18n: { language: 'en' },
	}),
}));

vi.mock('../../CreativeStudio/studioChrome', () => ({
	StudioEmptyState: ({ title, hint }: { title: string; hint?: string }) => (
		<div data-testid="empty-state">
			<span>{title}</span>
			{hint ? <span>{hint}</span> : null}
		</div>
	),
	useCreativeStudioShellClasses: () => ({
		studioInputClass: '',
		studioPreviewWellClass: '',
		studioPrimaryButtonClass: '',
		studioSecondaryButtonClass: '',
		studioGhostChipClass: '',
		studioDisclosureButtonClass: '',
		studioSoftPanelClass: '',
		studioPanelClass: '',
	}),
	studioDisclosureHintClass: '',
	studioFieldLabelClass: '',
	studioFieldMetaClass: '',
}));

vi.mock('../../CreativeStudio/studioSharedUi', () => ({
	CreativeStudioFlowCard: ({
		title,
		children,
	}: {
		title: string;
		children?: ReactNode;
	}) => (
		<section>
			<h3>{title}</h3>
			{children}
		</section>
	),
	CreativeStudioPanelCard: ({
		title,
		children,
	}: {
		title: string;
		children?: ReactNode;
	}) => (
		<section>
			<h3>{title}</h3>
			{children}
		</section>
	),
	CreativeStudioGeneratingPreview: ({
		statusMessage,
	}: {
		statusMessage: string;
	}) => <div>{statusMessage}</div>,
}));

const baseProps = {
	prompt: '',
	onPromptChange: vi.fn(),
	promptIdea: '',
	onPromptIdeaChange: vi.fn(),
	promptLang: 'en' as const,
	onPromptLangChange: vi.fn(),
	showPromptHelper: false,
	onTogglePromptHelper: vi.fn(),
	promptAiLoading: false,
	promptAiEnergy: null,
	onSuggestPrompt: vi.fn(),
	stylePresetId: 'none',
	onStylePresetChange: vi.fn(),
	variantCount: 1 as const,
	onVariantCountChange: vi.fn(),
	showAdvanced: false,
	onToggleAdvanced: vi.fn(),
	width: 1024,
	height: 1024,
	onWidthChange: vi.fn(),
	onHeightChange: vi.fn(),
	seed: '',
	onSeedChange: vi.fn(),
	loading: false,
	canGenerate: false,
	t2iEnergy: null,
	onGenerate: vi.fn(),
	result: null,
	onClearResult: vi.fn(),
	onDownload: vi.fn(),
};

describe('ImageStudioTextToImageWorkspace', () => {
	it('shows empty canvas state when there is no result', () => {
		render(<ImageStudioTextToImageWorkspace {...baseProps} />);
		expect(screen.getByTestId('empty-state')).toBeInTheDocument();
		expect(screen.getByText('empty.canvasTitle')).toBeInTheDocument();
		expect(screen.queryByTestId('handoff-edit')).not.toBeInTheDocument();
		expect(screen.queryByTestId('handoff-rotate')).not.toBeInTheDocument();
	});

	it('shows Edit / Rotate handoff buttons when a result is present', () => {
		const onSendToEdit = vi.fn();
		const onSendToRotate = vi.fn();
		render(
			<ImageStudioTextToImageWorkspace
				{...baseProps}
				prompt="sunset"
				canGenerate
				result={{ data: 'abc123', filename: 'out.png' }}
				onSendToEdit={onSendToEdit}
				onSendToRotate={onSendToRotate}
			/>
		);
		expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
		expect(screen.getByTestId('handoff-edit')).toBeInTheDocument();
		expect(screen.getByTestId('handoff-rotate')).toBeInTheDocument();
		expect(screen.getByText('handoff.title')).toBeInTheDocument();
	});
});
