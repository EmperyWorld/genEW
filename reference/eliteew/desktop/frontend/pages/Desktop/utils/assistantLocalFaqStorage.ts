/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Session-scoped persist локальных FAQ-пар «Показать в чате» (без LLM) в Справочнике.
 *
 * Invariants:
 * - Только sessionStorage; не смешивать с server-side assistant_chat_messages.
 *
 * Related:
 * - pages/Desktop/components/AssistantApp.tsx
 */

import type { AssistantChatMessage } from '../services/productDesktopApi';

const STORAGE_KEY = 'eliteew.assistant.localFaq.v1';

export function readAssistantLocalFaqMessages(): AssistantChatMessage[] {
	if (typeof sessionStorage === 'undefined') return [];
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(m): m is AssistantChatMessage =>
				typeof m === 'object' &&
				m !== null &&
				typeof (m as AssistantChatMessage).id === 'string' &&
				((m as AssistantChatMessage).role === 'user' ||
					(m as AssistantChatMessage).role === 'assistant') &&
				typeof (m as AssistantChatMessage).content === 'string' &&
				typeof (m as AssistantChatMessage).created_at === 'string'
		);
	} catch {
		return [];
	}
}

export function writeAssistantLocalFaqMessages(
	messages: AssistantChatMessage[]
): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		if (messages.length === 0) {
			sessionStorage.removeItem(STORAGE_KEY);
			return;
		}
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
	} catch {
		// quota / private mode — ignore
	}
}

export function formatAssistantConversationForCopy(
	messages: AssistantChatMessage[]
): string {
	return messages
		.map((m) => {
			const label = m.role === 'user' ? 'Вы' : 'Справочник';
			return `${label}:\n${m.content.trim()}`;
		})
		.filter((block) => block.length > 0)
		.join('\n\n---\n\n');
}
