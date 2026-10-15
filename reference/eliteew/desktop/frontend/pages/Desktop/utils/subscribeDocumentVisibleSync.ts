/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Shared `visibilitychange` subscriptions for document visibility sync.
 *
 * Invariants:
 * - No-op cleanup when `document` is unavailable (SSR/tests without DOM).
 * - Visible/hidden helpers fire only on the matching `visibilityState` transition.
 *
 * Related:
 * - hooks/useVisibilityAwareInterval.ts
 * - context/GAFChatProvider.tsx
 * - components/DesktopWindowLayer.tsx
 */

/** Invoke `onVisible` whenever the tab becomes visible again. Returns unsubscribe. */
export function subscribeDocumentVisibleSync(
	onVisible: () => void
): () => void {
	if (typeof document === 'undefined') {
		return () => {};
	}
	const handler = () => {
		if (document.visibilityState === 'visible') {
			onVisible();
		}
	};
	document.addEventListener('visibilitychange', handler);
	return () => document.removeEventListener('visibilitychange', handler);
}

/** Invoke `onHidden` whenever the tab becomes hidden. Returns unsubscribe. */
export function subscribeDocumentHiddenSync(onHidden: () => void): () => void {
	if (typeof document === 'undefined') {
		return () => {};
	}
	const handler = () => {
		if (document.visibilityState === 'hidden') {
			onHidden();
		}
	};
	document.addEventListener('visibilitychange', handler);
	return () => document.removeEventListener('visibilitychange', handler);
}

/** Invoke `onChange` on every visibility transition. Returns unsubscribe. */
export function subscribeDocumentVisibilityChange(
	onChange: () => void
): () => void {
	if (typeof document === 'undefined') {
		return () => {};
	}
	document.addEventListener('visibilitychange', onChange);
	return () => document.removeEventListener('visibilitychange', onChange);
}
