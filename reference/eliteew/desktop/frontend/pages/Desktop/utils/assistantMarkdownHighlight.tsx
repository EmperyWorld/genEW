/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Рекурсивная подсветка plain-text узлов внутри ReactMarkdown (без code/pre).
 *
 * Related:
 * - pages/Desktop/components/ProductAssistantMarkdown.tsx
 * - pages/Desktop/utils/assistantFaqHighlight.tsx
 */
import * as React from 'react';
import { FaqHighlightText } from './assistantFaqHighlight';

const SKIP_TAGS = new Set(['code', 'pre']);

function nodeTagName(node: React.ReactElement): string | null {
	if (typeof node.type === 'string') return node.type;
	return null;
}

/** Подсветить текстовые листья; code/pre не трогаем. */
export function highlightMarkdownChildren(
	node: React.ReactNode,
	query: string
): React.ReactNode {
	const q = query.trim();
	if (!q) return node;
	if (node == null || typeof node === 'boolean') return node;
	if (typeof node === 'string') {
		return <FaqHighlightText text={node} query={q} />;
	}
	if (typeof node === 'number') return node;
	if (Array.isArray(node)) {
		let offset = 0;
		return node.map((child) => {
			const key = `md-hl-${offset}-${typeof child === 'string' ? child.length : 'n'}`;
			offset += typeof child === 'string' ? child.length : 1;
			return (
				<React.Fragment key={key}>
					{highlightMarkdownChildren(child, q)}
				</React.Fragment>
			);
		});
	}
	if (React.isValidElement(node)) {
		const tag = nodeTagName(node);
		if (tag && SKIP_TAGS.has(tag)) return node;
		const childProps = node.props as { children?: React.ReactNode };
		if (childProps.children === undefined) return node;
		return React.cloneElement(
			node,
			{},
			highlightMarkdownChildren(childProps.children, q)
		);
	}
	return node;
}
