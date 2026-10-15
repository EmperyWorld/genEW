/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Subscribes to the global **`desktop-open-app`** event and opens or **focuses** the matching desktop window,
 * with merge rules for GAF, DocEditor, and **EwaApp** so repeat `open_app` signals do not spawn duplicates.
 *
 * Invariants:
 * - **`EwaApp`**: without **`forceNewWindow`**, reuses the top z-order EWA window (prefer non-minimized),
 *   merges optional session/payload, focuses — same intent as DocEditor recycling.
 * - Professional Worlds draft keys merge into destination windows as one-shot sessionStorage pointers.
 * - Ignores **`StudioGU`**; unchanged behavior for other app kinds unless listed above.
 *
 * Related:
 * - `useWindowManager.updateWindowPayload`
 * - `EwaDesktopApp` (pushes `ewaDesktopPersonaId` into window payload)
 */
import type * as React from 'react';
import { useEffect } from 'react';
import type { MarketingCabinetDeepLinkState } from '../../MarketingCabinet/hooks/useMarketingCabinetNavigation';
import type { VirtualDesktop } from './useVirtualDesktops';
import type { OpenWindowOptions } from './useWindowManager';
import type {
	DesktopItem,
	WindowInitialPayload,
	WindowState,
} from '../types/desktop.types';
import { findDesktopAppItemByComponent } from '../utils/desktopAppRegistry';
import type { DesktopOpenAppDetail } from '../utils/desktopDeepLink';
import {
	buildContentManagerOpenPayload,
	buildDocEditorOpenPayload,
	buildDocEditorV2OpenPayload,
	buildEwrpOpenPayload,
	buildEwrpJobOpenPayload,
	buildGafChatOpenPayload,
	buildGafComposerAttachmentOpenPayload,
	buildProfessionalWorldsDraftOpenPayload,
	buildSocialHubOpenPayload,
	mergeDocEditorPayload,
	resolveDocEditorOpenTarget,
	windowPayloadContainsDocEditorTarget,
} from '../utils/desktopOpenPayloads';

export function useDesktopWorkspaceOpenAppEvent(deps: {
	items: DesktopItem[];
	windowsRef: React.MutableRefObject<WindowState[]>;
	desktops: VirtualDesktop[];
	activeDesktopId: string;
	switchToDesktop: (id: string) => void;
	focusWindow: (id: string) => void;
	handleOpenWindow: (item: DesktopItem, options?: OpenWindowOptions) => void;
	updateWindowPayload: (
		windowId: string,
		payload: WindowInitialPayload
	) => void;
}): void {
	const {
		items,
		windowsRef,
		desktops,
		activeDesktopId,
		switchToDesktop,
		focusWindow,
		handleOpenWindow,
		updateWindowPayload,
	} = deps;

	// Deep link: `desktop-open-app` opens or focuses by `appComponent` (tray, notifications, Friends → GAF, etc.).
	// GAF with `targetUsername` / `targetChatId`: `useWindowManager` merges into an existing GAF window (`folderId` = desktop item id).
	// DocEditor: merge into same-document or generic doc window when possible.
	// EwaApp: single-window reuse so companion `open_app` spam does not stack EWA frames.
	// VoiceCommand uses the same event name from other entry points but is ignored here (palette / widget).
	useEffect(() => {
		const handleOpenApp = (e: Event) => {
			const detail = (e as CustomEvent<DesktopOpenAppDetail>).detail;
			const appComponent = detail?.appComponent;
			if (!appComponent || appComponent === 'StudioGU') return;
			const appItem = findDesktopAppItemByComponent(items, appComponent);
			if (!appItem) return;

			const gafChatPayload = buildGafChatOpenPayload(detail);
			const gafAttachmentPayload =
				buildGafComposerAttachmentOpenPayload(detail);
			const gafOpenPayload =
				gafChatPayload || gafAttachmentPayload
					? {
							...(gafChatPayload ?? {}),
							...(gafAttachmentPayload ?? {}),
						}
					: undefined;
			const professionalWorldsDraftOpenPayload =
				buildProfessionalWorldsDraftOpenPayload(detail);
			const socialHubOpenPayload =
				appComponent === 'SocialHubApp'
					? buildSocialHubOpenPayload(detail)
					: undefined;
			const ewrpOpenPayload = buildEwrpOpenPayload(detail);
			const ewrpJobOpenPayload = buildEwrpJobOpenPayload(detail);
			const ewrpCombinedOpenPayload: WindowInitialPayload | undefined =
				ewrpOpenPayload || ewrpJobOpenPayload
					? {
							...(ewrpOpenPayload ?? {}),
							...(ewrpJobOpenPayload ?? {}),
						}
					: undefined;
			const marketingDeepLinkRaw = detail?.marketingCabinetDeepLink;
			const marketingCabinetOpenPayload: OpenWindowOptions | undefined =
				appComponent === 'MarketingCabinet' &&
				marketingDeepLinkRaw != null &&
				typeof marketingDeepLinkRaw === 'object'
					? {
							initialPayload: {
								marketingCabinetDeepLink:
									marketingDeepLinkRaw as MarketingCabinetDeepLinkState,
							},
						}
					: undefined;
			const docEditorTarget =
				appComponent === 'DocEditor'
					? resolveDocEditorOpenTarget(detail)
					: null;
			const forceNewWindow = detail?.forceNewWindow === true;
			const docEditorOpenPayload: OpenWindowOptions | undefined =
				appComponent === 'DocEditor' && docEditorTarget
					? {
							initialPayload: buildDocEditorOpenPayload(docEditorTarget),
						}
					: undefined;
			const docEditorV2OpenPayload: OpenWindowOptions | undefined =
				appComponent === 'DocEditorV2'
					? (() => {
							const payload = buildDocEditorV2OpenPayload(detail);
							return payload ? { initialPayload: payload } : undefined;
						})()
					: undefined;
			const musicForgeRunRaw =
				typeof detail?.musicForgeRunId === 'string'
					? detail.musicForgeRunId.trim()
					: typeof detail?.musicEvolutionRunId === 'string'
						? detail.musicEvolutionRunId.trim()
						: '';
			const musicStudioOpenPayload: OpenWindowOptions | undefined =
				(appComponent === 'MusicForgeApp' ||
					appComponent === 'MusicGenerator' ||
					appComponent === 'MusicEvolutionApp') &&
				musicForgeRunRaw !== ''
					? {
							initialPayload: {
								musicForgeRunId: musicForgeRunRaw,
							},
						}
					: appComponent === 'MusicForgeApp' ||
							appComponent === 'MusicGenerator' ||
							appComponent === 'MusicEvolutionApp'
						? {}
						: undefined;
			const feedbackMode = detail?.feedbackQuickMode;
			const feedbackDraftRaw =
				typeof detail?.feedbackDraftBody === 'string'
					? detail.feedbackDraftBody.trim()
					: '';
			const feedbackOpenPayload: OpenWindowOptions | undefined =
				appComponent === 'FeedbackHubApp' &&
				(feedbackMode === 'text' || feedbackDraftRaw !== '')
					? {
							initialPayload: {
								...(feedbackMode === 'text'
									? { feedbackQuickMode: feedbackMode }
									: {}),
								...(feedbackDraftRaw !== ''
									? { feedbackDraftBody: feedbackDraftRaw }
									: {}),
							},
						}
					: undefined;
			const videoCallOpenPayload: OpenWindowOptions | undefined =
				appComponent === 'VideoCallApp'
					? {
							initialPayload: {
								videoCallId:
									typeof detail?.videoCallId === 'string'
										? detail.videoCallId.trim()
										: undefined,
								videoCallJoinUrl:
									typeof detail?.videoCallJoinUrl === 'string'
										? detail.videoCallJoinUrl.trim()
										: undefined,
								videoCallTitle:
									typeof detail?.videoCallTitle === 'string'
										? detail.videoCallTitle.trim()
										: undefined,
							},
						}
					: undefined;
			const amkaCompanyRaw =
				typeof detail?.amkaCompanyId === 'string'
					? detail.amkaCompanyId.trim()
					: '';
			const amkaProjectRaw =
				typeof detail?.amkaProjectId === 'string'
					? detail.amkaProjectId.trim()
					: '';
			const amkaPlatformSessionRaw =
				typeof detail?.ewaDesktopSessionId === 'string'
					? detail.ewaDesktopSessionId.trim()
					: '';
			const amkaOpenPayload: OpenWindowOptions | undefined =
				appComponent === 'EwaApp'
					? {
							initialPayload: {
								...(amkaCompanyRaw !== ''
									? { amkaCompanyId: amkaCompanyRaw }
									: {}),
								...(amkaProjectRaw !== ''
									? { amkaProjectId: amkaProjectRaw }
									: {}),
								...(amkaPlatformSessionRaw !== ''
									? { ewaDesktopSessionId: amkaPlatformSessionRaw }
									: {}),
							},
						}
					: undefined;
			const openWindowOptions: OpenWindowOptions | undefined =
				appComponent === 'ContentManagerPro'
					? {
							initialPayload: {
								...(buildContentManagerOpenPayload(detail) ?? {}),
							},
						}
					: appComponent === 'GAFChatApp' &&
							(gafOpenPayload || professionalWorldsDraftOpenPayload)
						? {
								initialPayload: {
									...(gafOpenPayload ?? {}),
									...(professionalWorldsDraftOpenPayload ?? {}),
								},
							}
						: professionalWorldsDraftOpenPayload
							? { initialPayload: professionalWorldsDraftOpenPayload }
							: ewrpCombinedOpenPayload
								? { initialPayload: ewrpCombinedOpenPayload }
								: feedbackOpenPayload
									? feedbackOpenPayload
									: marketingCabinetOpenPayload
										? marketingCabinetOpenPayload
										: docEditorOpenPayload
											? docEditorOpenPayload
											: docEditorV2OpenPayload
												? docEditorV2OpenPayload
												: musicStudioOpenPayload
													? musicStudioOpenPayload
													: videoCallOpenPayload
														? videoCallOpenPayload
														: amkaOpenPayload
															? amkaOpenPayload
															: gafOpenPayload
																? { initialPayload: gafOpenPayload }
																: socialHubOpenPayload
																	? { initialPayload: socialHubOpenPayload }
																	: undefined;
			const openWindowOptionsFinal: OpenWindowOptions | undefined =
				forceNewWindow
					? {
							...(openWindowOptions ?? {}),
							forceNew: true,
						}
					: openWindowOptions;

			if (
				appComponent === 'GAFChatApp' &&
				(gafOpenPayload || professionalWorldsDraftOpenPayload)
			) {
				const existingGaf = windowsRef.current.find(
					(w) => w.folderId === appItem.id && w.appComponent === 'GAFChatApp'
				);
				if (existingGaf) {
					const gafWindowId = existingGaf.id;
					const hostDesktop = desktops.find((d) =>
						d.windows.includes(gafWindowId)
					);
					if (hostDesktop && hostDesktop.id !== activeDesktopId) {
						switchToDesktop(hostDesktop.id);
					}
					updateWindowPayload(existingGaf.id, {
						...(gafOpenPayload ?? {}),
						...(professionalWorldsDraftOpenPayload ?? {}),
					});
					focusWindow(existingGaf.id);
					return;
				}
			}

			if (
				(appComponent === 'EWRP' ||
					appComponent === 'Presentations' ||
					appComponent === 'PresentationsArchive') &&
				ewrpCombinedOpenPayload
			) {
				const existingEwrp = windowsRef.current
					.filter(
						(w) =>
							w.appComponent === 'EWRP' ||
							w.appComponent === 'Presentations' ||
							w.appComponent === 'PresentationsArchive'
					)
					.sort((a, b) => b.zIndex - a.zIndex)
					.find((w) => !w.isMinimized);
				if (existingEwrp) {
					const hostDesktop = desktops.find((d) =>
						d.windows.includes(existingEwrp.id)
					);
					if (hostDesktop && hostDesktop.id !== activeDesktopId) {
						switchToDesktop(hostDesktop.id);
					}
					updateWindowPayload(existingEwrp.id, ewrpCombinedOpenPayload);
					focusWindow(existingEwrp.id);
					return;
				}
			}

			if (appComponent === 'DocEditor' && docEditorTarget) {
				const docWindows = windowsRef.current
					.filter((w) => w.appComponent === 'DocEditor')
					.sort((a, b) => b.zIndex - a.zIndex);
				const existingWithSameDoc = docWindows.find((w) =>
					windowPayloadContainsDocEditorTarget(
						w.initialPayload,
						docEditorTarget
					)
				);
				if (existingWithSameDoc) {
					const hostDesktop = desktops.find((d) =>
						d.windows.includes(existingWithSameDoc.id)
					);
					if (hostDesktop && hostDesktop.id !== activeDesktopId) {
						switchToDesktop(hostDesktop.id);
					}
					updateWindowPayload(
						existingWithSameDoc.id,
						mergeDocEditorPayload(
							existingWithSameDoc.initialPayload,
							docEditorTarget
						)
					);
					focusWindow(existingWithSameDoc.id);
					return;
				}

				if (!forceNewWindow) {
					const existingDoc =
						docWindows.find((w) => !w.isMinimized) ?? docWindows[0];
					if (existingDoc) {
						const hostDesktop = desktops.find((d) =>
							d.windows.includes(existingDoc.id)
						);
						if (hostDesktop && hostDesktop.id !== activeDesktopId) {
							switchToDesktop(hostDesktop.id);
						}
						updateWindowPayload(
							existingDoc.id,
							mergeDocEditorPayload(existingDoc.initialPayload, docEditorTarget)
						);
						focusWindow(existingDoc.id);
						return;
					}
				}
			}

			// VideoCall: one Jitsi iframe per call_id (avoid N× «я» в meet при повторных open_app).
			if (appComponent === 'VideoCallApp') {
				const incomingCallId =
					typeof detail?.videoCallId === 'string'
						? detail.videoCallId.trim()
						: '';
				if (incomingCallId) {
					const existingCall = windowsRef.current
						.filter((w) => w.appComponent === 'VideoCallApp')
						.find((w) => {
							const p = w.initialPayload as
								| { videoCallId?: string }
								| undefined;
							return p?.videoCallId?.trim() === incomingCallId;
						});
					if (existingCall) {
						const hostDesktop = desktops.find((d) =>
							d.windows.includes(existingCall.id)
						);
						if (hostDesktop && hostDesktop.id !== activeDesktopId) {
							switchToDesktop(hostDesktop.id);
						}
						focusWindow(existingCall.id);
						return;
					}
				}
			}

			if (
				appComponent === 'SocialHubApp' &&
				socialHubOpenPayload &&
				!forceNewWindow
			) {
				const existingSocialHub = windowsRef.current
					.filter((w) => w.appComponent === 'SocialHubApp')
					.sort((a, b) => b.zIndex - a.zIndex)
					.find((w) => !w.isMinimized);
				if (existingSocialHub) {
					const hostDesktop = desktops.find((d) =>
						d.windows.includes(existingSocialHub.id)
					);
					if (hostDesktop && hostDesktop.id !== activeDesktopId) {
						switchToDesktop(hostDesktop.id);
					}
					updateWindowPayload(existingSocialHub.id, socialHubOpenPayload);
					focusWindow(existingSocialHub.id);
					return;
				}
			}

			// EWA (`EwaApp`): companion / orchestration may emit `open_app` on many turns; always merge into one window
			// (like DocEditor) so transform + chat do not spawn duplicate EWA frames.
			if (appComponent === 'EwaApp' && !forceNewWindow) {
				const ewaWindows = windowsRef.current
					.filter((w) => w.appComponent === 'EwaApp')
					.sort((a, b) => b.zIndex - a.zIndex);
				const existingEwa =
					ewaWindows.find((w) => !w.isMinimized) ?? ewaWindows[0];
				if (existingEwa) {
					const hostDesktop = desktops.find((d) =>
						d.windows.includes(existingEwa.id)
					);
					if (hostDesktop && hostDesktop.id !== activeDesktopId) {
						switchToDesktop(hostDesktop.id);
					}
					const incoming = openWindowOptionsFinal?.initialPayload;
					if (incoming && Object.keys(incoming).length > 0) {
						updateWindowPayload(existingEwa.id, incoming);
					}
					focusWindow(existingEwa.id);
					return;
				}
			}

			handleOpenWindow(appItem, openWindowOptionsFinal);
		};
		window.addEventListener('desktop-open-app', handleOpenApp as EventListener);
		return () =>
			window.removeEventListener(
				'desktop-open-app',
				handleOpenApp as EventListener
			);
	}, [
		activeDesktopId,
		desktops,
		focusWindow,
		handleOpenWindow,
		items,
		switchToDesktop,
		updateWindowPayload,
		windowsRef.current.find,
		windowsRef.current.filter,
	]);
}
