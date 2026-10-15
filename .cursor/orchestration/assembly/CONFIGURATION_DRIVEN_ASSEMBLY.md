# Configuration-Driven Assembly (law)

Config-driven profiles: **`ops_dashboard`** (`Dashboard_Standard`), **`companion_chat`** (`Companion_Chat`), **`studio_job`** (`Studio_Job`).

## Roles

| Role | Owns | Must not |
|------|------|----------|
| **LLM (Architect / Implementer)** | Blueprint JSON, Manifest JSON, intent prose | Domain `src/`, UI mounts/pages, `assembly_lib/`, compose overlays |
| **Assembler (Mechanics)** | Scaffold capsule, Babel inject into `@assembler-slot`, stamp `assembly_runtime.json` + `assembly_freeze.json`, tsc, ECC API reload | Invent product UX outside Manifest composition |
| **Verifier (Auditor)** | Gates **T** (hash freeze), **C** (Blueprint↔Manifest↔slots/endpoints), **S** (semantic Intent↔contracts) | Override T∧C with narrative PASSED |

## Authoritative verify

`verify_status = PASSED` ⇔ **Gate T ∧ Gate C** (and Gate S when config_driven). LLM `verify_status` is non-authoritative when gates disagree.

## Manifest → DI

Composition items with `data_source` (or dynamic mappings) inject via scaffold helpers and `data-assembly-data-source` attrs — not static-only titles.

| Profile | Helpers | Widget Base* |
|---------|---------|--------------|
| `ops_dashboard` | `metricField()` / `metricSeries()` | `BaseCard`, `BaseChart`, `BaseMetricTile` |
| `companion_chat` | `chatMessages()`, `message` / `setMessage` / `onSend` / `busy` | `BaseChatPanel`, `BaseComposer` |
| `studio_job` | `studioJobs()`, `prompt` / `setPrompt` / `onGenerate` / `busy` | `BaseJobForm`, `BaseJobList` |

Slot name is always `data-assembler-slot="widgets"` (Gate C).

## Deny / freeze

[`.cursor/orchestration/assembly/freeze_list.yaml`](freeze_list.yaml) drives LLM deny prefixes (`deny_llm_writes` + `scaffold_owned_immutable`). Writes → `EIC_CRITICAL_VIOLATION`. Profiles: ops_dashboard, companion_chat, studio_job.

## Runtime requirements

- EIC image includes **Node 20+** (`deploy/docker/Dockerfile.eic`) for Assembler Babel CLI + post-inject `tsc`.
- ECC API refresh uses deploy-agent `restart` (`podman restart empery_<svc>_1`) — not `--force-recreate` (avoids exit 125 with dependents).
- Production defaults: tsc and ECC API reload **fail-closed** when deploy_agent is configured.
- Lab escapes only: `EIC_ASSEMBLY_SKIP_TSC=1`, `EIC_ASSEMBLY_SKIP_ECC_RELOAD=1`.

## Proof scripts

- Unit inject + Gates T∧C: `python3 scripts/assembly_ops_dashboard_smoke.py --mode unit`
- Live Playwright (fail-closed): `ASSEMBLY_SMOKE_ROUTE=… python3 scripts/assembly_ops_dashboard_smoke.py --mode live`
- Live Autonomous Create proof (ops_dashboard): `python3 scripts/assembly_config_driven_c7_proof.py`

## Pilot proof

Live Autonomous Create green: [`../reports/assembly_config_driven_c7_proof.md`](../reports/assembly_config_driven_c7_proof.md) — Gate T∧C PASSED, Nervas Gate S, Manifest DI inject. Phase D2: companion_chat + studio_job schemas/slots/Assembler unit-green (live Create follow-on).
