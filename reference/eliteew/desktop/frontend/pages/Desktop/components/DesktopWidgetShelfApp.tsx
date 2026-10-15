/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Expanded desktop window for widget shelf notes and todos with guided tour (GT-10d).
 *
 * Invariants:
 * - Notes/todos may degrade to local-only when server sync is unavailable.
 *
 * Related:
 * - DesktopWidgetShelfApp.tsx, public/audio/widget-shelf-guide/
 * - DesktopChromeTooltip.tsx
 */
import { cn } from '@/utils/cn';
import * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { guideTourLabelsFromI18n } from '@/components/guided-tour/guideTourLabelsFromI18n';
import { SpotlightGuideModal } from '@/components/guided-tour/SpotlightGuideModal';
import { useBuiltGuideSteps } from '@/components/guided-tour/useBuiltGuideSteps';
import { useDesktopGuideTourOpener } from '@/pages/Desktop/hooks/useDesktopGuideTourOpener';
import { DESKTOP_TYPOGRAPHY } from '../constants';
import { useWidgetNotes, useWidgetTodos } from '../hooks/useWidgetNotesTodos';
import {
	DesktopAppButton,
	DesktopAppContentWrapper,
	DesktopAppSurface,
	DesktopProductWorkspace,
} from './DesktopAppChrome';
import { DesktopChromeTooltip } from './DesktopChromeTooltip';
import {
	WIDGET_SHELF_GUIDE_AUDIO_LS_KEY,
	WIDGET_SHELF_GUIDE_ROOT_ID,
	WIDGET_SHELF_GUIDE_STEP_DEFS,
	WIDGET_SHELF_GUIDE_TOUR_FOLDER,
} from './widgetShelfGuideConstants';

export type DesktopWidgetShelfAppProps = {
	initialTab?: 'notes' | 'todos';
};

function NotesPane() {
	const { t } = useTranslation('desktopUi', {
		keyPrefix: 'settingsPanel.widgetShelf',
	});
	const { t: tw } = useTranslation('desktopUi', {
		keyPrefix: 'settingsPanel.widgetsPanel',
	});
	const { t: tWorkspace } = useTranslation('desktopUi', {
		keyPrefix: 'workspace',
	});
	const {
		notes,
		isLoading,
		isLocalOnly,
		storageWriteFailed,
		addNote,
		updateNote,
		deleteNote,
	} = useWidgetNotes();

	if (isLoading && notes.length === 0) {
		return <p className={DESKTOP_TYPOGRAPHY.caption}>{tw('loading')}</p>;
	}

	return (
		<div
			data-widget-shelf-guide="notes-pane"
			className="flex min-h-0 flex-1 flex-col gap-3"
			data-local-only={isLocalOnly ? 'true' : undefined}
		>
			{isLocalOnly ? (
				<p
					data-widget-shelf-guide="local-hint"
					className={cn(
						DESKTOP_TYPOGRAPHY.caption,
						'text-(--desktop-text-dim)'
					)}
					data-local-only="true"
				>
					{tWorkspace('localOnlyHint')}
				</p>
			) : null}
			{storageWriteFailed ? (
				<p
					className={cn(
						DESKTOP_TYPOGRAPHY.caption,
						'text-(--desktop-text-dim)'
					)}
					role="alert"
				>
					{tWorkspace('localStorageWriteFailed')}
				</p>
			) : null}
			<div className="flex shrink-0 justify-end">
				<DesktopChromeTooltip
					content={t('addNote')}
					placement="top"
					offsetExtra={4}
				>
					<DesktopAppButton type="button" size="sm" onClick={() => addNote()}>
						{t('addNote')}
					</DesktopAppButton>
				</DesktopChromeTooltip>
			</div>
			<ul className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
				{notes.map((n) => (
					<li
						key={n.id}
						className="rounded-xl border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/80 p-3"
					>
						<div className="mb-2 flex items-center justify-end gap-2">
							<DesktopChromeTooltip
								content={t('deleteNote')}
								placement="top"
								offsetExtra={4}
							>
								<DesktopAppButton
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => deleteNote(n.id)}
									aria-label={t('deleteNote')}
									className="h-8 w-8 text-(--desktop-text-muted) hover:text-(--desktop-text-secondary)"
								>
									<TrashIcon className="size-4" strokeWidth={2} aria-hidden />
								</DesktopAppButton>
							</DesktopChromeTooltip>
						</div>
						<textarea
							value={n.content}
							onChange={(e) => updateNote(n.id, e.target.value)}
							rows={4}
							className={cn(
								DESKTOP_TYPOGRAPHY.caption,
								'w-full resize-y rounded-lg border border-(--desktop-border-subtle) bg-transparent px-3 py-2 text-(--desktop-text-primary) placeholder:text-(--desktop-text-muted) focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
							)}
							placeholder={t('notePlaceholder')}
						/>
					</li>
				))}
			</ul>
			{notes.length === 0 && !isLoading && (
				<p className={DESKTOP_TYPOGRAPHY.caption}>{tw('notesEmpty')}</p>
			)}
		</div>
	);
}

function TodosPane() {
	const { t } = useTranslation('desktopUi', {
		keyPrefix: 'settingsPanel.widgetShelf',
	});
	const { t: tw } = useTranslation('desktopUi', {
		keyPrefix: 'settingsPanel.widgetsPanel',
	});
	const { t: tWorkspace } = useTranslation('desktopUi', {
		keyPrefix: 'workspace',
	});
	const {
		todos,
		isLoading,
		isLocalOnly,
		storageWriteFailed,
		addTodo,
		toggleTodo,
		deleteTodo,
	} = useWidgetTodos();
	const [draft, setDraft] = useState('');

	const sorted = useMemo(
		() =>
			[...todos].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
		[todos]
	);

	if (isLoading && todos.length === 0) {
		return <p className={DESKTOP_TYPOGRAPHY.caption}>{tw('loading')}</p>;
	}

	return (
		<div
			data-widget-shelf-guide="todos-pane"
			className="flex min-h-0 flex-1 flex-col gap-3"
			data-local-only={isLocalOnly ? 'true' : undefined}
		>
			{isLocalOnly ? (
				<p
					data-widget-shelf-guide="local-hint"
					className={cn(
						DESKTOP_TYPOGRAPHY.caption,
						'text-(--desktop-text-dim)'
					)}
					data-local-only="true"
				>
					{tWorkspace('localOnlyHint')}
				</p>
			) : null}
			{storageWriteFailed ? (
				<p
					className={cn(
						DESKTOP_TYPOGRAPHY.caption,
						'text-(--desktop-text-dim)'
					)}
					role="alert"
				>
					{tWorkspace('localStorageWriteFailed')}
				</p>
			) : null}
			<form
				className="flex shrink-0 gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					const text = draft.trim();
					if (!text) return;
					addTodo(text, 'medium', []);
					setDraft('');
				}}
			>
				<input
					type="text"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					placeholder={t('todoPlaceholder')}
					className={cn(
						DESKTOP_TYPOGRAPHY.caption,
						'min-w-0 flex-1 rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/60 px-3 py-2 text-(--desktop-text-primary) placeholder:text-(--desktop-text-muted) focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
					)}
				/>
				<DesktopChromeTooltip
					content={t('addTodo')}
					placement="top"
					offsetExtra={4}
				>
					<DesktopAppButton type="submit" size="sm">
						{t('addTodo')}
					</DesktopAppButton>
				</DesktopChromeTooltip>
			</form>
			<ul className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
				{sorted.map((todo) => (
					<li
						key={todo.id}
						className="flex items-start gap-2 rounded-lg border border-(--desktop-border-subtle) bg-(--desktop-surface-soft)/70 px-2 py-2"
					>
						<input
							type="checkbox"
							checked={todo.completed}
							onChange={() => toggleTodo(todo.id)}
							className="mt-1 shrink-0 rounded border-(--desktop-border-subtle)"
							aria-label={todo.text}
						/>
						<span
							className={cn(
								DESKTOP_TYPOGRAPHY.caption,
								'min-w-0 flex-1 text-(--desktop-text-primary)',
								todo.completed && 'line-through text-(--desktop-text-dim)'
							)}
						>
							{todo.text}
						</span>
						<DesktopChromeTooltip
							content={t('deleteTodo')}
							placement="top"
							offsetExtra={4}
						>
							<DesktopAppButton
								type="button"
								variant="ghost"
								size="icon"
								onClick={() => deleteTodo(todo.id)}
								aria-label={t('deleteTodo')}
								className="h-8 w-8 shrink-0 text-(--desktop-text-muted) hover:text-(--desktop-text-secondary)"
							>
								<TrashIcon className="size-4" strokeWidth={2} aria-hidden />
							</DesktopAppButton>
						</DesktopChromeTooltip>
					</li>
				))}
			</ul>
			{todos.length === 0 && !isLoading && (
				<p className={DESKTOP_TYPOGRAPHY.caption}>{tw('todosEmpty')}</p>
			)}
		</div>
	);
}

export default function DesktopWidgetShelfApp({
	initialTab = 'notes',
}: DesktopWidgetShelfAppProps): React.ReactElement {
	const { t } = useTranslation('desktopUi', {
		keyPrefix: 'settingsPanel.widgetShelf',
	});
	const { t: tg } = useTranslation('desktopUi', {
		keyPrefix: 'settingsPanel.widgetShelf',
	});
	const [tab, setTab] = useState<'notes' | 'todos'>(initialTab);
	const guideLabels = useMemo(() => guideTourLabelsFromI18n(tg, 'guide'), [tg]);
	const guideSteps = useBuiltGuideSteps(
		tg,
		'guide.steps',
		WIDGET_SHELF_GUIDE_STEP_DEFS
	);
	const [guideOpen, setGuideOpen] = useState(false);
	const openGuideTour = useCallback(() => setGuideOpen(true), []);
	useDesktopGuideTourOpener(openGuideTour);
	const prepareGuideStep = useCallback((stepId: string) => {
		if (stepId === 'notes-pane' || stepId === 'local-hint') setTab('notes');
		if (stepId === 'todos-pane') setTab('todos');
	}, []);

	return (
		<DesktopAppContentWrapper
			appComponent="DesktopWidgetShelfApp"
			id={WIDGET_SHELF_GUIDE_ROOT_ID}
			mode="passthrough"
			className="relative h-full min-h-0 overflow-hidden"
		>
			<DesktopAppSurface className="flex h-full min-h-0 flex-col p-4">
				<DesktopProductWorkspace
					data-testid="widget-shelf-product-workspace"
					className="min-h-0 flex-1"
					toolbar={
						<div
							data-widget-shelf-guide="tabs"
							role="tablist"
							aria-label={t('tablistAria')}
							className="mb-3 flex shrink-0 gap-2"
						>
							<DesktopChromeTooltip
								content={t('tabNotes')}
								placement="bottom"
								offsetExtra={4}
							>
								<DesktopAppButton
									type="button"
									role="tab"
									variant={tab === 'notes' ? 'neutral' : 'ghost'}
									size="sm"
									aria-selected={tab === 'notes'}
									onClick={() => setTab('notes')}
								>
									{t('tabNotes')}
								</DesktopAppButton>
							</DesktopChromeTooltip>
							<DesktopChromeTooltip
								content={t('tabTodos')}
								placement="bottom"
								offsetExtra={4}
							>
								<DesktopAppButton
									type="button"
									role="tab"
									variant={tab === 'todos' ? 'neutral' : 'ghost'}
									size="sm"
									aria-selected={tab === 'todos'}
									onClick={() => setTab('todos')}
								>
									{t('tabTodos')}
								</DesktopAppButton>
							</DesktopChromeTooltip>
						</div>
					}
					contentClassName="overflow-hidden !overflow-y-hidden flex min-h-0 flex-col"
				>
					{tab === 'notes' ? <NotesPane /> : <TodosPane />}
				</DesktopProductWorkspace>
			</DesktopAppSurface>
			<SpotlightGuideModal
				open={guideOpen}
				onClose={() => setGuideOpen(false)}
				rootId={WIDGET_SHELF_GUIDE_ROOT_ID}
				steps={guideSteps}
				audioLocalStorageKey={WIDGET_SHELF_GUIDE_AUDIO_LS_KEY}
				tourAudioFolder={WIDGET_SHELF_GUIDE_TOUR_FOLDER}
				labels={guideLabels}
				onPrepareStep={prepareGuideStep}
				spotlightLayoutKey={`${tab}-${guideOpen}`}
				dialogTitleId="widget-shelf-guide-title"
			/>
		</DesktopAppContentWrapper>
	);
}
