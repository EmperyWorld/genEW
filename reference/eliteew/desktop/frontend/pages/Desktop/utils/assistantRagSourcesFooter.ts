/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Клиентский футер «Источники справочника» — зеркало `format_assistant_rag_sources_footer` (Python).
 *
 * Invariants:
 * - Логика совпадает с `product_assistant_prompt_helpers.py` для плавного стрима без «snap» в конце.
 *
 * Related:
 * - api/services/product_assistant_prompt_helpers.py
 * - pages/Desktop/components/AssistantApp.tsx
 */

/** Уникальные непустые заголовки KB (порядок сохраняется). */
export function collectRagSourceLabels(
	sourceLabels: Array<string | null | undefined>
): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const raw of sourceLabels) {
		const label = (raw ?? '').trim();
		if (!label) continue;
		const key = label.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(label);
	}
	return out;
}

/** Markdown-футер с перечнем документов KB (до 5 названий). */
export function formatAssistantRagSourcesFooter(
	sourceLabels: string[]
): string {
	const labels = collectRagSourceLabels(sourceLabels);
	if (labels.length === 0) return '';
	const shown = labels.slice(0, 5);
	const parts = shown.map((label) => `«${label}»`).join('; ');
	const suffix =
		labels.length > shown.length
			? ` (+${labels.length - shown.length} ещё)`
			: '';
	return `\n\n---\n*Источники справочника:* ${parts}${suffix}`;
}

/** Дописать источники, если модель не указала их и RAG дал фрагменты. */
export function maybeAppendRagSourcesFooter(
	reply: string,
	sourceLabels: string[]
): string {
	const text = (reply ?? '').trim();
	if (!text || sourceLabels.length === 0) return reply;
	const lower = text.toLowerCase();
	if (lower.includes('источник') || lower.includes('источники справочника')) {
		return reply;
	}
	const footer = formatAssistantRagSourcesFooter(sourceLabels);
	return footer ? `${text}${footer}` : reply;
}
