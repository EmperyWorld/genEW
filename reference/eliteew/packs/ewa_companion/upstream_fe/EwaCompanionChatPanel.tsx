/**
 * ---
 * EliteEW · Empery World · https://eliteew.ru
 * Author: po&T && TZBrand
 * ---
 *
 * Purpose:
 * Primary **friend chat** surface for EWA desktop window: atmospheric presence canvas, line-divided transcript,
 * streaming reply via SSE (`POST /api/v1/ewa/companion-chat/stream`) with synchronous fallback to
 * `POST /api/v1/ewa/companion-chat/message`. Refreshes companion profile after each turn so the persisted history
 * renders only the latest assistant reply after profile reload while the full transcript remains stored for memory.
 * Shows **`companion_recent_server_actions`** from `learned_preferences` when present (server-only tool ring).
 *
 * Invariants:
 * - Transcript key **`desktop_friend_chat_v1`** stays aligned with
 *   `api/ewa_platform/companion/turn/chat_turn.py`.
 * - Transcript bubbles render **Markdown** (GFM + sanitize via `EwaCompanionChatMarkdown`) so assistant `**` / `###` render
 *   as styled prose; plain user lines still work as a single paragraph.
 * - Optimistic **`pendingTurn`** stays visible until the reloaded profile contains the same final user+assistant pair —
 *   never cleared in `finally`, so a slow or torn stream cannot make the just-sent reply disappear.
 * - When SSE fails (network or `error` event), we fall back to the non-stream POST so a turn never silently fails.
 * - **`companion_recent_server_actions`** (learned_preferences) renders as an optional collapsible **Recent on your
 *   desk** strip when non-empty — mirrors server Phase D.2 ground truth for the LLM.
 * - Companion **actions** (**`open_app` / `focus_app` / `minimize_app` / `close_app`**, server-only **`music_play_track`**
 *   for background playback via global now-playing, plus **`doc_editor_set_body`**)
 *   are only honored from the server payload (`coerceCompanionActions`); **`open_app`** for **ContentManagerPro** may include
 *   **`content_manager_initial_filter.search_query`** prefilled alongside optional focus **`uc`**; EwaFile browse now prefers
 *   the embedded **`file_list`** output surface, so Content Manager opens only from explicit server actions; the panel never invents desktop side-effects and
 *   surfaces reversible **Undo** cards for open/close (heuristic undo for focus/minimize).
 * - **Server-only mode (2026-05):** the previous Server-first v2 / Classic toggle has been removed; this panel only consumes the profile
 *   returned after PATCH via the usual **GET** reload.
 * - **«Помнит о вас»** скрывается только в **враждебной** Арлике v1 (`seed_persona_id=arlika`); для **`arlika_v2`** полоса памяти как у EWA.
 *   Полоска **«Ваш план»** (read-only + отметка шагов) показывается когда API plans включён (`EWA_COMPANION_PLAN_ENABLED`); без конструктора roadmap.
 *   Над composer — ``EwaCompanionQuickPresetsStrip``: свёрнутая summary-строка + плавное раскрытие «Ваши · N»; подсказки в popover.
 *   Полоски памяти / плана / «последнее на столе» используют **EWA SVG sprites** (``EwaIcon`` + ``EwaIconSprites`` в ``EwaDesktopApp``).
 *   На **`lg+`** подсказка ожидания, «последнее на столе» и память живут в **левом боковом столбце**, блок текущих операций —
 *   в **правом** (полосы со своей прокруткой); на узкой ширине сохраняется сетка «память | операции» над чатом.
 * - Блок **«Текущие операции»** показывает последние 10 durable run-ов (active first), **авто-раскрывается** при новом active run, отражает готовое имя трека
 *   и даёт две дорожки playback: прямой **Play now** (без сообщения в чат) и вставку команды для оркестратора.
 *   Развёрнутая память **прокручивается внутри ограниченной высоты** (до ``EWA_COMPANION_MEMORY_STRIP_MAX_LINES`` строк, как на сервере).
 * - Полоса **«Следующий шаг»** визуализирует `companion_turn_plan_v1`: queued tool/source из профиля + подсказки `turn_plan_hint`
 *   из финального payload, чтобы deferred-цепочки были прозрачными и не маскировались под «уже запущено».
 * - **Sigil click:** when **arlika_v2** mode is eligible (or already active), the center **CompanionSigil** toggles
 *   EWA ↔ friendly **arlika_v2** via ``POST …/companion-profile/arlika-v2-mode-toggle`` (same contract as chat phrases)
 *   and plays the transform video on success.
 * - SSE **`transform`**: полноэкранный портал поверх стола с роликом по **`kind`** — **`arlika`** →
 *   `arly_transform.mp4`, **`ewa_restore`** / **`arly_to_ewa`** → `arly_to_ewa.mp4`, **`ewa_to_arly`** →
 *   `ewa_to_arly.mp4` (`companionTransformVideoUrl`); portal autoplays via programmatic `play()` and closes on `ended`.
 * - При **`desktop_config_patch_applied`**: инвалидация conditional-кэша конфига стола и **`refreshDesktopConfigFromServer`**
 *   (контекст приложений рабочего стола), иначе тема/обои не подтягиваются после серверного `PATCH` компаньона.
 * - После **каждого** успешного хода чата вызывается ``reloadProfile()`` (один GET профиля), чтобы подтянуть память без
 *   перезагрузки страницы.
 * - When the EWA desktop window is **foreground** (`useDesktopWindowActive`), printable keys are captured like GAF chat:
 *   if focus is not already in a text field, typing is routed to the composer (no click required).
 * - List items in the transcript use **`framer-motion`** for light enter transitions unless **`useReducedMotion`** is on;
 *   **`layout`** props are avoided on strips/list rows — they force repeated measurement and jank on low-end GPUs.
 * - **Layout:** from **`lg`**, hints / «последнее на столе» / память sit in a **left rail**, current operations in a **right rail**, so expanding
 *   memory does not steal vertical space from the transcript; narrow screens keep the two-column memory + operations grid above chat.
 * - Transcript panel uses **`min-h-0`** (no fixed **`min-h-48`**) so the composer stays inside the flex viewport when meta strips grow.
 * - Auto-scroll to the latest bubble is **throttled** while streaming tokens arrive (`behavior: auto`) to reduce scroll/layout churn.
 * - Transcript row **React keys** are stable (`revision + index + role`) — never derived from message body, so SSE deltas do not remount the bubble / markdown on every token.
 * - While tokens stream in, assistant rows render as plain **`li`** (no Framer entry animation); **`backdrop-blur-sm`** on the transcript panel is omitted when **`prefers-reduced-motion`** is set.
 * - When the desktop shell reports this window is **not** foreground (**`useDesktopWindowActive`** false), the presence canvas uses **`companion-presence-background`**: atmospheric/CSS animations pause and proactive **`companion-observation`** polling stops until focused again — lowers idle GPU and timers while another window is on top.
 * - When foreground but no chat/ops work (**`companion-presence-at-rest`**), ambient sigil breath/aura loops pause — same GPU rule as background, without hiding the panel.
 * - **Presence micro-copy** (role line, «рядом», mood chip) keys off **`mergeCompanionDisplayMood`**: learned **`companion_character_v1`** scalars override **`character_state.mood`** when both exist; chip text in the neutral «steady» band pulls from **`personaHeader.*.ambient`** so it shifts when mood floats.
 * - **Bond arc** blends memory richness, trust meter, and chat depth (`computeCompanionBondFill`) — not raw revision alone.
 * - **Palette HSL** blends **`repair_need`** (cools/dulls) and the hidden **`ewa_companion_trust_v1`** meter (slightly richer hues as it rises — never surfaced by name). Tooltip **`ewaCompanion.bondArcHint`** explains the sigil arc without naming internal counters.
 *
 * Related:
 * - src/features/ewa/companionOperations/useCompanionOperationsFocus.ts
 * - src/features/ewa/companionOutputSurface/useCompanionOutputSurfaceHandlers.ts
 * - src/features/ewa/companionUx/useEwaCompanionChatPanelOrchestration.tsx
 * - src/features/ewa/companionUx/useCompanionPendingTurn.ts
 * - src/features/ewa/companionTools/useCompanionToolsCatalog.ts
 * - src/features/ewa/companionTools/useCompanionOcrInstrument.ts
 * - src/features/ewa/companionRecentServerActionsUi.ts
 * - src/services/ewa/ewaCompanionChatApi.ts
 * - src/features/ewa/ewaIcons/EwaIcon.tsx
 * - src/services/ewa/ewaCompanionPlansApi.ts
 * - src/features/ewa/EwaDesktopApp.tsx
 * - src/features/ewa/companionPresenceCopy.ts
 */

import {
	CompanionDesktopLeftRailAside,
	CompanionMobileMetaRail,
} from '@/features/ewa/companionUx/CompanionLeftRailCluster';
import { CompanionNonChatOperationsEntry } from '@/features/ewa/companionUx/CompanionNonChatOperationsEntry';
import { CompanionDesktopRightOperationsAside } from '@/features/ewa/companionUx/CompanionDesktopRightOperationsAside';
import { CompanionChatPanelStack } from '@/features/ewa/companionUx/CompanionChatPanelStack';
import { CompanionChatPanelRoot } from '@/features/ewa/companionUx/CompanionChatPanelRoot';
import { CompanionChatMainRow } from '@/features/ewa/companionUx/CompanionChatMainRow';
import { CompanionChatMainColumn } from '@/features/ewa/companionUx/CompanionChatMainColumn';
import { CompanionOutputSurface } from '@/features/ewa/companionOutputSurface/CompanionOutputSurface';
import {
	useEwaCompanionChatPanelOrchestration,
	type EwaCompanionChatPanelOrchestrationProps,
} from '@/features/ewa/companionUx/useEwaCompanionChatPanelOrchestration';

export type EwaCompanionChatPanelProps =
	EwaCompanionChatPanelOrchestrationProps;

export function EwaCompanionChatPanel({
	profile,
	reloadProfile,
	onProfileResetRequired,
	onCompanionRevision,
	refreshDesktopConfigFromServer,
	embeddedMobile,
}: EwaCompanionChatPanelProps) {
	const {
		mobileEmbeddedLayout,
		mobileEmbeddedLandscape,
		arlikaPresence,
		isDesktopWindowActive,
		paletteStyle,
		workChromeActive,
		presenceAtRest,
		presenceHeaderProps,
		compactPresenceProps,
		leftRailClusterProps,
		hideMobileEmbeddedMetaRail,
		hideMemoryStrip,
		operationsRailProps,
		transcriptColumnProps,
		outputSurfaceProps,
		composerSectionProps,
		slimChatDockProps,
		documentEditorSurfaceActive,
		desktopRightRailVisible,
		attachDocumentSurfaceActionsHost,
		chatPanelStackProps,
		composerVisible,
		mobileActiveOperationCount,
		awaitingConfirmationCount,
		setMobileOperationsOpen,
	} = useEwaCompanionChatPanelOrchestration({
		profile,
		reloadProfile,
		onProfileResetRequired,
		onCompanionRevision,
		refreshDesktopConfigFromServer,
		embeddedMobile,
	});

	return (
		<CompanionChatPanelRoot
			mobileEmbeddedLayout={mobileEmbeddedLayout}
			mobileEmbeddedLandscape={mobileEmbeddedLandscape}
			arlikaPresence={arlikaPresence}
			isDesktopWindowActive={isDesktopWindowActive}
			paletteStyle={paletteStyle}
			workChromeActive={workChromeActive}
			presenceAtRest={presenceAtRest}
		>
			<CompanionChatMainRow
				presenceHeaderProps={presenceHeaderProps}
				leftRail={
					<CompanionDesktopLeftRailAside
						{...leftRailClusterProps}
						compactPresenceProps={compactPresenceProps}
					/>
				}
				mainColumn={
					<CompanionChatMainColumn
						mobileEmbeddedLandscape={mobileEmbeddedLandscape}
						mobileMetaRail={
							!hideMobileEmbeddedMetaRail ? (
								<CompanionMobileMetaRail
									{...leftRailClusterProps}
									hideMemoryStrip={hideMemoryStrip}
									operationsRailProps={operationsRailProps}
								/>
							) : null
						}
						transcriptColumnProps={transcriptColumnProps}
						transcriptContent={
							<CompanionOutputSurface {...outputSurfaceProps} />
						}
						composerSectionProps={composerSectionProps}
						slimChatDockProps={slimChatDockProps}
						nonChatOperationsEntry={
							!composerVisible ? (
								<CompanionNonChatOperationsEntry
									activeOperationCount={mobileActiveOperationCount}
									awaitingConfirmationCount={awaitingConfirmationCount}
									onOpenOperations={() => setMobileOperationsOpen(true)}
								/>
							) : null
						}
					/>
				}
				rightRail={
					<CompanionDesktopRightOperationsAside
						operationsRailProps={operationsRailProps}
						showDocumentEditorActions={
							documentEditorSurfaceActive && desktopRightRailVisible
						}
						attachDocumentSurfaceActionsHost={attachDocumentSurfaceActionsHost}
					/>
				}
			/>
			<CompanionChatPanelStack {...chatPanelStackProps} />
		</CompanionChatPanelRoot>
	);
}
