/**
 * How to load image bytes when re-copying a clipboard history item to the system clipboard.
 * `/api/*` must use the authenticated API client (see services/api/client), not raw fetch.
 */
export function clipboardImageBlobSource(content: string): 'api' | 'fetch' {
	return typeof content === 'string' && content.startsWith('/api/')
		? 'api'
		: 'fetch';
}
