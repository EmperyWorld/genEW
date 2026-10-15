# Recipe: verify_gates

## Goal

Definition of Done is evidence-backed. `verify_status=PASSED` only when filesystem (+ live when deployed) gates pass. FAILED blocks done.

Factory production-path checklist: see **`service_factory`** (Hands `verify_factory_gates`).

## Gates (create-service / evolve)

| Gate | Evidence |
|------|----------|
| Anatomy | `services/{name}/` layout + honest `manifest.json` |
| Registry | Discoverable via `register()` / hot `manifest.json` |
| Health | `GET /api/v1/health` → ok (live when deployed) |
| ECC UI | Product UI per `service-ui` unless **`manifest.json` `ui.required=false`** + `skip_reason` (manifest is SoT; design is fallback) |
| Primary nav | `NavPrimary` `eic:ui:{name}` ⇒ that service’s `manifest.ui.required=true` (lab/probe stay deep-link only) |
| Desktop D1 | Mount exists **and** profile content quality (companion→`/api/v1/messages`+peerApiBase; studio→jobs/generate; no stub phrase) |
| Desktop D2 | `registry.ts` imports + `APP_MOUNTS` entry |
| Desktop D3 | `.cursor/orchestration/eic/desktop_catalog/{name}.json` valid |
| UI image refresh | After ECC feature / Desktop mount writes: Hands `refresh_ecc_ui` + `refresh_desktop_ui` via deploy agent (source ≠ baked image without this) |
| Atom extract | Product pack matched ⇒ `extract_adapt` and/or Hands scaffold (forbid scratch-only invent) |
| Peers | No FakeAI/FakeNervas in `src/`; EventBus Redis path in runtime |
| Deploy claim | Live health + ECC registry presence — map alone ≠ deployed |

## Assembly steps

1. Run verifier after scaffold/implement — do not claim PASSED without evidence.
2. Desktop: `verify_service_desktop(workspace, service_name, ui_profile=...)` → PASSED \| FAILED \| SKIPPED. D1 fails health-only mounts for companion/studio profiles.
3. Fix FAILED before next intention stage; do not skip hooks or invent green status.
4. Live playground: curl health bases; desktop bootstrap lists the app; generate/chat hits real peers when applicable.
5. Reports under `.cursor/orchestration/reports/` must match verify_status.
6. Prefer `atom_catalog.yaml` + `extract_adapt` from `reference/eliteew` (enriched from live EliteEW).

## Quick FAIL (any one)

Unregistered service, missing mount/catalog when UI required, D1 stub / health-only product mount, FakeAI in runtime src, in-memory EventBus in compose, `AUTO_CREATE_TABLES=true` in prod, deploy claimed without live health, product-pack genesis with neither extract nor scaffold.

## Out of scope

Manual host shell as success for Reflex/Hands deploy (use allowlisted deploy agent paths).
