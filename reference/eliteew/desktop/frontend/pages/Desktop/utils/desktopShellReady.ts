/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Signals first desktop shell paint so Socket.IO connect can be deferred (lazy transport).
 *
 * Invariants:
 * - `markDesktopShellReady` is idempotent per navigation session.
 *
 * Related:
 * - `DesktopWorkspace.tsx`, `GAFChatProvider.tsx`
 */

type Listener = () => void;

let shellReady = false;
const listeners = new Set<Listener>();

export function getDesktopShellReady(): boolean {
	return shellReady;
}

export function subscribeDesktopShellReady(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function markDesktopShellReady(): void {
	if (shellReady) {
		return;
	}
	shellReady = true;
	for (const listener of listeners) {
		listener();
	}
}

export function resetDesktopShellReady(): void {
	shellReady = false;
}
