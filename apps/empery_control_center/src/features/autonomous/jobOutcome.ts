import type { AutonomousJob } from "@/api/types";
import {
  preferVerifySummary,
  resolveVerifyStatus,
} from "./autonomousJobDisplay";

/** Structured evolve pick stored on intention metadata. */
export interface JobSelectedOption {
  id?: string;
  title?: string;
  delta_summary?: string;
  risk?: string;
  touches?: string[];
}

export interface JobAssemblyOutcome {
  selectedOption: JobSelectedOption | null;
  scaffoldProfile: string | null;
  recipePacks: string[];
  actionStats: Record<string, number>;
  extractAdaptCount: number;
  scaffoldCount: number;
  writeFileCount: number;
  /** Prefer this-job atom writes; falls back to corpus only when new is absent. */
  atomFileCount: number;
  /** Corpus size under atoms/ trees (informational; not success theatre). */
  atomFileCorpusCount: number;
  atomFilesWired: string[];
  atomFilesUnwired: string[];
  packCount: number;
  genericWarned: boolean;
  resultSummary: string | null;
  artifactPaths: string[];
  artifactTail: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
}

function asNumberMap(value: unknown): Record<string, number> {
  const rec = asRecord(value);
  if (!rec) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function parseSelectedOption(meta: Record<string, unknown>): JobSelectedOption | null {
  const raw = asRecord(meta.selected_option);
  if (!raw) return null;
  const touches = asStringList(raw.touches);
  return {
    id: asString(raw.id) ?? undefined,
    title: asString(raw.title) ?? undefined,
    delta_summary: asString(raw.delta_summary) ?? undefined,
    risk: asString(raw.risk) ?? undefined,
    touches: touches.length ? touches : undefined,
  };
}

/** Relativize artifact paths for compact display. */
export function shortArtifactPath(path: string): string {
  const markers = [
    "/services/",
    "/.cursor/orchestration/",
    "/apps/",
  ];
  for (const m of markers) {
    const idx = path.indexOf(m);
    if (idx >= 0) return path.slice(idx + 1);
  }
  const parts = path.split("/");
  return parts.slice(-3).join("/");
}

export function parseJobAssemblyOutcome(job: AutonomousJob): JobAssemblyOutcome {
  const meta = asRecord(job.metadata) ?? {};
  const stats = asNumberMap(meta.eic_action_stats);
  const packs = asStringList(meta.recipe_packs ?? meta.assembly_packs);
  const profile =
    asString(meta.scaffold_profile) ??
    asString(meta.resolved_scaffold_profile);
  // Prefer cumulative meta counters — role turns reset last_action_stats;
  // merged eic_action_stats should match, but belt-and-suspenders for P13 UX.
  const extractAdapt = Math.max(
    Number(stats.extract_adapt ?? 0),
    Number(meta.eic_extract_adapt_count ?? 0),
  );
  const scaffold = Math.max(
    Number(stats.scaffold ?? 0),
    Number(meta.eic_scaffold_count ?? 0),
  );
  const writeFile = Math.max(
    Number(stats.write_file ?? 0),
    Number(meta.eic_write_file_count ?? 0),
  );
  const atomFileCorpusCount = Math.max(
    Number(meta.eic_atom_file_count ?? 0),
    0,
  );
  const atomFilesNew = Number(meta.eic_atom_files_new ?? NaN);
  // Prefer this-job new atom writes over corpus (atoms×635 trap).
  const atomFileCount = Number.isFinite(atomFilesNew)
    ? Math.max(atomFilesNew, 0)
    : atomFileCorpusCount;
  const atomFilesWired = asStringList(meta.eic_atom_files_wired);
  const atomFilesUnwired = asStringList(meta.eic_atom_files_unwired);
  const artifacts = Array.isArray(job.artifact_paths)
    ? job.artifact_paths.filter((p): p is string => typeof p === "string")
    : [];
  return {
    selectedOption: parseSelectedOption(meta),
    scaffoldProfile: profile,
    recipePacks: packs,
    actionStats: stats,
    extractAdaptCount: extractAdapt,
    scaffoldCount: scaffold,
    writeFileCount: writeFile,
    atomFileCount,
    atomFileCorpusCount,
    atomFilesWired,
    atomFilesUnwired,
    packCount: packs.length,
    genericWarned: Boolean(
      meta.assembly_generic_warn || meta.assembly_generic_refuse,
    ),
    resultSummary: (() => {
      const raw = asString(job.result_summary);
      const verify = resolveVerifyStatus(job);
      if (!raw && !verify) return null;
      return preferVerifySummary(raw ?? "", verify);
    })(),
    artifactPaths: artifacts,
    artifactTail: artifacts.slice(-5).map(shortArtifactPath),
  };
}

export function jobHasVisibleOutcome(outcome: JobAssemblyOutcome): boolean {
  return Boolean(
    outcome.selectedOption?.title ||
      outcome.selectedOption?.delta_summary ||
      outcome.resultSummary ||
      outcome.artifactTail.length ||
      outcome.scaffoldProfile ||
      outcome.recipePacks.length ||
      outcome.extractAdaptCount > 0 ||
      outcome.scaffoldCount > 0 ||
      outcome.atomFileCount > 0 ||
      outcome.genericWarned,
  );
}
