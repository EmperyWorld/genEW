/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Черновик текста для «Обращений» из контекста чата «Справочника».
 *
 * Invariants:
 * - Без PII; только вопрос/ответ пользователя из UI справочника.
 *
 * Related:
 * - pages/Desktop/components/AssistantApp.tsx
 * - pages/Desktop/components/FeedbackHubApp.tsx
 */

/** Собрать черновик пожелания для FeedbackHub из пары вопрос–ответ. */
export function buildAssistantFeedbackDraft(
	userQuestion: string,
	assistantAnswer: string
): string {
	const q = userQuestion.trim();
	const a = assistantAnswer.trim().slice(0, 2500);
	const lines = [
		'Контекст из приложения «Справочник» на рабочем столе.',
		'',
		'Мой вопрос:',
		q || '—',
		'',
		'Ответ помощника:',
		a || '—',
		'',
		'Что мне нужно (опишите подробнее):',
		'',
	];
	return lines.join('\n');
}
