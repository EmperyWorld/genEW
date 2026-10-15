/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Hit-test virtual desktop strip buttons while dragging a window (drop target resolution).
 *
 * Invariants:
 * - Targets are elements with `data-vd-drop-target` (desktop id).
 * - Returns null when pointer is outside strip or during SSR.
 *
 * Related:
 * - components/VirtualDesktops.tsx
 * - components/DesktopWindowLayer.tsx
 */

export function resolveVirtualDesktopDropTarget(
	clientX: number,
	clientY: number
): string | null {
	if (typeof document === 'undefined') {
		return null;
	}
	const stack = document.elementsFromPoint(clientX, clientY);
	for (const node of stack) {
		if (!(node instanceof Element)) continue;
		const target = node.closest('[data-vd-drop-target]');
		if (!target) continue;
		const id = target.getAttribute('data-vd-drop-target')?.trim();
		if (id) return id;
	}
	return null;
}
