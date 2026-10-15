/**
 * ECC feature surfaces — wire from shell routes (Implementer 2).
 *
 * Suggested route map:
 *   /ops, /ops/map     → EcosystemMapPage (+ CommandConsole + InsightFeed)
 *   /ops/console       → CommandConsole (focused)
 *   /ops/feed          → InsightFeed (focused)
 *   /wizard            → ServiceWizardPage
 *   /wizard/:sessionId → ServiceWizardPage sessionId={sessionId}
 *   /sandbox           → SandboxPage
 *   /sandbox/:sessionId→ SandboxPage sessionId={sessionId}
 *   /ops/autonomous    → AutonomousPage
 *
 * Live updates: pass `liveEvents` from Implementer 4 `useEccSocket` when ready.
 * Until then, features REST-poll registry/audit.
 */

export * from "./ecosystem-map";
export * from "./command-console";
export * from "./service-wizard";
export * from "./insight-feed";
export * from "./sandbox";
export * from "./autonomous";
export { OpsDeck } from "./OpsDeck";
export type { OpsDeckProps, OpsFocus } from "./OpsDeck";
