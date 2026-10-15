/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Mount Live Voice pipeline chunk only when the voice panel / live-voice mode is active.
 *
 * Invariants:
 * - Idle `#desktop` must not download the LiveVoiceDesktopPipeline chunk.
 *
 * Related:
 * - LiveVoiceDesktopPipeline.tsx, DesktopVoiceContext.tsx, DesktopWorkspaceShellLayout.tsx
 */

import { Suspense, lazy, type ReactElement } from 'react';
import { useDesktopVoiceOptional } from '../context/DesktopVoiceContext';

const LiveVoiceDesktopPipeline = lazy(() =>
	import('./LiveVoiceDesktopPipeline').then((m) => ({
		default: m.LiveVoiceDesktopPipeline,
	}))
);

export function LiveVoiceDesktopPipelineGate(): ReactElement | null {
	const desktopVoice = useDesktopVoiceOptional();
	const needed =
		Boolean(desktopVoice?.showLiveVoicePanel) ||
		desktopVoice?.activeMode === 'live-voice';
	if (!needed) return null;
	return (
		<Suspense fallback={null}>
			<LiveVoiceDesktopPipeline />
		</Suspense>
	);
}
