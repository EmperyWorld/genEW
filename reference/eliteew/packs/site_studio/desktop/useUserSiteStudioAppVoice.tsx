/**
 * ---
 * EliteEW · Empery World · https://empery.world
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Site Studio workspace voice capture and mutation handlers.
 *
 * Invariants:
 * - Busy/error/notice updates stay on controller-owned state setters passed via `deps`.
 *
 * Related:
 * - features/site-studio/desktop/useUserSiteStudioAppController.tsx
 */
/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Desktop Site Studio workspace for creating and operating user sites, including user-friendly setup, draft review,
 * launch controls, tab-level scrolling, and Professional Worlds draft handoff hydration.
 *
 * Invariants:
 * - Site runtime mutations stay behind explicit operator actions; handoff drafts only prefill forms/messages.
 * - Embedded admin opens only when runtime guardrails report a ready site API.
 * - User tabs own their scroll area so route guidance scrolls with the active section content.
 *
 * Related:
 * - pages/Desktop/components/desktopWindowAppContent.tsx
 * - features/professional-worlds/desktop/professionalWorldsCrossAppDraft.ts
 */

import { lazy, useCallback } from 'react';
import { transcribe } from '@/voice-core/api/sttClient';

const _ImperorGPanelLazy = lazy(() =>
	import('./components/ImperorG/ImperorGPanel').then((m) => ({
		default: m.ImperorGPanel,
	}))
);

import {
	appendVoiceText,
	getUnknownErrorMessage,
} from './userSiteStudioAppModel';
import type { VoiceTarget } from './userSiteStudioAppModel';

export type UserSiteStudioAppHandlerDeps = Record<string, any>;

export type UserSiteStudioAppVoiceDeps = Record<string, any>;

export function useUserSiteStudioAppVoice(deps: UserSiteStudioAppVoiceDeps) {
	const {
		t,
		setForm,
		setAssistantInput,
		setRecordingTarget,
		setNotice,
		setBusyKey,
		setPanelError,
		clearNotice,
		mediaRecorderRef,
		mediaStreamRef,
		recordedChunksRef,
		cleanupVoiceResources,
		recordingTarget,
	} = deps;

	const startVoiceCapture = useCallback(
		async (target: VoiceTarget) => {
			if (recordingTarget) {
				return;
			}
			if (
				!navigator.mediaDevices?.getUserMedia ||
				typeof MediaRecorder === 'undefined'
			) {
				const message = t('app.voiceNotSupported');
				setPanelError(target === 'brief' ? 'setup' : 'ai', message);
				setNotice({ tone: 'error', message });
				return;
			}

			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: true,
				});
				const recorder = new MediaRecorder(stream);
				mediaStreamRef.current = stream;
				mediaRecorderRef.current = recorder;
				recordedChunksRef.current = [];
				recorder.ondataavailable = (event) => {
					if (event.data.size > 0) {
						recordedChunksRef.current.push(event.data);
					}
				};
				recorder.onstop = () => {
					const audioBlob = new Blob(recordedChunksRef.current, {
						type: recorder.mimeType || 'audio/webm',
					});
					cleanupVoiceResources();
					setRecordingTarget(null);

					void (async () => {
						const key = `voice:${target}`;
						setPanelError(target === 'brief' ? 'setup' : 'ai', null);
						setBusyKey(key, true);
						try {
							const audioFile = new File(
								[audioBlob],
								`site-studio-${target}.webm`,
								{
									type: audioBlob.type || 'audio/webm',
								}
							);
							const result = await transcribe(audioFile);
							if (target === 'brief') {
								setForm((previous) => ({
									...previous,
									brief: appendVoiceText(previous.brief, result.text),
								}));
							} else {
								setAssistantInput((previous) =>
									appendVoiceText(previous, result.text)
								);
							}
							setNotice({
								tone: 'success',
								message: t('app.voiceTranscribed'),
							});
						} catch (error: unknown) {
							const message = getUnknownErrorMessage(
								error,
								t('app.voiceTranscribeFailed')
							);
							setPanelError(target === 'brief' ? 'setup' : 'ai', message);
							setNotice({ tone: 'error', message });
						} finally {
							setBusyKey(key, false);
						}
					})();
				};
				recorder.start();
				setRecordingTarget(target);
			} catch (error: unknown) {
				cleanupVoiceResources();
				setRecordingTarget(null);
				const message = getUnknownErrorMessage(error, t('app.voiceMicDenied'));
				setPanelError(target === 'brief' ? 'setup' : 'ai', message);
				setNotice({ tone: 'error', message });
			}
		},
		[
			cleanupVoiceResources,
			recordingTarget,
			setBusyKey,
			setPanelError,
			t,
			setAssistantInput,
			setRecordingTarget,
			mediaStreamRef,
			setForm,
			mediaRecorderRef,
			recordedChunksRef,
			setNotice,
		]
	);

	const stopVoiceCapture = useCallback(() => {
		if (
			mediaRecorderRef.current &&
			mediaRecorderRef.current.state !== 'inactive'
		) {
			mediaRecorderRef.current.stop();
		}
	}, [mediaRecorderRef]);

	const toggleVoiceCapture = useCallback(
		async (target: VoiceTarget) => {
			if (recordingTarget === target) {
				stopVoiceCapture();
				return;
			}
			await startVoiceCapture(target);
		},
		[recordingTarget, startVoiceCapture, stopVoiceCapture]
	);

	return {
		startVoiceCapture,
		stopVoiceCapture,
		toggleVoiceCapture,
	};
}
