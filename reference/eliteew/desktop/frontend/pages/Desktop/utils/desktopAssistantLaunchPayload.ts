/**
 * Builds {@link WindowInitialPayload} for Desktop AI Chat / GAF from expansion actions
 * and window context (vol. 7 — contextual assistant layer).
 */

import type { TFunction } from 'i18next';

import type {
	DesktopItem,
	WindowInitialPayload,
	WindowState,
} from '../types/desktop.types';

export type DesktopAssistantLaunchT = TFunction<'desktopUi'>;

export interface BuildAssistantLaunchFromExpansionArgs {
	actionId: string;
	assistantTarget: 'assistant' | 'gaf';
	selectedItems: DesktopItem[];
	activeWindow: WindowState | null | undefined;
	t: DesktopAssistantLaunchT;
	/** Панель свойств и др.: учитывать выбранный элемент даже внутри папки (не только корень стола). */
	allowAnyDesktopLocation?: boolean;
}

/** Окна, для которых пункты «контекст Assistant» в меню окна не показываем (избегаем рекурсии). */
export function isAssistantWindowContextSupported(
	win: WindowState | undefined
): boolean {
	if (win?.type !== 'app' || !win.appComponent) return false;
	const c = win.appComponent;
	return c !== 'GAFChatApp' && c !== 'DesktopAiChatApp' && c !== 'AssistantApp';
}

function buildGafPayloadFromFiles(files: DesktopItem[]): WindowInitialPayload {
	if (files.length === 0) {
		return {};
	}
	const first = files[0];
	return {
		gafComposerAttachmentContentId: first.id?.trim(),
		gafComposerAttachmentFileName: first.name,
		gafComposerAttachmentMimeType: first.fileType ?? null,
		gafComposerAttachmentSize:
			typeof first.size === 'number' ? first.size : null,
	};
}

function summarizeWindowPayload(
	win: WindowState,
	t: DesktopAssistantLaunchT
): WindowInitialPayload {
	const p = win.initialPayload ?? {};
	const ctx = p.assistantSurfaceContext;
	if (ctx?.label?.trim()) {
		const payload: WindowInitialPayload = {
			desktopAiComposerSeed: t('assistantLaunch.summarizeSurface', {
				title: ctx.label.trim(),
				detail: ctx.detail?.trim() ?? '',
			}),
		};
		const u = ctx.unifiedContentIds?.map((x) => x?.trim()).find(Boolean);
		if (u) {
			payload.desktopAiAttachContentId = u;
			payload.desktopAiAttachSourceLabel = ctx.label.trim();
		}
		return payload;
	}
	const bits: string[] = [];
	if (p.unifiedContentId?.trim())
		bits.push(t('assistantLaunch.ctxUnifiedContent'));
	if (p.documentId?.trim()) bits.push(t('assistantLaunch.ctxDocument'));
	if (p.contentManagerProjectId?.trim())
		bits.push(t('assistantLaunch.ctxProject'));
	const attachId =
		p.unifiedContentId?.trim() ||
		p.contentManagerFocusUnifiedContentId?.trim() ||
		undefined;
	const seed = t('assistantLaunch.summarizeWindow', {
		windowTitle: win.title,
		contextHint:
			bits.length > 0 ? bits.join(', ') : t('assistantLaunch.ctxGeneric'),
	});
	const out: WindowInitialPayload = { desktopAiComposerSeed: seed };
	if (attachId) {
		out.desktopAiAttachContentId = attachId;
		out.desktopAiAttachSourceLabel = win.title;
	}
	return out;
}

/**
 * Единая точка для кнопок expansion / Пуск и (частично) меню окна.
 */
export function buildAssistantLaunchFromExpansionAction(
	args: BuildAssistantLaunchFromExpansionArgs
): { target: 'assistant' | 'gaf'; payload: WindowInitialPayload } {
	const {
		actionId,
		assistantTarget,
		selectedItems,
		activeWindow,
		t,
		allowAnyDesktopLocation = false,
	} = args;
	const scoped = allowAnyDesktopLocation
		? selectedItems
		: selectedItems.filter((i) => !i.parentId);
	const files = scoped.filter((i) => i.type === 'file');

	if (actionId === 'explain-selection') {
		const payload: WindowInitialPayload = {};
		if (files.length > 0) {
			const first = files[0];
			payload.desktopAiAttachContentId = first.id?.trim();
			payload.desktopAiAttachSourceLabel = first.name ?? null;
			payload.desktopAiComposerSeed = t('assistantLaunch.explainAttachedFile');
		} else if (scoped.length > 0) {
			payload.desktopAiComposerSeed = t(
				'assistantLaunch.explainSelectionList',
				{
					names: scoped.map((i) => i.name).join(', '),
				}
			);
		} else {
			payload.desktopAiComposerSeed = t(
				'assistantLaunch.explainNothingSelected'
			);
		}
		return { target: 'assistant', payload };
	}

	if (actionId === 'summarize-window') {
		if (activeWindow && activeWindow.type === 'app') {
			return {
				target: 'assistant',
				payload: summarizeWindowPayload(activeWindow, t),
			};
		}
		return {
			target: 'assistant',
			payload: {
				desktopAiComposerSeed: t('assistantLaunch.summarizeNoWindow'),
			},
		};
	}

	if (actionId === 'create-task') {
		const payload: WindowInitialPayload = {
			desktopAiComposerSeed: t('assistantLaunch.createTaskSeed'),
		};
		if (files.length > 0) {
			const f = files[0];
			payload.desktopAiAttachContentId = f.id?.trim();
			payload.desktopAiAttachSourceLabel = f.name ?? null;
		}
		return { target: 'assistant', payload };
	}

	if (actionId === 'send-to-gaf') {
		return {
			target: 'gaf',
			payload: buildGafPayloadFromFiles(files),
		};
	}

	return {
		target: assistantTarget,
		payload: {},
	};
}

/** Пункты меню окна: краткое резюме в Assistant (как summarize-window). */
export function buildWindowContextSummarizePayload(
	win: WindowState,
	t: DesktopAssistantLaunchT
): WindowInitialPayload {
	return summarizeWindowPayload(win, t);
}

/**
 * Вложение в композер GAF из контекста окна (если есть unified id в payload).
 */
export function buildWindowContextGafAttachmentPayload(
	win: WindowState
): WindowInitialPayload {
	const p = win.initialPayload ?? {};
	const id =
		p.unifiedContentId?.trim() ||
		p.contentManagerFocusUnifiedContentId?.trim() ||
		p.assistantSurfaceContext?.unifiedContentIds
			?.map((x) => x?.trim())
			.find(Boolean);
	if (!id) {
		return {};
	}
	return {
		gafComposerAttachmentContentId: id,
		gafComposerAttachmentFileName: win.title,
		gafComposerAttachmentMimeType: null,
		gafComposerAttachmentSize: null,
	};
}

/**
 * Полный payload открытия GAF из контекста окна: вложение (если есть unified id) +
 * черновик при контексте проекта в Content Manager.
 */
export function buildWindowContextGafOpenPayload(
	win: WindowState,
	t: DesktopAssistantLaunchT
): WindowInitialPayload {
	const attach = buildWindowContextGafAttachmentPayload(win);
	const p = win.initialPayload ?? {};
	const projectName = p.contentManagerProjectName?.trim();
	const projectId = p.contentManagerProjectId?.trim();
	let gafComposerSeed: string | undefined;
	if (projectName || projectId) {
		gafComposerSeed = t('assistantLaunch.gafProjectThreadHint', {
			name: projectName || projectId || '',
		});
	}
	return {
		...attach,
		...(gafComposerSeed ? { gafComposerSeed } : {}),
	};
}
