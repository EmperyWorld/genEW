/**
 * DTO mirrors for ECC API contracts (Pydantic-shaped JSON).
 * Aligns UI design sketches + blueprint job/command surfaces.
 */

export type HealthStatus = "ok" | "degraded" | "down" | "unknown";

export interface StandardizedErrorResponse {
  error_code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type EventBusBackend = "redis" | "memory" | "unknown";

export interface EccHealthResponse {
  status: HealthStatus | "healthy" | "ok";
  service?: string;
  version?: string;
  timestamp?: string;
  event_bus_backend?: EventBusBackend;
  event_bus_ok?: boolean;
  redis_configured?: boolean;
  /** Best-effort Nervas readiness from ECC /health fabric probe */
  llm_ready?: boolean | null;
  /** Production gate: mutating routes require JWT when true. */
  auth_required?: boolean;
}

/** Alias for healthClient. */
export type HealthResponse = EccHealthResponse;

export interface ServiceManifestDTO {
  name: string;
  version: string;
  features: string[];
  entry_point: string;
  /** Hard peer-service dependencies (HTTP / required runtime). */
  dependencies: string[];
  /** EventBus topics this service publishes. */
  publishes?: string[];
  /** EventBus topics this service subscribes to. */
  subscribes?: string[];
}

/** platform = compose seed/spine; hands = Hands/Autonomous-generated capsule. */
export type ServiceOrigin = "platform" | "hands";

export interface ServiceNodeDTO {
  manifest: ServiceManifestDTO;
  health: HealthStatus;
  role_label?: string;
  last_seen_at?: string;
  /** Visual / layout band — enriched client-side from name + features. */
  origin?: ServiceOrigin;
}

/** Raw registry entry as returned by gateway list_services projection. */
export interface RegistryServiceEntry {
  name: string;
  version: string;
  features?: string[];
  entry_point: string;
  dependencies?: string[];
  publishes?: string[];
  subscribes?: string[];
}

export interface RegistrySnapshot {
  services: RegistryServiceEntry[];
  generated_at: string;
}

/**
 * Registry snapshot envelope.
 * Feature hooks use `snapshot.services`; flat fields kept for UI-design DTOs.
 */
export interface RegistrySnapshotResponse {
  snapshot: RegistrySnapshot;
  services?: ServiceNodeDTO[];
  generated_at?: string;
}

export interface ServiceDetailResponse {
  service: ServiceNodeDTO;
}

export interface ServiceHealthItem {
  name: string;
  health: HealthStatus;
  checked_at?: string;
}

export interface ServiceHealthListResponse {
  services: ServiceHealthItem[];
  ok_count?: number;
  degraded_count?: number;
  down_count?: number;
  unknown_count?: number;
  /** True when any probed service is degraded or down. */
  alert?: boolean;
  history?: HealthHistorySample[];
  recent_changes?: HealthStatusChange[];
}

export interface HealthHistorySample {
  checked_at: string;
  ok_count: number;
  degraded_count: number;
  down_count: number;
  unknown_count: number;
  alert: boolean;
}

export interface HealthStatusChange {
  service_name: string;
  from_health?: HealthStatus | null;
  to_health: HealthStatus;
  changed_at: string;
}

export type WizardStage = "plan" | "implement" | "verify" | "evolve";
export type LifecycleSkill = WizardStage;
export type OrchestrationSkill = WizardStage;

export type WizardSessionStatus =
  | "idle"
  | "running"
  | "passed"
  | "failed"
  | "cancelled";

export interface WizardSessionResponse {
  session_id: string;
  service_name: string;
  stage: WizardStage;
  status: WizardSessionStatus;
  design_path?: string;
  verify_report_path?: string;
  message?: string;
}

export interface WizardArtifactsResponse {
  session_id: string;
  design_path?: string;
  design_json_path?: string;
  verify_report_path?: string;
  artifacts: Array<{ kind: string; path: string }>;
}

export interface SandboxSessionResponse {
  session_id: string;
  status: "ready" | "probing" | "closed";
  created_at: string;
}

export interface SandboxProbeRequest {
  publisher?: string;
  subscriber?: string | null;
  topic: string;
  payload: Record<string, unknown>;
  confirm_destructive?: boolean;
}

export interface SandboxProbeResponse {
  session_id: string;
  probe_id: string;
  accepted: boolean;
  status?: "accepted" | "ok" | "failed" | "pending" | string;
  message?: string;
  observed_at?: string;
  echo?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export type FeedCategory = "intelligence" | "audit_hook" | "system";

export interface FeedItemDTO {
  id: string;
  topic: string;
  timestamp: string;
  summary: string;
  service_name?: string;
  correlation_id?: string;
  payload: Record<string, unknown>;
  /** audit_hook = Cursor IDE hooks; hidden from Insight Feed by default */
  category?: FeedCategory | string;
}

export interface FeedPageResponse {
  items: FeedItemDTO[];
  next_cursor?: string | null;
}

export type JobStatus =
  | "pending"
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface OrchestrationJob {
  id: string;
  skill: OrchestrationSkill;
  status: JobStatus;
  /** Enqueue is agent-only; demo may appear on legacy persisted jobs. */
  mode?: "agent" | "demo";
  service_name?: string;
  created_at?: string;
  updated_at?: string;
  message?: string;
  intent?: string;
  design_path?: string;
  report_path?: string;
  result_summary?: string;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

export type OrchestrationJobDTO = OrchestrationJob;

/** Command / job endpoint envelope. */
export interface JobResponse {
  job: OrchestrationJob;
  pickup_hint?: string;
}

export interface JobListResponse {
  jobs: OrchestrationJob[];
}

export interface PlanCommandRequest {
  service_name: string;
  features?: string[];
  constraints?: string;
  mode?: "agent";
  intent?: string;
  metadata?: Record<string, unknown>;
}

export interface ImplementCommandRequest {
  service_name: string;
  design_path?: string;
  job_id?: string;
  mode?: "agent";
  metadata?: Record<string, unknown>;
}

export interface VerifyCommandRequest {
  service_name: string;
  design_path?: string;
  job_id?: string;
  mode?: "agent";
  metadata?: Record<string, unknown>;
}

export interface EvolveOptionDTO {
  id: string;
  title: string;
  delta_summary: string;
  risk: "low" | "medium" | "high";
  touches: string[];
}

export interface EvolveProposeRequest {
  service_name: string;
  intent: string;
  option_count?: number;
}

export interface EvolveProposeResponse {
  proposal_id: string;
  service_name: string;
  intent: string;
  options: EvolveOptionDTO[];
  persisted_path?: string | null;
  backend?: string | null;
}

export interface EvolveCommandRequest {
  service_name: string;
  intent: string;
  features?: string[];
  mode?: "agent" | "demo";
  metadata?: Record<string, unknown>;
}

export interface OrchestrationPathsResponse {
  root: string;
  jobs: string;
  designs: string;
  reports: string;
  audit: string;
}

export interface AuditEventDTO {
  id?: string;
  timestamp: string;
  event_type?: string;
  topic?: string;
  message?: string;
  service_name?: string;
  payload?: Record<string, unknown>;
}

/** Audit row shape used by Console / Insight Feed polling. */
export interface AuditLogEntry {
  event?: string;
  timestamp?: string;
  summary?: string;
  raw?: Record<string, unknown>;
  /** Backend-tagged: audit_hook | intelligence | system */
  category?: string;
}

export interface AuditListResponse {
  entries: AuditLogEntry[];
  events?: AuditEventDTO[];
}

export type WsConnectionStatus =
  | "connected"
  | "reconnecting"
  | "offline"
  | "idle";

export type WsServerEventName =
  | "registry.service.registered"
  | "registry.service.updated"
  | "registry.service.unregistered"
  | "health.updated"
  | "eventbus.event"
  | "console.line"
  | "orchestration.session.updated"
  | "sandbox.probe.result"
  | "ecc.job.created"
  | "ecc.job.claimed"
  | "ecc.job.status_changed"
  | "ecc.job.completed"
  | "ecc.job.failed"
  | "ecc.registry.refreshed"
  | "eic.intention.submitted"
  | "eic.intention.created"
  | "eic.intention.claimed"
  | "eic.intention.stage_changed"
  | "eic.intention.paused"
  | "eic.intention.resumed"
  | "eic.intention.completed"
  | "eic.intention.failed"
  | "eic.loop.role_started"
  | "eic.loop.role_finished"
  | "eic.job.queued"
  | "eic.job.started"
  | "eic.job.stage_changed"
  | "eic.job.paused"
  | "eic.job.resumed"
  | "eic.job.completed"
  | "eic.job.failed"
  | "eic.job.cancelled"
  | "eic.mode.changed"
  | "eic.provider.changed"
  | "eic.llm.health";

/* ── Autonomous Mode (EIC via ECC BFF) ─────────────────────────── */

export type ProviderId = "local" | "openai" | "anthropic" | "fake";
export type AutonomousModeState = "off" | "on" | "paused";
export type AutonomousJobStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";
export type AutonomousStage =
  | "intake"
  | "plan"
  | "implement"
  | "verify"
  | "done";

export interface IntentionRecord {
  id: string;
  text: string;
  service_name?: string | null;
  features: string[];
  priority: number;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface AutonomousJob {
  id: string;
  intention_id: string;
  status: AutonomousJobStatus;
  stage: AutonomousStage;
  intention_text: string;
  service_name?: string | null;
  provider_id: ProviderId;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  result_summary?: string | null;
  error_message?: string | null;
  artifact_paths: string[];
  ecc_job_id?: string | null;
  metadata: Record<string, unknown>;
}

export interface SubmitIntentionRequest {
  intention: string;
  service_name?: string | null;
  features?: string[];
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface SubmitIntentionResponse {
  intention: IntentionRecord;
  job: AutonomousJob;
}

export interface AutonomousJobListResponse {
  jobs: AutonomousJob[];
  total: number;
}

export interface AutonomousJobResponse {
  job: AutonomousJob;
}

export interface AutonomousModeResponse {
  state: AutonomousModeState;
  enabled: boolean;
  active_job_id?: string | null;
  provider_id: ProviderId;
  updated_at: string;
}

export interface ProviderDescriptor {
  id: ProviderId;
  label: string;
  configured: boolean;
  healthy?: boolean | null;
  is_local: boolean;
}

export interface ProviderConfigResponse {
  active_provider_id: ProviderId;
  available: ProviderDescriptor[];
  llm_base_url: string;
  runtime_override: boolean;
  updated_at: string;
}

export interface SetProviderRequest {
  provider_id: ProviderId;
  llm_base_url?: string | null;
}

export interface SetProviderResponse {
  config: ProviderConfigResponse;
  switched: boolean;
  message: string;
}

export interface MemorySearchHit {
  atom_id: string;
  kind: string;
  title: string;
  snippet: string;
  score?: number | null;
  created_at?: string | null;
  service_name?: string | null;
}

export interface MemorySearchResponse {
  query: string;
  hits: MemorySearchHit[];
  truncated: boolean;
}

export interface LlmHealthResponse {
  status: "ok" | "degraded" | "down";
  provider_id: ProviderId;
  base_url: string;
  latency_ms?: number | null;
  model?: string | null;
  detail?: string | null;
  checked_at: string;
}

export type ConsoleLineLevel = "info" | "warn" | "error" | "thought";
export type ConsoleLevel = ConsoleLineLevel;

export interface ConsoleLineDTO {
  id: string;
  timestamp: string;
  level: ConsoleLineLevel;
  message: string;
  service_name?: string;
  source?: string;
  correlation_id?: string;
  payload?: Record<string, unknown>;
}

/** Server → client envelope from WS /api/v1/ws/events */
export type WsServerMessageType =
  | "event"
  | "registry"
  | "heartbeat"
  | "error"
  | "hello";

export interface WsServerMessage {
  type: WsServerMessageType;
  ts: string;
  event_name?: string | null;
  payload?: Record<string, unknown>;
}

/** Live WS / bridge event envelope consumed by Map + Console. */
export interface EccLiveEvent {
  type: string;
  ts: string;
  event_name?: string;
  payload?: Record<string, unknown>;
  message?: string;
  level?: ConsoleLevel;
  service_name?: string;
  correlation_id?: string;
}
