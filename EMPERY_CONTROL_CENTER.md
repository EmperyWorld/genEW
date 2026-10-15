# Empery Control Center — Run Book

Unified command deck for Empery World (ECC).

## Topology

| Plane | Path |
|-------|------|
| API | `services/empery_control_center_api/` (port **8006**) |
| UI | `apps/empery_control_center/` (Vite **5173**) |
| Designs | `.cursor/orchestration/designs/empery_control_center_blueprint.md` |
| Jobs | `.cursor/orchestration/jobs/` |

## Podman / Living Engine (recommended)

Full stack (7 services + Redis + Postgres + llama.cpp + UI):

```bash
cp .env.example .env
mkdir -p .data/eic/models   # add model.gguf
podman-compose up -d --build
# or: podman compose up -d --build
```

See [PODMAN.md](PODMAN.md) for SELinux notes and autonomy safety. Smoke: `./scripts/smoke_convergence.sh`.

## Start API

```bash
# From repo root
uvicorn services.empery_control_center_api.src.api.main:create_app --factory --host 0.0.0.0 --port 8006
```

## Start UI

```bash
cd apps/empery_control_center
cp .env.example .env   # VITE_ECC_API_BASE=http://localhost:8006
npm install
npm run dev
```

Open `http://localhost:5173` → Ops deck, Autonomous, Wizard, Sandbox.

### Login (required when `ECC_REQUIRE_AUTH=true`)

1. Empty identity DB: set `SEED_OPERATOR_PASSWORD` (and optional `SEED_OPERATOR_EMAIL`) in `.env`, restart `identity_service`, then sign in at `/login`.
2. Or register at `/register`, then sign in (Bearer JWT via ECC → identity).
3. Open `/ops/autonomous` — Autonomous Mode uses the same session.

Never commit `SEED_OPERATOR_PASSWORD`. Legacy `SEED_DEMO_USER=true` seeds `admin@eworld.local` / weak lab password only outside production.

### Operator password rotation

| Scenario | Procedure |
|----------|-----------|
| **Empty identity DB** | Set `SEED_OPERATOR_PASSWORD` (+ optional `SEED_OPERATOR_EMAIL`) in `.env`, restart `identity_service`, sign in at `/login`. |
| **Live operator (existing user)** | `./scripts/rotate_secrets.sh` → option **1** (password-reset API). Or manually: `POST /api/v1/auth/password-reset/request` then `confirm` on identity (`:8003`). |
| **Admin SQL fallback** | Connect to `identity` DB and update password hash via identity repository patterns — prefer API path above. |

`SEED_OPERATOR_PASSWORD` in `.env` does **not** reset an existing admin — it only bootstraps when the users table is empty.

For Postgres on an existing volume, see [PODMAN.md](PODMAN.md) § Secret rotation (`ALTER USER` + recreate dependents).

After login, primary ops surfaces:

| Surface | Path |
|---------|------|
| Ecosystem map | `/ops/map` |
| Autonomous Mode | `/ops/autonomous` |
| System health | `/ops/health` |

## Autonomous Mode

Operator surface for Empery Intelligence Core (no Cursor IDE required).

| Plane | Path |
|-------|------|
| UI | `/ops/autonomous` |
| API (via ECC BFF) | `/api/v1/autonomous/*` on port **8006** |
| Standalone EIC (optional) | port **8007** |

Key env (EIC; secrets stay server-side — UI never posts API keys):

| Variable | Default | Notes |
|----------|---------|-------|
| `EIC_LLM_BASE_URL` | `http://127.0.0.1:8080` | Local llama-cpp OpenAI-compatible base |
| `EIC_PROVIDER` | `local` | `local` \| `openai` \| `anthropic` \| `fake` |
| `EIC_OPENAI_API_KEY` / `EIC_ANTHROPIC_API_KEY` | empty | Cloud; empty → provider unconfigured |
| `EIC_AUTONOMOUS_ENABLED` | `false` | Boot default for Autonomous Mode; preferred genesis path when enabled. Lab overlay: `compose.lab.yml` sets `true` on `empery_intelligence_core` (compose default stays `false`) |
| `ECC_AUTONOMOUS_GATEWAY` | `true` | When false, ECC returns 503 on autonomous routes |
| `EIC_API_BASE` | `http://empery_intelligence_core:8007` | ECC HTTP proxy to EIC when processes are split (compose DNS) |
| `ECC_CORS_ORIGINS` | `http://localhost:5173,...` | Browser origins allowed to call ECC from the UI |

In compose, ECC proxies autonomous routes to EIC via `EIC_API_BASE`. When both run in one process, ECC resolves `eic_autonomous_use_cases` in-process instead.

## Tests

```bash
pytest services/empery_control_center_api/tests -q
pytest services/empery_intelligence_core/tests -q
```

## Wizard behavior (honest)

1. UI posts lifecycle commands → jobs under `.cursor/orchestration/jobs/`
2. **Demo:** `POST /api/v1/jobs/{id}/run-demo` runs `LocalOrchestrationRunner` (writes design/report stubs with `demo_stub: true`)
3. **Production path:** Cursor agent/operator claims job and runs `/plan` → `/implement` → `/verify` → `/evolve` — API does **not** spawn IDE agents

## Registry

Registration order in `core/registry.py`: auth → analytics → identity → task_orchestrator → intelligence → **empery_intelligence_core** → **empery_control_center_api**. Map/list is Plug & Play via `registry.list_services()`.
