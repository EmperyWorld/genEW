# Recipe: ewgen_factory

## Goal

Use vendored EWGen extract machinery inside Empery Hands: Fortune Seaker (FE cluster), Scavenger (BE prepare), unified prepare, Component Factory craft — not LLM invent and not hand-edit capsules.

## Living peer

Runtime package:

`services/empery_intelligence_core/src/integration/ewgen/`

Provenance (reference only):

`reference/ewgen/`

Catalogs:

`.cursor/orchestration/ewgen_data/`

## Hands ops (Assembler / mechanical)

| op | Input | Output |
|----|-------|--------|
| `ewgen_analyze` | `zip_path` (+ optional `track=fe\|be\|auto`) | componentGroups / BE clusters |
| `ewgen_prepare` | `zip_path` | bank entries in ewgen_data catalogs |
| `ewgen_cluster_extract` | `zip_path`, `dest`, optional `group_id`, `limit` | files under dest |
| `ewgen_component_factory` | `zip_path`, `project_name`, `intent` | craft + compose + validate (register off by default) |

Config-driven: LLM must not call these — Assembler owns them (same as `extract_adapt`).

## Assembly steps

1. Prefer existing `reference/eliteew/packs/{product}` extract_adapt when pack already exists.
2. When operator supplies an archive: `ewgen_analyze` → pick groups → `ewgen_cluster_extract` into pack or service atoms.
3. Full craft path: `ewgen_prepare` → `ewgen_component_factory` (weak contracts OK; Empery still scaffolds via Hands profile).
4. Never runtime-import `reference/ewgen`; never FakeAI.

## Related

`service_factory`, `desktop_mount_catalog`, `verify_gates`, product packs (`ewrp`, `site_studio`, …).
