# EWGen extract / Component Factory — provenance

Date: 2026-07-26

Copied from EWGen trash snapshot (read-only `cp`). **Source tree was not modified.**

Absolute root: `/home/owned/powered_by_emperyworld/trash/20260718-015129/EWGen/`

## What was copied

Closure (~200 files) for:

| Package | Role |
|---------|------|
| `generators/importer/` | Fortune Seaker — FE AST, **component_cluster**, prepare, catalog |
| `generators/scavenger/` | Python BE cluster, prepare, rewrite, catalog |
| `generators/unified_ingest/` | ZIP → FE+BE prepare orchestration |
| `generators/factory/component_factory_run.py` (+ deps) | One-shot Component Factory |
| `generators/warsmith/craft_suggest.py` (+ compose deps) | Craft ranking from bank |
| `generators/atomizer/` | Closure / ESAL / import rewrite / META |
| `generators/set/component_pipeline.py` + `adapter/fe_closure` | Single-component extract |
| `generators/bank/`, `project_shell/`, … | Bank hydrate + shell compose (factory path) |

Guides: `docs/SCAVENGER.md`, `FORTUNE_SEAKER.md`, `WARSMITH.md`, `SET.md`, `ATOMIZATION_PROTOCOL.md`

## Runtime (Empery)

Live code lives under:

`services/empery_intelligence_core/src/integration/ewgen/`

Hands/EIC imports **only** via `ewgen.bridge` (sys.path + catalog env). Never `import reference/ewgen` at runtime.

Catalogs default to workspace:

`.cursor/orchestration/ewgen_data/{import,scavenger,warsmith}-catalog.json`

## Out of scope (not copied)

- EWGen React UI (`src/`), node_modules, SET Podman runtime tree
- Full `data/atoms/` bank (102 atoms) — re-atomize via factory when needed
- Presentation product docs (secondary; EliteEW EWRP pack is product corpus)
