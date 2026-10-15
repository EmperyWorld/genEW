/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Экспорт переписки Справочника в markdown-файл (дополнение к копированию в буфер).
 *
 * Invariants:
 * - Только client-side Blob; без отправки на сервер.
 *
 * Related:
 * - pages/Desktop/utils/assistantLocalFaqStorage.ts
 * - pages/Desktop/components/AssistantApp.tsx
 */
import type { AssistantChatMessage } from '../services/productDesktopApi';
import { formatAssistantConversationForCopy } from './assistantLocalFaqStorage';

/** Скачать переписку как `.md` в браузере. */
export function downloadAssistantConversationMarkdown(
	messages: AssistantChatMessage[],
	filenameBase = 'spravochnik-chat'
): boolean {
	if (messages.length === 0 || typeof document === 'undefined') return false;
	const body = formatAssistantConversationForCopy(messages);
	const stamp = new Date().toISOString().slice(0, 10);
	const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = `${filenameBase}-${stamp}.md`;
	anchor.rel = 'noopener';
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
	return true;
}
