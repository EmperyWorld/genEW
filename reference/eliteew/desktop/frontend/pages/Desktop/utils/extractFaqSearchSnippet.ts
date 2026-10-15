/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Извлечение короткого фрагмента FAQ-ответа для превью при поиске (зеркало Python keyword-snippet).
 *
 * Invariants:
 * - Токены запроса ≥3 символов (как `_faq_match_tokens` на бэке).
 *
 * Related:
 * - api/services/product_assistant_prompt_helpers.py
 * - pages/Desktop/components/AssistantApp.tsx
 */

/** Токены для match (≥3 символов, lower). */
export function faqMatchTokens(query: string): string[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	return [...new Set(q.split(/\s+/).filter((t) => t.length >= 3))];
}

/** Упростить markdown до plain text для snippet-превью. */
export function stripMarkdownForSnippet(markdown: string): string {
	return markdown
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/[*_~>|/-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Фрагмент текста с максимальным пересечением токенов запроса.
 * Зеркало `extract_keyword_snippet` (Python).
 */
export function extractFaqSearchSnippet(
	body: string,
	query: string,
	maxLen = 220
): string {
	const text = (body ?? '').trim();
	if (!text) return '';
	if (text.length <= maxLen) return text;
	const tokens = faqMatchTokens(query);
	if (tokens.length === 0) return `${text.slice(0, maxLen - 1)}…`;
	const paragraphs = text
		.split(/\n\n+/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
	if (paragraphs.length === 0) return `${text.slice(0, maxLen - 1)}…`;
	let best = paragraphs[0];
	let bestScore = -1;
	for (const p of paragraphs) {
		const lower = p.toLowerCase();
		const score = tokens.reduce((n, t) => (lower.includes(t) ? n + 1 : n), 0);
		if (score > bestScore) {
			bestScore = score;
			best = p;
		}
	}
	if (best.length <= maxLen) return best;
	return `${best.slice(0, maxLen - 1)}…`;
}

/** Plain snippet из markdown-ответа FAQ для боковой панели. */
export function faqAnswerSearchPreview(
	answerMarkdown: string,
	query: string
): string {
	const plain = stripMarkdownForSnippet(answerMarkdown);
	if (!plain) return '';
	return extractFaqSearchSnippet(plain, query);
}

/** Есть ли совпадение токенов в plain-тексте ответа. */
export function faqAnswerMatchesQuery(
	answerMarkdown: string,
	query: string
): boolean {
	const tokens = faqMatchTokens(query);
	if (tokens.length === 0) return false;
	const hay = stripMarkdownForSnippet(answerMarkdown).toLowerCase();
	return tokens.some((t) => hay.includes(t));
}
