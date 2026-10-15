/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Renders companion chat lines (user + assistant) as **GitHub-flavored Markdown** so model output with `###`, `**`, lists,
 * and fences displays correctly in `EwaCompanionChatPanel` without stripping markup on the backend.
 *
 * Invariants:
 * - Output passes `rehype-sanitize` (no raw HTML injection); links limited to `http`/`https` in `components.a`.
 * - Images are not loaded as remote assets — placeholder text only (same guard pattern as marketing IMC markdown).
 * - `density="longread"` uses comfortable body scale for copy-ready social posts — not shorter content.
 * - GFM tables are boundary-repaired before parse so runaway rows do not swallow following prose.
 *
 * Related:
 * - src/features/ewa/EwaCompanionChatPanel.tsx
 * - src/features/ewa/companionLongreadReplyUi.ts
 * - src/features/ewa/companionChatMarkdownNormalize.ts
 */
import { normalizeCompanionChatMarkdown } from '@/features/ewa/companionChatMarkdownNormalize';
import { cn } from '@/utils/cn';
import { sanitizeMarkdownHref } from '@/utils/markdownSecurity';
import remarkBreaks from 'remark-breaks';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

const PROSE_TABLE =
	'prose-table:my-0 prose-table:w-full prose-table:table-fixed prose-table:border-collapse prose-table:text-[12px] ' +
	'prose-th:border prose-th:border-(--companion-divider) prose-th:bg-(--companion-bg)/80 prose-th:px-2.5 prose-th:py-1.5 prose-th:text-left prose-th:font-semibold prose-th:align-top prose-th:break-words prose-th:[overflow-wrap:anywhere] ' +
	'prose-td:border prose-td:border-(--companion-divider)/80 prose-td:px-2.5 prose-td:py-1.5 prose-td:align-top prose-td:break-words prose-td:[overflow-wrap:anywhere] ' +
	'[&_tbody_tr:nth-child(even)]:bg-white/[0.03]';

const PROSE_COMPANION_DEFAULT =
	cn(
		'prose prose-sm max-w-none min-w-0 leading-relaxed break-words [word-break:break-word]',
		'text-[13px] text-(--desktop-text-primary)'
	) +
	' ' +
	'prose-headings:scroll-mt-2 prose-headings:text-(--desktop-text-primary) prose-headings:font-semibold ' +
	'prose-h1:mb-2 prose-h1:mt-3 prose-h1:text-[1.05rem] prose-h1:first:mt-0 ' +
	'prose-h2:mb-1.5 prose-h2:mt-3 prose-h2:border-b prose-h2:border-(--companion-divider) prose-h2:pb-1.5 prose-h2:text-[1rem] prose-h2:first:mt-0 ' +
	'prose-h3:mb-1 prose-h3:mt-2.5 prose-h3:text-sm prose-h3:font-semibold prose-h3:first:mt-0 ' +
	'prose-p:my-1.5 prose-p:first:mt-0 prose-p:last:mb-0 ' +
	'prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:marker:text-(--companion-aura) ' +
	'prose-strong:text-(--desktop-text-primary) prose-strong:font-semibold ' +
	'prose-code:rounded-md prose-code:border prose-code:border-(--companion-divider) prose-code:bg-(--companion-bg) prose-code:px-1.5 prose-code:py-px prose-code:text-[0.88em] prose-code:font-normal prose-code:text-(--desktop-text-primary) prose-code:before:content-none prose-code:after:content-none ' +
	'prose-a:font-medium prose-a:text-[rgb(var(--desktop-accent-rgb)/0.95)] prose-a:underline-offset-2 ' +
	'prose-blockquote:my-2 prose-blockquote:border-l-[3px] prose-blockquote:border-(--companion-divider) prose-blockquote:pl-3 prose-blockquote:italic ' +
	'prose-hr:my-4 prose-hr:border-(--companion-divider) ' +
	'prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:rounded-md prose-pre:border prose-pre:border-(--companion-divider) prose-pre:bg-(--companion-bg) prose-pre:p-2.5 prose-pre:text-[12px] ' +
	PROSE_TABLE;

/** Longread typography — readable scale for article-style social posts; content length unchanged. */
const PROSE_COMPANION_LONGREAD =
	cn(
		'prose prose-sm max-w-none min-w-0 leading-relaxed break-words [word-break:break-word]',
		'text-[13.5px] text-(--desktop-text-primary)'
	) +
	' ' +
	'prose-headings:scroll-mt-2 prose-headings:text-(--desktop-text-primary) prose-headings:font-semibold ' +
	'prose-h1:mb-2 prose-h1:mt-3 prose-h1:text-[1.08rem] prose-h1:first:mt-0 ' +
	'prose-h2:mb-1.5 prose-h2:mt-3 prose-h2:border-b prose-h2:border-(--companion-divider)/60 prose-h2:pb-1 prose-h2:text-[1rem] prose-h2:first:mt-0 ' +
	'prose-h3:mb-1 prose-h3:mt-2.5 prose-h3:text-[0.95rem] prose-h3:font-semibold prose-h3:first:mt-0 ' +
	'prose-p:my-1.5 prose-p:first:mt-0 prose-p:last:mb-0 ' +
	'prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:marker:text-(--companion-aura) ' +
	'prose-strong:text-(--desktop-text-primary) prose-strong:font-semibold ' +
	'prose-code:rounded-md prose-code:border prose-code:border-(--companion-divider) prose-code:bg-(--companion-bg) prose-code:px-1.5 prose-code:py-px prose-code:text-[0.88em] prose-code:font-normal prose-code:text-(--desktop-text-primary) prose-code:before:content-none prose-code:after:content-none ' +
	'prose-a:font-medium prose-a:text-[rgb(var(--desktop-accent-rgb)/0.95)] prose-a:underline-offset-2 ' +
	'prose-blockquote:my-2 prose-blockquote:border-l-[3px] prose-blockquote:border-(--companion-divider) prose-blockquote:pl-3 prose-blockquote:italic ' +
	'prose-hr:my-3 prose-hr:border-(--companion-divider) ' +
	'prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:rounded-md prose-pre:border prose-pre:border-(--companion-divider) prose-pre:bg-(--companion-bg) prose-pre:p-2.5 prose-pre:text-[12px] ' +
	PROSE_TABLE;

export type EwaCompanionChatMarkdownDensity = 'default' | 'longread';

export type EwaCompanionChatMarkdownProps = {
	/** Raw assistant/user line; may include Markdown. */
	markdown: string;
	className?: string;
	/** `longread` — readable font for social_post_compose copy blocks. */
	density?: EwaCompanionChatMarkdownDensity;
};

export function EwaCompanionChatMarkdown({
	markdown,
	className,
	density = 'default',
}: EwaCompanionChatMarkdownProps) {
	const body = normalizeCompanionChatMarkdown(markdown);
	if (!body) return null;

	const proseClass =
		density === 'longread' ? PROSE_COMPANION_LONGREAD : PROSE_COMPANION_DEFAULT;

	return (
		<div className={cn(proseClass, 'min-w-0', className)}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkBreaks]}
				rehypePlugins={[rehypeSanitize]}
				components={{
					a: ({ href, children, ...rest }) => {
						const h = sanitizeMarkdownHref(href);
						if (!h) return <span {...rest}>{children}</span>;
						return (
							<a href={h} target="_blank" rel="noopener noreferrer" {...rest}>
								{children}
							</a>
						);
					},
					img: ({ alt }) => (
						<span className="text-[10px] text-(--companion-text-soft)">
							[{alt?.trim() || 'image'}]
						</span>
					),
					table: ({ children, className: tc, ...rest }) => (
						<div className="my-2 min-w-0 max-w-full overflow-x-auto rounded-md border border-(--companion-divider) bg-(--companion-bg)/50">
							<table
								{...rest}
								className={cn(
									'mb-0 w-full min-w-full table-fixed border-collapse text-[12px]',
									tc
								)}
							>
								{children}
							</table>
						</div>
					),
					thead: ({ children, className: tc, ...rest }) => (
						<thead
							{...rest}
							className={cn(
								'border-b border-(--companion-divider) bg-(--companion-bg)/80',
								tc
							)}
						>
							{children}
						</thead>
					),
					tbody: ({ children, className: tc, ...rest }) => (
						<tbody
							{...rest}
							className={cn('divide-y divide-(--companion-divider)/70', tc)}
						>
							{children}
						</tbody>
					),
					tr: ({ children, className: tc, ...rest }) => (
						<tr {...rest} className={cn('align-top', tc)}>
							{children}
						</tr>
					),
					th: ({ children, className: tc, style, ...rest }) => (
						<th
							{...rest}
							style={{ textAlign: 'left', ...style }}
							className={cn('wrap-anywhere px-2.5 py-1.5 font-semibold', tc)}
						>
							{children}
						</th>
					),
					td: ({ children, className: tc, style, ...rest }) => (
						<td
							{...rest}
							style={{ textAlign: 'left', verticalAlign: 'top', ...style }}
							className={cn('wrap-anywhere px-2.5 py-1.5', tc)}
						>
							{children}
						</td>
					),
				}}
			>
				{body}
			</ReactMarkdown>
		</div>
	);
}
