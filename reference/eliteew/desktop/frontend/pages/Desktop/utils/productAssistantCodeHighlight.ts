/**
 * Prism-based fenced code highlighting for Product Assistant (MIT).
 */
import Prism from 'prismjs';

/**
 * Order matters: each `prism-*` registers with `Prism.languages.extend('<id>', …)`.
 * If the base `<id>` is missing, extend clones `undefined` and throws on the first token key
 * (often `class-name`): "Cannot set properties of undefined (setting 'class-name')".
 */
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-tsx';

const LANG_ALIASES: Record<string, string> = {
	js: 'javascript',
	javascript: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	ts: 'typescript',
	tsx: 'tsx',
	typescript: 'typescript',
	jsx: 'jsx',
	html: 'markup',
	xml: 'markup',
	py: 'python',
	sh: 'bash',
	shell: 'bash',
	zsh: 'bash',
	yml: 'yaml',
	md: 'markdown',
	plaintext: 'plaintext',
	text: 'plaintext',
	txt: 'plaintext',
	java: 'java',
	cpp: 'cpp',
	'c++': 'cpp',
	rs: 'rust',
	rust: 'rust',
	go: 'go',
	golang: 'go',
	css: 'css',
	sql: 'sql',
	json: 'json',
	yaml: 'yaml',
};

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Inner HTML for the `<code>` element (caller wraps with Prism theme CSS).
 */
export function highlightProductAssistantCode(
	code: string,
	rawLang?: string
): string {
	const trimmed = code.replace(/\n$/, '');
	const key = rawLang?.trim().toLowerCase() ?? '';
	const resolved = key ? (LANG_ALIASES[key] ?? key) : '';

	try {
		if (resolved && Prism.languages[resolved]) {
			return Prism.highlight(trimmed, Prism.languages[resolved], resolved);
		}
		return escapeHtml(trimmed);
	} catch {
		return escapeHtml(trimmed);
	}
}
