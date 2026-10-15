# Recipe: service_factory

## Goal

Unified **factory Definition of Done** for Hands create/evolve. Newborns are first-class production peers for the **Desktop launch** environment — never canary/demo/stub green.

Aligns with `.cursor/rules/empery-north-star.mdc`: compose from recipes/templates/EliteEW, wire ecosystem + Desktop, verify **PASSED**.

Authoritative with `verify_gates` + `service_anatomy`. Hands enforce these deterministically (`verify_factory_gates`).

## Gates (fail-closed)

| Gate | Evidence |
|------|----------|
| Anatomy | `services/{name}/` layout + `manifest.json` + `register(` in `src/api/main.py` |
| Production src | No `FakeAI` / `FakeNervas` / `demo_stub` / InMemory* stores in `src/` |
| Compose | `EVENT_BUS_ALLOW_IN_MEMORY` not true; `AUTO_CREATE_TABLES` not true |
| Stateful | When postgres/DB in manifest or profile → `alembic/` present |
| LLM/auth | companion/studio/peer profiles → Nervas client + identity adapter + deps |
| Surfaces | ECC UI + desktop D1–D3 when `ui.required` (see verify_gates) |
| Live | Health + registry when deploy required |
| Status | `verify_status=PASSED` only — never `DEMO_PASSED` |

## Assembly steps

1. Scaffold via Hands profile (companion / studio / peer / health_probe).
2. Wire DB overlay + peer env + live_peers after deploy (Phase 2 tools).
3. Run Verifier — factory gates + anatomy/UI/desktop/live.
4. Promote peer only on **PASSED**.

## Quick FAIL (any one)

Fake*/demo in `src/`, InMemory bus or `AUTO_CREATE_TABLES=true` in deploy compose, missing `register()`, missing Alembic when stateful, missing Nervas/identity when profile requires LLM/auth, `DEMO_PASSED`, UI/desktop missing when required.

## Out of scope

Demo runner as happy path; FakeAI in runtime; dual canary tracks.
