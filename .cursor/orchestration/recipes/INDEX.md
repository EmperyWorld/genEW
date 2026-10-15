# Empery assembly recipes (LLM catalog)

Recipes tell the autonomous loop **what to assemble from**, not how to invent code.

**Machine catalog:** [`atom_catalog.yaml`](atom_catalog.yaml) — pack → EliteEW upstream globs → `reference/eliteew` extract → Empery targets. Hands op: `extract_adapt`.

**Golden registry (P18):** [`pack_golden_registry.yaml`](pack_golden_registry.yaml) — product pack without a **PASSED** golden report is **not assembly-active**.

**North star:** `.cursor/rules/empery-north-star.mdc` — management composes capsules for **Desktop launch**; ops stay in ECC.

## Law

1. Prefer parts under `reference/eliteew/` + Empery templates in `services/*` / `apps/*`.
2. Emit Empery anatomy only (`services/{name}/`, ECC **and** desktop UI surface when required, manifest, health).
3. Never import `reference/` at runtime — copy/adapt into target paths.
4. Never edit EliteEW in place.
5. User-facing apps: register catalog on `desktop_shell` + window mount under `apps/empery_desktop/src/shell/`.
6. EIC Hands may read `reference/` (RO) and write `apps/empery_desktop/src/` + `services/` + ECC UI paths.
7. Living peers: LLM / Comfy as configured — never FakeAI/FakeNervas on runtime path.
8. **Compose > invent.** Matching recipe pack ⇒ adapt it. Generic DomainItem CRUD only when profile is `generic`.
9. DoD includes factory gates (`service_factory`) + D1–D3 + verify **PASSED** — not map/health alone.
10. **Golden gate (P18):** a **product** pack listed as `active` here must have a PASSED report in `pack_golden_registry.yaml`. New product pack without golden smoke ⇒ status **`draft`** (not assembly-active). Laws / platform / peer adapters use `always_active`.
11. **Configuration-Driven Assembly (`ops_dashboard`, `companion_chat`, `studio_job`):** LLM emits **Blueprint** + **Manifest** only. **Assembler (Mechanics)** owns domain/UI code inject into frozen slots. Verifier is **Auditor**; Gates **T ∧ C** are authoritative (LLM cannot stick FAILED→PASSED). See [`../assembly/CONFIGURATION_DRIVEN_ASSEMBLY.md`](../assembly/CONFIGURATION_DRIVEN_ASSEMBLY.md). Deny LLM writes via `freeze_list.yaml`. Gate S (semantic) uses Nervas when available; cannot rescue T/C fail.

## Cross-cutting (attach on create-service / evolve)

| Pack | Status | Purpose |
|------|--------|---------|
| `service_anatomy` | active | Mandatory module layout + DI/EventBus/DB laws |
| `desktop_mount_catalog` | active | Desktop mount + catalog overlay contract |
| `verify_gates` | active | PASSED/FAILED evidence (D1–D3, health, peers) |
| `service_factory` | active | Factory DoD — production path only (no Fake/demo) |

## Product / peer packs

| Pack | Status | Golden evidence | Empery target |
|------|--------|-----------------|---------------|
| `desktop_shell_kernel` | active (platform) | p10 / shell live | `services/desktop_shell` + `apps/empery_desktop` |
| `window_snap` | active (platform) | shell host | `apps/empery_desktop/src/shell/snap*` |
| `doc_editor` | active | `p16_desktop_launch.md`, `p8_notes_golden_smoke.md` | TipTap mount + Nervas Improve/Rewrite |
| `notes_tool` / `notes_crud` | active | `p8_notes_golden_smoke.md` | Notes/longread TipTap + optional CRUD list |
| `ops_dashboard` | active | `p12_ops_dashboard_golden_smoke.md`, `p17_evolve_matrix.md` | Metrics/JTBD dashboard (**config_driven**) |
| `task_board` | active | `p12_task_board_golden_smoke.md`, `p17_evolve_matrix.md` | Kanban / tasks |
| `research_report` | active | `p12_research_report_golden_smoke.md` | Research reports + optional Nervas |
| `studios` / image | active | `p12_image_studio_golden_smoke.md` | Image studio mount + corpus |
| `video_studio` | active | `p12_video_studio_golden_smoke.md` | Wan I2V peer path |
| `music_forge` | active | `p12_music_forge_golden_smoke.md` | AceStep peer path |
| `ewa_companion` | active | `p4_golden_loop_smoke.md`, `p17_evolve_matrix.md` | Companion → EIC Nervas (**config_driven** via `companion_chat`) |
| `site_studio` | active | `p12_site_studio_golden_smoke.md` | Site preview + Nervas |
| `ewrp` | active | `p12_ewrp_corpus_landing.md` | Presentation AI (EWRP) → `presentation_ai` |
| `comfy_image_peer` | active (peer) | via image studio golden | `services/image_studio` → ComfyUI |
| `nervas_llm_peer` | active (peer) | via companion / research / site | Living brain peer |
| `ewgen_factory` | always_active | — | Vendored EWGen Seaker/Scavenger/Component Factory in EIC |

See individual `*.md` files in this directory. Machine enforcement: `pack_golden_law.is_pack_assembly_active` (wired in `resolve_assembly_selection`).
