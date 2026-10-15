/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Общий keyword-filter и relevance-sort FAQ для desktop Справочника и админки.
 *
 * Invariants:
 * - Стабильный порядок при равном score (исходный index).
 *
 * Related:
 * - pages/Desktop/components/AssistantApp.tsx
 * - pages/Admin/assistant/AssistantFaqPanel.tsx
 */
import type { AssistantFaqEntry } from '../services/productDesktopApi';

/** Число совпадающих токенов запроса с парой FAQ (простой boost). */
export function faqEntryScore(
	query: string,
	question: string,
	answer: string
): number {
	const q = query.trim().toLowerCase();
	if (!q) return 0;
	const tokens = q.split(/\s+/).filter((t) => t.length >= 3);
	const hay = `${question} ${answer}`.toLowerCase();
	let score = 0;
	for (const token of tokens) {
		if (hay.includes(token)) score += 1;
	}
	if (question.toLowerCase().includes(q)) score += 3;
	if (answer.toLowerCase().includes(q)) score += 1;
	return score;
}

/** Отфильтровать и отсортировать FAQ по релевантности запросу. */
export function filterFaqEntries(
	faq: AssistantFaqEntry[],
	query: string
): AssistantFaqEntry[] {
	const q = query.trim().toLowerCase();
	if (!q) return faq;
	const scored = faq
		.map((f, idx) => ({
			f,
			idx,
			score: faqEntryScore(q, f.question, f.answer),
		}))
		.filter(
			(row) =>
				row.score > 0 ||
				row.f.question.toLowerCase().includes(q) ||
				row.f.answer.toLowerCase().includes(q)
		);
	scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
	return scored.map((row) => row.f);
}
