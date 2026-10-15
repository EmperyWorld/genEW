/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Подсветка совпадений поискового запроса в тексте FAQ боковой панели Справочника.
 *
 * Invariants:
 * - Без HTML-injection: только разбиение строки и `<mark>` по токенам запроса (≥2 символа).
 *
 * Related:
 * - pages/Desktop/components/AssistantApp.tsx
 */
import * as React from 'react';
import { cn } from '@/utils/cn';

export type FaqHighlightSegment = { text: string; highlight: boolean };

/** Разбить текст на сегменты с флагом подсветки (case-insensitive, токены ≥2 символов). */
export function splitFaqHighlightSegments(
	text: string,
	query: string
): FaqHighlightSegment[] {
	const q = query.trim();
	if (!q) return [{ text, highlight: false }];
	const tokens = [
		...new Set(
			q
				.toLowerCase()
				.split(/\s+/)
				.filter((t) => t.length >= 2)
		),
	];
	if (tokens.length === 0) return [{ text, highlight: false }];

	let segments: FaqHighlightSegment[] = [{ text, highlight: false }];
	for (const token of tokens) {
		const next: FaqHighlightSegment[] = [];
		for (const seg of segments) {
			if (seg.highlight) {
				next.push(seg);
				continue;
			}
			const lower = seg.text.toLowerCase();
			const tLower = token.toLowerCase();
			let idx = 0;
			while (idx < seg.text.length) {
				const found = lower.indexOf(tLower, idx);
				if (found < 0) {
					next.push({ text: seg.text.slice(idx), highlight: false });
					break;
				}
				if (found > idx) {
					next.push({ text: seg.text.slice(idx, found), highlight: false });
				}
				next.push({
					text: seg.text.slice(found, found + token.length),
					highlight: true,
				});
				idx = found + token.length;
			}
		}
		segments = next.length > 0 ? next : segments;
	}
	return segments;
}

type FaqHighlightTextProps = {
	text: string;
	query: string;
	className?: string;
};

/** Inline-подсветка совпадений в FAQ (вопрос / короткий фрагмент ответа). */
export function FaqHighlightText({
	text,
	query,
	className,
}: FaqHighlightTextProps): React.ReactElement {
	const segments = React.useMemo(
		() => splitFaqHighlightSegments(text, query),
		[text, query]
	);
	return (
		<span className={className}>
			{(() => {
				let offset = 0;
				return segments.map((seg) => {
					const key = `${offset}-${seg.highlight ? 'h' : 'n'}-${seg.text.length}`;
					offset += seg.text.length;
					return seg.highlight ? (
						<mark
							key={key}
							className={cn(
								'rounded-sm px-0.5',
								'bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb))_24%,transparent)]',
								'text-inherit'
							)}
						>
							{seg.text}
						</mark>
					) : (
						<React.Fragment key={key}>{seg.text}</React.Fragment>
					);
				});
			})()}
		</span>
	);
}
