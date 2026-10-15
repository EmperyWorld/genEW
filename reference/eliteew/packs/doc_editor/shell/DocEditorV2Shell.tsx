/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * First isolated Document Editor V2 shell with the target desktop layout and rollout guardrails.
 * Provides a non-default UI foundation beside UltimateDocEditor without opening network or write paths.
 *
 * Invariants:
 * - The shell is preview-only until the v2 API/OpenAPI pilot and guarded save/apply contracts exist.
 * - Fallback to the legacy editor is explicit and supplied by the caller.
 *
 * Related:
 * - documentation/product/DOCUMENT-EDITOR-V2.md
 */

import {
	ChatBubbleLeftRightIcon,
	DocumentTextIcon,
	ExclamationTriangleIcon,
	SparklesIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';

import { DOC_EDITOR_V2_NS } from '@/i18n/namespaces';
import {
	DesktopAppButton,
	DesktopAppSectionLabel,
	DesktopAppStatusBadge,
	DesktopAppSurface,
	DesktopProductWorkspace,
} from '@/pages/Desktop/components/DesktopAppChrome';
import { cn } from '@/utils/cn';

import {
	DOC_EDITOR_V2_DEFAULT_SHELL_STATE,
	DOC_EDITOR_V2_SAVE_STATUS_CLASS,
} from './docEditorV2PreviewState';
import type {
	DocEditorV2Collaborator,
	DocEditorV2ImportWarning,
	DocEditorV2OutlineItem,
	DocEditorV2ShellProps,
	DocEditorV2ShellState,
	DocEditorV2Suggestion,
} from './types';

function buildShellState(
	override: DocEditorV2ShellProps['state'],
	defaultState = DOC_EDITOR_V2_DEFAULT_SHELL_STATE
): DocEditorV2ShellState {
	return {
		...defaultState,
		...override,
		collaborators: override?.collaborators ?? defaultState.collaborators,
		outlineItems: override?.outlineItems ?? defaultState.outlineItems,
		importWarnings: override?.importWarnings ?? defaultState.importWarnings,
		suggestions: override?.suggestions ?? defaultState.suggestions,
	};
}

function OutlineRail({ items }: { items: DocEditorV2OutlineItem[] }) {
	const { t } = useTranslation(DOC_EDITOR_V2_NS);

	return (
		<DesktopAppSurface
			variant="panel"
			padding="md"
			className="min-h-0 flex-1 overflow-hidden"
			aria-labelledby="doc-editor-v2-outline-title"
		>
			<DesktopAppSectionLabel id="doc-editor-v2-outline-title">
				{t('outline.section')}
			</DesktopAppSectionLabel>
			<nav className="mt-3 space-y-2" aria-label={t('aria.outline')}>
				{items.map((item) => (
					<div
						key={item.id}
						className={cn(
							'rounded-(--desktop-radius) border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2 text-sm',
							item.level === 2 ? 'ml-3' : item.level === 3 ? 'ml-6' : ''
						)}
					>
						<div className="flex items-center justify-between gap-2">
							<span className="truncate text-(--desktop-text-primary)">
								{item.title}
							</span>
							<DesktopAppStatusBadge className="shrink-0">
								H{item.level}
							</DesktopAppStatusBadge>
						</div>
						{item.status ? (
							<p className="mt-1 text-xs text-(--desktop-text-muted)">
								{t(`outline.statuses.${item.status}`)}
							</p>
						) : null}
					</div>
				))}
				{items.length === 0 ? (
					<p className="rounded-(--desktop-radius) border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2 text-xs text-(--desktop-text-muted)">
						{t('outline.empty')}
					</p>
				) : null}
			</nav>
		</DesktopAppSurface>
	);
}

function ImportWarningsRail({
	warnings,
	onImportFile,
	onOpenPaperless,
	onExportMarkdown,
}: {
	warnings: DocEditorV2ImportWarning[];
	onImportFile?: (file: File) => void;
	onOpenPaperless?: () => void;
	onExportMarkdown?: () => void;
}) {
	const { t } = useTranslation(DOC_EDITOR_V2_NS);

	return (
		<DesktopAppSurface variant="soft" padding="md">
			<div className="flex items-center gap-2">
				<ExclamationTriangleIcon
					className="h-4 w-4 text-amber-200"
					aria-hidden
				/>
				<DesktopAppSectionLabel>{t('import.section')}</DesktopAppSectionLabel>
			</div>
			<div className="mt-3 flex flex-wrap gap-2">
				<label
					className={cn(
						'inline-flex cursor-pointer items-center justify-center rounded-(--desktop-radius) border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-1.5 text-xs font-medium text-(--desktop-text-secondary) transition hover:border-(--desktop-border-strong) hover:text-(--desktop-text-primary)',
						!onImportFile && 'pointer-events-none opacity-50'
					)}
				>
					{t('actions.importFile')}
					<input
						type="file"
						accept=".md,.markdown,.html,.htm,.txt,.docx,.doc,.odt,.rtf,.pdf"
						className="sr-only"
						disabled={!onImportFile}
						onChange={(event) => {
							const file = event.currentTarget.files?.[0];
							if (file) onImportFile?.(file);
							event.currentTarget.value = '';
						}}
					/>
				</label>
				<DesktopAppButton
					type="button"
					variant="ghost"
					size="sm"
					disabled={!onOpenPaperless}
					onClick={onOpenPaperless}
				>
					{t('actions.importPaperless', 'From Paperless')}
				</DesktopAppButton>
				<DesktopAppButton
					type="button"
					variant="ghost"
					size="sm"
					disabled={!onExportMarkdown}
					onClick={onExportMarkdown}
				>
					{t('actions.exportMarkdown')}
				</DesktopAppButton>
			</div>
			<div className="mt-3 space-y-2">
				{warnings.map((warning) => (
					<div
						key={warning.id}
						className={cn(
							'rounded-(--desktop-radius) border px-3 py-2 text-xs leading-5',
							warning.tone === 'warning'
								? 'border-amber-400/30 bg-amber-500/10 text-amber-50'
								: 'border-(--desktop-border-subtle) bg-(--desktop-surface-panel) text-(--desktop-text-secondary)'
						)}
					>
						<div className="font-medium text-(--desktop-text-primary)">
							{warning.title}
						</div>
						<p className="mt-1">{warning.detail}</p>
					</div>
				))}
				{warnings.length === 0 ? (
					<div className="rounded-(--desktop-radius) border border-(--desktop-border-subtle) bg-(--desktop-surface-panel) px-3 py-2 text-xs text-(--desktop-text-muted)">
						{t('import.emptyTitle')}
					</div>
				) : null}
			</div>
		</DesktopAppSurface>
	);
}

function EditorCanvas({
	state,
	editorCanvas,
}: {
	state: DocEditorV2ShellState;
	editorCanvas?: DocEditorV2ShellProps['editorCanvas'];
}) {
	const { t } = useTranslation(DOC_EDITOR_V2_NS);

	return (
		<main
			className="flex min-h-0 flex-col"
			aria-labelledby="doc-editor-v2-canvas-title"
		>
			<DesktopAppSurface
				variant="panelStrong"
				padding="none"
				className="flex min-h-0 flex-1 flex-col overflow-hidden"
			>
				<div className="flex items-center justify-between gap-3 border-b border-(--desktop-border-subtle) px-3 py-2">
					<div className="min-w-0">
						<DesktopAppSectionLabel>
							{t('canvas.section')}
						</DesktopAppSectionLabel>
						<h2
							id="doc-editor-v2-canvas-title"
							className="mt-0.5 truncate text-sm font-semibold text-(--desktop-text-primary)"
						>
							{t('canvas.placeholderTitle')}
						</h2>
					</div>
					<DesktopAppStatusBadge>
						{editorCanvas ? t('canvas.coreMounted') : t('canvas.readOnlyShell')}
					</DesktopAppStatusBadge>
				</div>
				{editorCanvas ?? (
					<div className="min-h-0 flex-1 overflow-auto p-5">
						<div className="mx-auto flex min-h-full max-w-3xl flex-col rounded-(--desktop-radius-lg) border border-(--desktop-border-subtle) bg-[color-mix(in_srgb,var(--desktop-surface-panel-strong)_86%,white_4%)] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
							<div className="flex items-center gap-3 border-b border-(--desktop-border-subtle) pb-4">
								<div className="flex h-11 w-11 items-center justify-center rounded-(--desktop-radius) border border-amber-300/25 bg-amber-400/10 text-amber-100">
									<DocumentTextIcon className="h-5 w-5" aria-hidden />
								</div>
								<div className="min-w-0">
									<p className="truncate text-lg font-semibold text-(--desktop-text-primary)">
										{state.title}
									</p>
									<p className="text-sm text-(--desktop-text-muted)">
										{state.documentId
											? t('canvas.documentId', { id: state.documentId })
											: t('canvas.emptyDocument')}
									</p>
								</div>
							</div>
							<p className="mt-6 text-base leading-8 text-(--desktop-text-secondary)">
								{state.plainTextPreview}
							</p>
							<div className="mt-auto pt-8 text-sm text-(--desktop-text-muted)">
								{t('canvas.fallbackNote')}
							</div>
						</div>
					</div>
				)}
			</DesktopAppSurface>
		</main>
	);
}

function EwaPartnerRail({
	collaborators,
	suggestions,
	onRequestEwaSuggestion,
	onApplySuggestion,
}: {
	collaborators: DocEditorV2Collaborator[];
	suggestions: DocEditorV2Suggestion[];
	onRequestEwaSuggestion?: () => void;
	onApplySuggestion?: (suggestionId: string) => void;
}) {
	const { t } = useTranslation(DOC_EDITOR_V2_NS);

	return (
		<aside
			className="flex min-h-0 flex-col gap-3"
			aria-labelledby="doc-editor-v2-ewa-title"
		>
			<DesktopAppSurface variant="panel" padding="md">
				<div className="flex items-center gap-2">
					<SparklesIcon className="h-4 w-4 text-amber-100" aria-hidden />
					<DesktopAppSectionLabel id="doc-editor-v2-ewa-title">
						{t('ewa.section')}
					</DesktopAppSectionLabel>
				</div>
				<p className="mt-3 text-sm leading-6 text-(--desktop-text-secondary)">
					{t('ewa.description')}
				</p>
				<DesktopAppButton
					type="button"
					variant="neutral"
					size="sm"
					className="mt-4"
					disabled={!onRequestEwaSuggestion}
					onClick={onRequestEwaSuggestion}
				>
					{t('actions.suggestRewrite')}
				</DesktopAppButton>
				<div className="mt-4 space-y-2">
					{collaborators.map((person) => (
						<div
							key={person.id}
							className="flex items-center justify-between gap-2 rounded-(--desktop-radius) border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) px-3 py-2 text-sm"
						>
							<span className="truncate text-(--desktop-text-primary)">
								{person.name}
							</span>
							<DesktopAppStatusBadge>
								<span className="inline-flex items-center gap-1.5">
									<span
										className={cn(
											'h-2 w-2 rounded-full',
											person.isActive
												? 'bg-emerald-300'
												: 'bg-(--desktop-text-dim)'
										)}
										aria-hidden
									/>
									{t(`collaborators.roles.${person.role}`)}
								</span>
							</DesktopAppStatusBadge>
						</div>
					))}
				</div>
			</DesktopAppSurface>

			<DesktopAppSurface
				variant="panel"
				padding="md"
				className="min-h-0 flex-1 overflow-hidden"
			>
				<div className="flex items-center gap-2">
					<ChatBubbleLeftRightIcon
						className="h-4 w-4 text-(--desktop-text-muted)"
						aria-hidden
					/>
					<DesktopAppSectionLabel>
						{t('suggestions.section')}
					</DesktopAppSectionLabel>
				</div>
				<div className="mt-3 space-y-2">
					{suggestions.map((suggestion) => (
						<div
							key={suggestion.id}
							className="rounded-(--desktop-radius) border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) p-3"
						>
							<div className="flex items-start justify-between gap-2">
								<div className="text-sm font-medium text-(--desktop-text-primary)">
									{suggestion.title}
								</div>
								<DesktopAppStatusBadge>
									{t(`suggestions.status.${suggestion.status}`)}
								</DesktopAppStatusBadge>
							</div>
							<p className="mt-2 text-xs leading-5 text-(--desktop-text-secondary)">
								{suggestion.description}
							</p>
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="sm"
								className="mt-3"
								disabled={
									!onApplySuggestion || suggestion.status !== 'needs-approval'
								}
								onClick={() => onApplySuggestion?.(suggestion.id)}
							>
								{t('actions.applyAfterGuard')}
							</DesktopAppButton>
						</div>
					))}
					{suggestions.length === 0 ? (
						<div className="rounded-(--desktop-radius) border border-(--desktop-border-subtle) bg-(--desktop-surface-soft) p-3 text-xs text-(--desktop-text-muted)">
							{t('suggestions.empty')}
						</div>
					) : null}
				</div>
			</DesktopAppSurface>
		</aside>
	);
}

export function DocEditorV2Shell({
	state: stateOverride,
	className,
	editorCanvas,
	statusDescription,
	onImportFile,
	onOpenPaperless,
	onExportMarkdown,
	onRequestEwaSuggestion,
	onApplySuggestion,
	onFallbackToLegacy,
}: DocEditorV2ShellProps) {
	const { t } = useTranslation(DOC_EDITOR_V2_NS);
	const defaultState: DocEditorV2ShellState = {
		...DOC_EDITOR_V2_DEFAULT_SHELL_STATE,
		title: t('preview.title'),
		versionLabel: t('preview.version'),
		plainTextPreview: t('preview.defaultPlainText'),
		collaborators: [
			{
				id: 'owner',
				name: t('collaborators.names.owner'),
				role: 'owner',
				isActive: true,
			},
			{
				id: 'ewa',
				name: 'ЕВА',
				role: 'reviewer',
				isActive: true,
			},
		],
		outlineItems: [
			{
				id: 'intro',
				title: t('preview.outlineIntro'),
				level: 1,
				status: 'ready',
			},
			{
				id: 'model',
				title: t('preview.writePathTitle'),
				level: 2,
				status: 'ready',
			},
			{
				id: 'collab',
				title: t('preview.collaborationTitle'),
				level: 2,
				status: 'placeholder',
			},
		],
		importWarnings: [
			{
				id: 'docx-fidelity',
				title: t('preview.importTitle'),
				detail: t('preview.importDetail'),
				tone: 'info',
			},
		],
		suggestions: [],
	};
	const state = buildShellState(stateOverride, defaultState);
	const statusDescriptionText =
		statusDescription ??
		(editorCanvas ? t('status.coreDescription') : t('status.shellDescription'));

	return (
		<DesktopProductWorkspace
			className={cn('font-[family-name:var(--font-desktop)]', className)}
			contentClassName="overflow-hidden"
			header={
				<header className="flex min-h-[3.25rem] items-center justify-between gap-3 border-b border-(--desktop-border-subtle) bg-(--desktop-surface-panel)/80 px-3 py-2">
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 flex-wrap items-center gap-2">
							<span className="shrink-0 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-(--desktop-text-muted)">
								{t('app.eyebrow')}
							</span>
							<h1 className="truncate text-sm font-semibold text-(--desktop-text-primary)">
								{state.title}
							</h1>
							<DesktopAppStatusBadge
								className={DOC_EDITOR_V2_SAVE_STATUS_CLASS[state.saveStatus]}
							>
								{t(`saveStatus.${state.saveStatus}`)}
							</DesktopAppStatusBadge>
							<DesktopAppStatusBadge>
								{state.versionLabel}
							</DesktopAppStatusBadge>
							<DesktopAppStatusBadge>
								{t('collaborators.count', {
									count: state.collaborators.length,
								})}
							</DesktopAppStatusBadge>
							<DesktopAppStatusBadge>
								{editorCanvas ? t('header.core') : t('header.shellOnly')}
							</DesktopAppStatusBadge>
						</div>
						<p className="mt-1 truncate text-xs text-(--desktop-text-muted)">
							{statusDescriptionText}
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<DesktopAppButton
							type="button"
							variant="neutral"
							size="sm"
							onClick={onFallbackToLegacy}
							disabled={!onFallbackToLegacy}
						>
							{t('actions.openLegacy')}
						</DesktopAppButton>
					</div>
				</header>
			}
			footer={
				<footer className="flex flex-wrap items-center justify-between gap-3 border-t border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/30 px-4 py-2 text-xs text-(--desktop-text-muted)">
					<span>{t('footer.draft')}</span>
					<span>{t('footer.collab')}</span>
					<span>{t('footer.words', { count: state.wordCount })}</span>
					<span>
						{t('footer.importNotices', {
							count: state.importWarnings.length,
						})}
					</span>
				</footer>
			}
		>
			<div className="grid h-full min-h-0 grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)_minmax(16rem,20rem)] gap-3 p-3 max-xl:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)] max-lg:grid-cols-1">
				<div className="flex min-h-0 flex-col gap-3 max-lg:order-2">
					<OutlineRail items={state.outlineItems} />
					<ImportWarningsRail
						warnings={state.importWarnings}
						onImportFile={onImportFile}
						onOpenPaperless={onOpenPaperless}
						onExportMarkdown={onExportMarkdown}
					/>
				</div>
				<EditorCanvas state={state} editorCanvas={editorCanvas} />
				<div className="max-xl:col-span-2 max-xl:grid max-xl:grid-cols-2 max-xl:gap-3 max-lg:col-span-1 max-lg:block">
					<EwaPartnerRail
						collaborators={state.collaborators}
						suggestions={state.suggestions}
						onRequestEwaSuggestion={onRequestEwaSuggestion}
						onApplySuggestion={onApplySuggestion}
					/>
				</div>
			</div>
		</DesktopProductWorkspace>
	);
}

export default DocEditorV2Shell;
