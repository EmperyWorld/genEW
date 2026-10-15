/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Markdown-тело ответов Справочника (GFM, sanitize, deep links, копирование code blocks, подсветка FAQ-поиска).
 *
 * Invariants:
 * - External anchors use shared sanitizeMarkdownHref; desktop open-app via parseAssistantDesktopAppHref.
 *
 * Related:
 * - pages/Desktop/components/AssistantApp.tsx
 * - DesktopChromeTooltip.tsx
 * - src/utils/markdownSecurity.ts
 */
import { cn } from '@/utils/cn';
import { safeCopyToClipboard } from '@/utils/clipboard';
import { sanitizeMarkdownHref } from '@/utils/markdownSecurity';
import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';

import { DESKTOP_TYPOGRAPHY } from '@/pages/Desktop/constants';
import { DesktopChromeTooltip } from '@/pages/Desktop/components/DesktopChromeTooltip';
import { DesktopAppButton } from '@/pages/Desktop/components/DesktopAppChrome';
import { parseAssistantDesktopAppHref } from '@/pages/Desktop/utils/assistantDesktopLinkComponents';
import { highlightProductAssistantCode } from '@/pages/Desktop/utils/productAssistantCodeHighlight';
import { highlightMarkdownChildren } from '@/pages/Desktop/utils/assistantMarkdownHighlight';
import {
	type DesktopShellSettingsTab,
	requestOpenDesktopApp,
	requestOpenDesktopShellSettings,
	requestOpenStartMenu,
} from '@/pages/Desktop/utils/desktopDeepLink';

import 'prismjs/themes/prism-tomorrow.min.css';

const SHELL_SETTINGS_TAB_OK = new Set<string>([
	'personalize',
	'icons',
	'chrome',
	'shell',
	'performance',
]);

const MARKDOWN_ROOT = cn(
	'selection:bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb))_20%,transparent)]'
);

const PROSE_ASSISTANT = cn(
	'prose prose-sm max-w-none min-w-0 leading-[1.72] break-words [word-break:break-word]',
	DESKTOP_TYPOGRAPHY.body,
	'text-(--desktop-text-secondary)',
	'prose-headings:scroll-mt-2 prose-headings:text-(--desktop-text-primary) prose-headings:font-semibold',
	'prose-h1:mb-2.5 prose-h1:mt-5 prose-h1:text-[1.125rem] prose-h1:font-semibold prose-h1:tracking-tight prose-h1:first:mt-0',
	'prose-h2:mb-2 prose-h2:mt-5 prose-h2:text-[1.05rem] prose-h2:font-semibold prose-h2:tracking-tight prose-h2:border-b prose-h2:border-(--desktop-border-subtle) prose-h2:pb-2 prose-h2:first:mt-0',
	'prose-h3:mb-2 prose-h3:mt-4 prose-h3:text-sm prose-h3:font-semibold prose-h3:tracking-tight prose-h3:text-(--desktop-text-primary) prose-h3:first:mt-0',
	'prose-p:my-2.5 prose-p:first:mt-0 prose-p:last:mb-0 prose-p:text-(--desktop-text-secondary)',
	'prose-ul:my-3 prose-ul:space-y-1 prose-ol:my-3 prose-ol:space-y-1',
	'prose-li:my-0 prose-li:pl-0.5 prose-li:leading-relaxed prose-li:text-(--desktop-text-secondary)',
	'prose-li:marker:text-[rgb(var(--desktop-accent-rgb)/0.72)]',
	'prose-ol:[&_li]:marker:font-semibold prose-ol:[&_li]:marker:text-[rgb(var(--desktop-accent-rgb)/0.55)]',
	'prose-strong:text-(--desktop-text-primary) prose-strong:font-semibold',
	'prose-code:rounded-md prose-code:border prose-code:border-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.14)_100%,transparent)] prose-code:bg-[color-mix(in_srgb,var(--desktop-surface-soft)_55%,rgb(var(--desktop-bg-primary-rgb))_45%)] prose-code:px-1.5 prose-code:py-px prose-code:text-[0.88em] prose-code:font-normal prose-code:text-(--desktop-text-primary) prose-code:before:content-none prose-code:after:content-none',
	'prose-a:font-medium prose-a:text-[rgb(var(--desktop-accent-rgb)/0.95)] prose-a:underline-offset-[3px] prose-a:decoration-[rgb(var(--desktop-accent-rgb)/0.42)] prose-a:decoration-2 prose-a:transition-colors',
	'hover:prose-a:text-[rgb(var(--desktop-accent-rgb))] hover:prose-a:decoration-[rgb(var(--desktop-accent-rgb)/0.7)]',
	'prose-blockquote:my-3 prose-blockquote:border-l-[3px] prose-blockquote:border-[rgb(var(--desktop-accent-rgb)/0.5)] prose-blockquote:bg-[color-mix(in_srgb,var(--desktop-surface-soft)_42%,rgb(var(--desktop-bg-primary-rgb))_58%)] prose-blockquote:py-2.5 prose-blockquote:pl-4 prose-blockquote:pr-3 prose-blockquote:rounded-r-[calc(var(--desktop-radius)_-_2px)] prose-blockquote:not-italic prose-blockquote:text-(--desktop-text-secondary) prose-blockquote:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]',
	'prose-hr:my-6 prose-hr:border-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.14)_100%,transparent)]',
	'prose-table:my-0 prose-table:w-full prose-table:border-collapse prose-table:text-[0.8125rem]',
	'prose-th:border prose-th:border-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.14)_100%,transparent)] prose-th:bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.07)_100%,transparent)] prose-th:px-2.5 prose-th:py-1.5 prose-th:text-left prose-th:font-semibold prose-th:text-(--desktop-text-primary)',
	'prose-td:border prose-td:border-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.1)_100%,transparent)] prose-td:px-2.5 prose-td:py-1.5 prose-td:text-(--desktop-text-secondary)',
	'[&_tbody_tr:nth-child(even)]:bg-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.04)_100%,transparent)]'
);

const INLINE_CODE = cn(
	'rounded-md border border-[color-mix(in_srgb,rgb(var(--desktop-fg-primary-rgb)/0.14)_100%,transparent)]',
	'bg-[color-mix(in_srgb,var(--desktop-surface-soft)_55%,rgb(var(--desktop-bg-primary-rgb))_45%)]',
	'px-1.5 py-px text-[0.88em] font-normal text-(--desktop-text-primary)'
);

const LINK_SAFE = cn(
	'rounded-sm px-0.5 -mx-0.5',
	'underline decoration-2 underline-offset-[3px]',
	'text-[rgb(var(--desktop-accent-rgb)/0.95)] decoration-[rgb(var(--desktop-accent-rgb)/0.42)]',
	'transition-colors duration-150',
	'hover:bg-[color-mix(in_srgb,rgb(var(--desktop-accent-rgb))_12%,transparent)]',
	'hover:text-[rgb(var(--desktop-accent-rgb))] hover:decoration-[rgb(var(--desktop-accent-rgb)/0.72)]',
	'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color-mix(in_srgb,var(--desktop-surface-soft)_90%,transparent)]'
);

/** Расширение GitHub-подобной схемы sanitize: разрешить кастомный протокол для in-app ссылок. */
const productAssistantSanitizeSchema: typeof defaultSchema = {
	...defaultSchema,
	protocols: {
		...defaultSchema.protocols,
		href: [...(defaultSchema.protocols?.href ?? []), 'eliteew-desktop'],
	},
};

function languageBarLabel(raw: string | undefined): string | null {
	if (!raw?.trim()) return null;
	return raw.trim();
}

function FencedCodeBlock({
	className,
	raw,
}: {
	className?: string;
	raw: string;
}): React.ReactElement {
	const { t } = useTranslation('desktopUi', { keyPrefix: 'assistant' });
	const code = raw.replace(/\n$/, '');
	const langMatch = /language-([\w-]+)/.exec(className ?? '');
	const rawLang = langMatch?.[1];
	const barLabel = languageBarLabel(rawLang);
	const html = highlightProductAssistantCode(code, rawLang);
	const langSlug =
		rawLang?.trim() && /^[\w+-]+$/.test(rawLang.trim())
			? rawLang.trim().toLowerCase()
			: undefined;

	const copyCode = async () => {
		const copied = await safeCopyToClipboard(code);
		if (copied) {
			toast.success(t('copyMessageDone'));
		} else {
			toast.error(t('toastError'));
		}
	};

	return (
		<div
			className={cn(
				'my-3 max-h-[min(28rem,55vh)] overflow-auto rounded-(--desktop-radius)',
				'border border-(--desktop-border-subtle)',
				'bg-[linear-gradient(180deg,rgba(2,6,23,0.98)_0%,rgba(15,23,42,0.96)_100%)]',
				'shadow-[0_1px_0_0_rgba(255,255,255,0.05),inset_0_1px_0_0_rgba(255,255,255,0.04)]'
			)}
		>
			<div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/25 px-2.5 py-1">
				{barLabel ? (
					<DesktopChromeTooltip
						content={barLabel}
						placement="top"
						offsetExtra={4}
					>
						<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
							{barLabel}
						</span>
					</DesktopChromeTooltip>
				) : (
					<span />
				)}
				<DesktopChromeTooltip
					content={t('copyCode')}
					placement="top"
					offsetExtra={4}
				>
					<button
						type="button"
						onClick={() => void copyCode()}
						className={cn(
							'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]',
							'text-slate-400 hover:bg-white/10 hover:text-slate-200',
							'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--desktop-accent-rgb)/0.45)]'
						)}
					>
						<ClipboardDocumentIcon className="h-3.5 w-3.5" aria-hidden />
						{t('copyCode')}
					</button>
				</DesktopChromeTooltip>
			</div>
			<pre className="m-0 bg-transparent p-0">
				{/* Prism добавляет token span; исходный текст — из fenced block markdown */}
				<code
					className={cn(
						langSlug ? `language-${langSlug}` : undefined,
						'block p-3.5 text-[13px] leading-relaxed'
					)}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: Prism.highlight, fallback — escapeHtml
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			</pre>
		</div>
	);
}

export function ProductAssistantMarkdown({
	content,
	className,
	remarkPluginsExtra,
	searchHighlightQuery,
}: {
	content: string;
	className?: string;
	/** Extra remark plugins after `remark-gfm` (e.g. `remark-breaks` for single newlines). */
	remarkPluginsExtra?: NonNullable<
		React.ComponentProps<typeof ReactMarkdown>['remarkPlugins']
	>;
	/** Подсветка совпадений поиска в plain-text узлах markdown (FAQ sidebar). */
	searchHighlightQuery?: string;
}): React.ReactElement | null {
	const trimmed = content.trim();
	if (!trimmed) {
		return null;
	}
	const hlQuery = searchHighlightQuery?.trim() ?? '';

	return (
		<div className={cn(MARKDOWN_ROOT, PROSE_ASSISTANT, className)}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, ...(remarkPluginsExtra ?? [])]}
				rehypePlugins={[[rehypeSanitize, productAssistantSanitizeSchema]]}
				components={{
					p: ({ children, ...rest }) => (
						<p {...rest}>{highlightMarkdownChildren(children, hlQuery)}</p>
					),
					li: ({ children, ...rest }) => (
						<li {...rest}>{highlightMarkdownChildren(children, hlQuery)}</li>
					),
					blockquote: ({ children, ...rest }) => (
						<blockquote {...rest}>
							{highlightMarkdownChildren(children, hlQuery)}
						</blockquote>
					),
					td: ({ children, ...rest }) => (
						<td {...rest}>{highlightMarkdownChildren(children, hlQuery)}</td>
					),
					th: ({ children, ...rest }) => (
						<th {...rest}>{highlightMarkdownChildren(children, hlQuery)}</th>
					),
					a: ({
						href,
						children,
						node: _node,
						className: mdClassName,
						title,
					}) => {
						const raw = typeof href === 'string' ? href.trim() : '';
						const desktopComponent = raw
							? parseAssistantDesktopAppHref(raw)
							: null;
						if (desktopComponent) {
							return (
								<DesktopAppButton
									type="button"
									variant="neutral"
									size="sm"
									className={cn(
										'touch-manipulation pointer-events-auto align-middle not-prose my-0.5 max-w-full no-underline',
										mdClassName
									)}
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										if (desktopComponent === 'EliteEwShellStartMenu') {
											requestOpenStartMenu();
											return;
										}
										if (desktopComponent.startsWith('EliteEwShellSettings')) {
											const rawTab = desktopComponent.includes(':')
												? desktopComponent.split(':')[1]
												: 'personalize';
											const tab = SHELL_SETTINGS_TAB_OK.has(rawTab)
												? (rawTab as DesktopShellSettingsTab)
												: 'personalize';
											requestOpenDesktopShellSettings(tab);
											return;
										}
										requestOpenDesktopApp({ appComponent: desktopComponent });
									}}
								>
									{children}
								</DesktopAppButton>
							);
						}
						const h = sanitizeMarkdownHref(href);
						if (!h) {
							return (
								<span className="text-(--desktop-text-muted) underline decoration-dotted">
									{children}
								</span>
							);
						}
						const linkTooltip =
							(typeof title === 'string' && title.trim()) || h;
						return (
							<DesktopChromeTooltip
								content={linkTooltip}
								placement="top"
								offsetExtra={4}
							>
								<a
									href={h}
									target="_blank"
									rel="noopener noreferrer"
									className={cn(LINK_SAFE, mdClassName)}
								>
									{children}
								</a>
							</DesktopChromeTooltip>
						);
					},
					img: ({ alt }) => {
						const altLabel = alt?.trim() || '…';
						return (
							<DesktopChromeTooltip
								content={altLabel}
								placement="top"
								offsetExtra={4}
							>
								<span
									className={cn(
										DESKTOP_TYPOGRAPHY.meta,
										'text-(--desktop-text-dim)'
									)}
								>
									[{altLabel}]
								</span>
							</DesktopChromeTooltip>
						);
					},
					table: ({ children, className: tableClass, ...rest }) => (
						<div
							className={cn(
								'my-3 max-w-full overflow-x-auto rounded-(--desktop-radius)',
								'border border-(--desktop-border-subtle)',
								'bg-[color-mix(in_srgb,var(--desktop-surface-soft)_28%,transparent)]',
								'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
							)}
						>
							<table {...rest} className={cn('mb-0 min-w-full', tableClass)}>
								{children}
							</table>
						</div>
					),
					pre: ({ children }) => <>{children}</>,
					code: ({ className, children, ...props }) => {
						const p = props as { inline?: boolean } & Record<string, unknown>;
						if (p.inline === true) {
							const { inline: _omit, ...rest } = p;
							return (
								<code className={INLINE_CODE} {...rest}>
									{children}
								</code>
							);
						}
						return (
							<FencedCodeBlock className={className} raw={String(children)} />
						);
					},
				}}
			>
				{trimmed}
			</ReactMarkdown>
		</div>
	);
}
