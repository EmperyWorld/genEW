/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Фильтрация списка KB-документов справочника в админке (title, filename, status).
 *
 * Invariants:
 * - Пустой query не отсекает документы (только statusFilter применяется).
 *
 * Related:
 * - pages/Admin/assistant/AssistantKbPanel.tsx
 */
export type AssistantKbDocumentFilterFields = {
	title: string;
	status: string;
	source_filename?: string | null;
	last_error?: string | null;
};

/** Отфильтровать KB-документы по тексту и опциональному status. */
export function filterKbDocuments<T extends AssistantKbDocumentFilterFields>(
	docs: T[],
	query: string,
	statusFilter: string | null = null
): T[] {
	let out = docs;
	if (statusFilter) {
		out = out.filter((d) => d.status === statusFilter);
	}
	const q = query.trim().toLowerCase();
	if (!q) return out;
	return out.filter(
		(d) =>
			d.title.toLowerCase().includes(q) ||
			d.status.toLowerCase().includes(q) ||
			(d.source_filename?.toLowerCase().includes(q) ?? false) ||
			(d.last_error?.toLowerCase().includes(q) ?? false)
	);
}

/** Сортировка KB по updated_at (новые сверху). */
export function sortKbDocumentsByUpdatedDesc<T extends { updated_at: string }>(
	docs: T[]
): T[] {
	return [...docs].sort(
		(a, b) =>
			new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
	);
}

/** Показывать строку «обновлено», если updated_at отличается от created_at. */
export function kbDocumentShowUpdatedAt(doc: {
	created_at: string;
	updated_at: string;
}): boolean {
	return doc.updated_at !== doc.created_at;
}

/** Уникальные status из списка (stable order). */
export function kbDocumentStatusOptions(
	docs: AssistantKbDocumentFilterFields[]
): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const d of docs) {
		const st = d.status.trim();
		if (!st || seen.has(st)) continue;
		seen.add(st);
		out.push(st);
	}
	return out;
}
