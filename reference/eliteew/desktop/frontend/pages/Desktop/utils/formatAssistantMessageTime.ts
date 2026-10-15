/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Форматирование `created_at` сообщений чата Справочника для UI-пузырей.
 *
 * Invariants:
 * - Locale передаётся вызывающим (i18n.language); invalid ISO → пустая строка.
 *
 * Related:
 * - pages/Desktop/components/AssistantApp.tsx
 */

/** Короткая метка времени: сегодня — только часы; иначе дата + время. */
export function formatAssistantMessageTime(
	iso: string,
	locale: string,
	now: Date = new Date()
): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const loc = locale.trim() || 'ru-RU';
	if (d.toDateString() === now.toDateString()) {
		return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
	}
	return d.toLocaleString(loc, {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	});
}
