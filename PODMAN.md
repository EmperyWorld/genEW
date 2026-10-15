# Empery on Fedora — Podman Rootless

## From zero to green smoke (lab)

For a **new machine / stranger operator** — no insider knobs, no mid-run code edits:

```bash
# 0) Clone + enter repo
git clone <this-repo> && cd genEW

# 1) One-click lab stand (autonomy ON via compose.lab.yml)
./scripts/ew2_one_click_deploy.sh --lab
# first run: copies .env.example → .env and generates secrets if empty
# optional: --no-pull  --no-build  --profile-llm

# 2) Living brain URL (compose default is portable — not a secret LAN IP)
#    Edit .env only if your LLM is not on the host at :8080:
#      EIC_LLM_BASE_URL=http://host.containers.internal:8080
#      AI_CHAT_BASE_URL=http://host.containers.internal:8080
#    FakeAI / FakeNervas must stay false.

# 3) Prove brain + mesh health
python3 scripts/verify_living_brain.py
./scripts/smoke_convergence.sh

# 4) Golden smokes (production path — posthoc OFF)
python3 scripts/p4_golden_loop_smoke.py
python3 scripts/p8_notes_golden_smoke.py
```

Expect: create → Desktop bake → evolve → `verify_status=PASSED` on p4; notes pack PASSED on p8.

UI: http://localhost:5173 · Desktop: http://localhost:5174 · ECC API: http://localhost:8006

Nightly (when a self-hosted runner sets `EMPERY_SMOKE_NIGHTLY=1`): `.github/workflows/optional-factory-smokes.yml` runs **p4 + p8**.

---

## One command (market / default)

```bash
./scripts/ew2_one_click_deploy.sh
# first run: copies .env.example → .env if missing, then builds & starts
# flags: --no-pull  --lab  --strict  --profile-llm  --no-build
```

Manual equivalent:

```bash
cp .env.example .env
# set IDENTITY_JWT_SECRET=$(openssl rand -hex 32)
# point AI_* / EIC_* at your living brain (see below)
mkdir -p .data/eic/models
export BUILDAH_FORMAT=docker   # retain HEALTHCHECK metadata under Podman
podman-compose up -d --build
# equivalent: podman compose up -d --build
```

UI: http://localhost:5173 · ECC API: http://localhost:8006

## Happy path: Autonomous → Desktop

Prerequisites:

- Living LLM reachable from EIC — set `EIC_LLM_BASE_URL` (see checklist below). Compose default is `http://host.containers.internal:8080` (brain on the same host).
- Autonomous Mode: **off by default** in market `compose.yml`. Lab stand: `podman-compose -f compose.yml -f compose.lab.yml up -d` (or `EIC_AUTONOMOUS_ENABLED=true` in `.env`).
- Deploy agent + Desktop stack up (`./scripts/ew2_one_click_deploy.sh`)

Steps:

1. Open ECC → **Autonomous** (`http://localhost:5173/ops/autonomous`) → enable **Mode**
2. Enqueue a companion intent with an explicit `service_name` (profile `companion_chat`)
3. Wait until Verifier reports **PASSED** (filesystem + live health)
4. Open Desktop (`http://localhost:5174`) → launch the new icon → window calls the live peer

Smoke gate (repeatable, live stack + LLM) — **P7.3 strict defaults**:

```bash
# Fresh create + evolve; posthoc OFF; poll timeout = FAIL
python3 scripts/p4_golden_loop_smoke.py
# Reuse capsule only when intentional:
EMPERY_SMOKE_SERVICE=p3_comp_live python3 scripts/p4_golden_loop_smoke.py
# Lab salvage (not DoD):
EMPERY_SMOKE_ALLOW_POSTHOC=1 python3 scripts/p4_golden_loop_smoke.py
python3 scripts/p3_autonomous_companion_smoke.py
# P8.2 second pack (notes):
python3 scripts/p8_notes_golden_smoke.py
```

### Strict golden checklist (lab operator)

Do this once on a Podman stand before claiming Hands DoD:

1. Stack: `podman-compose -f compose.yml -f compose.lab.yml up -d` (or set `EIC_AUTONOMOUS_ENABLED=true` in `.env`).
2. Brain: `EIC_LLM_BASE_URL` reachable from the EIC container (`host.containers.internal:8080` or LAN). `EIC_USE_FAKE_NERVAS=false`.
3. Deploy agent up; `EIC_REQUIRE_DEPLOY_AGENT=true`; Desktop UI container healthy.
4. Unset salvage knobs: no `EMPERY_SMOKE_ALLOW_POSTHOC`, no `EMPERY_SMOKE_SERVICE`, no `EMPERY_CURSOR_SALVAGE` / `VITE_EMPERY_CURSOR_SALVAGE`.
5. Run: `python3 scripts/p4_golden_loop_smoke.py` → expect create→Desktop bake→evolve→`verify_status=PASSED` without mid-run `podman restart` of EIC.
6. Optional second pack: `python3 scripts/p8_notes_golden_smoke.py`.

Cursor “Path A” (Architect → Implement in IDE) remains **salvage only** (`EMPERY_CURSOR_SALVAGE=1`). See [EMPERY_CONTROL_CENTER.md](EMPERY_CONTROL_CENTER.md) § Autonomous Mode.

## Production SaaS profile (`--strict`)

Use `./scripts/ew2_one_click_deploy.sh --strict` for production-like deploys:

| Requirement | Detail |
|-------------|--------|
| `ECC_REQUIRE_AUTH` | Must be **true** (compose market default). Lab sets `false` in `.env` |
| `EMPERY_ENV` | Set `production`, `prod`, or `staging` in `.env` |
| `SEED_DEMO_USER` | Must be **false** (no legacy demo admin seed) |
| `SEED_OPERATOR_PASSWORD` | Set for empty-DB bootstrap (strong secret); or register via UI |
| Secrets | `POSTGRES_PASSWORD` and `IDENTITY_JWT_SECRET` must be set in `.env` (≥32 bytes; script does not auto-generate in strict) |
| FakeAI | `INTELLIGENCE_USE_FAKE_AI`, `AI_CHAT_FALLBACK_FAKE`, `EIC_USE_FAKE_NERVAS` must be **false** |
| Rootless | Python services run as uid **1000:1000** — no root, no `label=disable` |
| Redis | Required — `EVENT_BUS_ALLOW_IN_MEMORY=false`; stack fails fast without Redis |
| Schema | `AUTO_CREATE_TABLES=false` — Alembic via deploy script only |

### Resource limits (Wave 2)

Compose sets `mem_limit` / `cpus` (podman-compose compatible):

| Service | mem_limit | cpus |
|---------|-----------|------|
| Python services (default) | 512m | 0.5 |
| `empery_intelligence_core` | 768m | 0.75 |
| `postgres` | 1g | 1.0 |
| `redis` | 256m | 0.25 |
| `empery_control_center_ui` | 128m | 0.25 |
| `llama-cpp` (profile `llm`) | 8g | 4.0 |

All app services use `restart: unless-stopped`.

Lab demos may set `SEED_OPERATOR_PASSWORD` (preferred) or legacy `SEED_DEMO_USER=true`, and `ECC_REQUIRE_AUTH=false` in `.env` for guest flows.

## WAVE 3 — Infrastructure polish

| Topic | Detail |
|-------|--------|
| Multi-stage images | Python: `deps` → `runtime` (UID 1000). UI: `build` → `runtime` (nginx UID 101). Compose sets `build.target: runtime`. |
| Runtime deps | `requirements.runtime.txt` (no pytest). Local/CI: `requirements.txt` includes `-r` + test deps. |
| Build context | Root `.dockerignore` excludes `.git`, `.data`, `node_modules`, caches, `*.gguf`, orchestration job dirs. |
| HEALTHCHECK | Python probes `/api/v1/health`; UI probes `/healthz`. Always `export BUILDAH_FORMAT=docker` (one-click script does this). |
| Compose parity | `compose.yml` is source of truth; keep `docker-compose.yml` byte-identical (`cmp -s compose.yml docker-compose.yml`). |
| One-click | `./scripts/ew2_one_click_deploy.sh` — optional `git pull --ff-only`, env check, `up -d --build`. |

### Non-root / rootless ownership

| Component | Image USER | Compose `user:` | Notes |
|-----------|------------|-----------------|-------|
| Python services (default) | `1000:1000` | `1000:1000` via `x-python-common` | Least privilege |
| ECC API / EIC | `1000:1000` | `1000:1000` + `userns_mode: keep-id` | Host binds writable without root; deploy script `chown`s orchestration to `1000:1000` |
| ECC UI | `101` | unset | `nginx-unprivileged` |
| Postgres / Redis | image default | unset | Named volumes |

Do **not** reintroduce `user: "0:0"`, `security_opt: label=disable`, `privileged: true`, or **root** `docker.sock` / `podman.sock`.

**In-loop deploy (no host crutches):** `empery_deploy_agent` mounts the **user** rootless socket
`${XDG_RUNTIME_DIR}/podman/podman.sock` with `:z` and the workspace at a **path-identity** mount
(`EMPERY_HOST_WORKSPACE=/absolute/repo/path`). EIC calls `POST /api/v1/deploy` (allowlisted
`up|build|ps|health` for a single service name only). Host `podman-compose` is not the success path.

### Image rebuild tips

```bash
export BUILDAH_FORMAT=docker
podman-compose -f compose.yml build --no-cache   # after requirements or Dockerfile changes
podman image prune -f                            # drop dangling layers
```

## External Living Brain (recommended)

The living brain **is** the product LLM (Nervas / chat / autonomous loop). The operator must keep it running and reachable from EIC and peer services.

### Portable checklist (no hard LAN IP required)

1. Decide where the OpenAI-compatible llama.cpp (or Nervas peer) listens — same host as Podman, or another machine on your LAN.
2. Set in `.env` (required for a non-default peer):
   - Same host: leave compose default `host.containers.internal:8080`, or set `EIC_LLM_BASE_URL=http://host.containers.internal:8080`
   - LAN peer: `EIC_LLM_BASE_URL=http://<brain-host-ip>:8080` and matching `AI_CHAT_BASE_URL=…/v1/chat/completions`
3. Align `AI_CHAT_MODEL` / `EIC_LLAMA_MODEL` with `GET /v1/models` id.
4. Keep Fake* flags **false**.
5. Verify: `python3 scripts/verify_living_brain.py` (host uses `127.0.0.1:8080` by default; pass `EIC_LLM_BASE_URL` if different).
6. Optional container probe: `EMPERY_SMOKE_FROM_CONTAINER=1 python3 scripts/verify_living_brain.py`
7. LAN UI: set `VITE_*` + CORS origins to your host IP, then rebuild ECC UI.

Point services at an OpenAI-compatible brain — **do not** enable compose profile `llm` when using an external brain:

```bash
# .env — same-host brain (Podman)
AI_CHAT_BASE_URL=http://host.containers.internal:8080/v1/chat/completions
EIC_LLM_BASE_URL=http://host.containers.internal:8080
# .env — LAN peer example (replace with your brain IP)
# AI_CHAT_BASE_URL=http://192.168.x.x:8080/v1/chat/completions
# EIC_LLM_BASE_URL=http://192.168.x.x:8080
AI_CHAT_MODEL=/models/gemma-4-26B.gguf   # match GET /v1/models id
INTELLIGENCE_USE_FAKE_AI=false
AI_CHAT_FALLBACK_FAKE=false
EIC_PROVIDER=local
EIC_LLAMA_MODEL=/models/gemma-4-26B.gguf
# Honest default: keyword/FTS memory only unless brain started with --embeddings
EIC_EMBEDDING_BACKEND=none
```

Containers reach LAN IPs via the bridge (no `extra_hosts` needed for `192.168.x.x`). Same-host brains use `host.containers.internal` (Podman).

Verify from host (and from EIC container when running):

```bash
python3 scripts/verify_living_brain.py
# force container probe even when auto-detect is ambiguous:
EMPERY_SMOKE_FROM_CONTAINER=1 python3 scripts/verify_living_brain.py
```

**Embeddings:** the default gemma server at `:8080` returns **501** on `/embeddings` unless llama.cpp was started with `--embeddings`. Compose defaults `EIC_EMBEDDING_BACKEND=none` (honest keyword/FTS memory). Do not point an http embedding backend at a brain that does not serve embeddings.

Manual curl equivalent (replace host as needed):

```bash
curl -sS -m 10 "${EIC_LLM_BASE_URL:-http://127.0.0.1:8080}/health"
curl -sS -m 10 "${EIC_LLM_BASE_URL:-http://127.0.0.1:8080}/v1/models"
```

Optional in-compose llama (host :8080) — only if you are **not** using an external brain:

```bash
# place model.gguf under .data/eic/models/ first
./scripts/ew2_one_click_deploy.sh --no-pull --profile-llm
# or: podman-compose --profile llm up -d llama-cpp
```

### Market vs lab profiles

| Knob | Market (`compose.yml`) | Lab (`compose.lab.yml`) |
|------|------------------------|-------------------------|
| `EIC_AUTONOMOUS_ENABLED` | default `false` | `true` |
| `ECC_REQUIRE_AUTH` | default `true` | leave true; set `false` in `.env` only for guest demos |
| `IDENTITY_PASSWORD_RESET_REVEAL` | default `false` | `true` (admin token in API; **no SMTP**) |
| `EMPERY_MESH_TOKEN` | set for market mesh trust | optional (empty = open `POST /registry/refresh`) |

Password reset: this seed has **no SMTP**. UI/API say an administrator can issue a token — never “email sent”.

## Compose files

| File | Role |
|------|------|
| `compose.yml` | Source of truth (podman-compose default); includes `reflex_probe_service` + `empery_deploy_agent` |
| `docker-compose.yml` | Parity twin for Docker Desktop (`docker compose -f docker-compose.yml`) |
| `compose.reflex.yml` | Auto-generated overlay for newly scaffolded services (path-identity deploy) |
| `deploy/docker/Dockerfile.python` | Multi-stage Python services (`target: runtime`, UID 1000) |
| `deploy/docker/Dockerfile.deploy_agent` | Deploy agent image (podman remote client + FastAPI allowlist) |
| `deploy/docker/Dockerfile.ui` | Multi-stage ECC React + nginx-unprivileged (`target: runtime`) |
| `deploy/postgres/init-databases.sql` | Per-service Postgres databases |
| `requirements.runtime.txt` | Runtime pip deps (image) |
| `.dockerignore` | Slim build context |
| `.env.example` | Secrets and tunables |
| `scripts/ew2_one_click_deploy.sh` | One-click deploy |

## SELinux & rootless bind mounts

| Mount | Suffix | Shared? | Notes |
|-------|--------|---------|-------|
| `./deploy/postgres/init-databases.sql` → initdb | `:Z,ro` | private | One container; private relabel OK |
| `./.cursor/orchestration` → ECC + EIC | `:z` | **shared** | Two containers; `:Z` would break the second after first relabel |
| `./.data/eic/models` → llama (profile `llm`) | `:Z,ro` | private | Read-only models |
| Named volumes (`pgdata`, `redisdata`, `eic_data`, `logs`) | *(none)* / optional `:Z` on bind-style | n/a | Official images manage UIDs |

Concepts:

- **`:Z` (private)** — relabel for exclusive use by one container.
- **`:z` (shared)** — relabel for multiple containers on the same host path.
- **`userns_mode: keep-id`** — maps the host user into the container so uid `1000` can write host binds under rootless Podman.
- **Host ownership** — `./scripts/ew2_one_click_deploy.sh` chowns `.cursor/orchestration` (and agents/skills) to `1000:1000` before `up`.

If you still see permission denied:

```bash
sudo chown -R 1000:1000 .cursor/orchestration .cursor/agents .cursor/skills
chcon -Rt container_file_t .cursor/orchestration .data/eic/models
```

## Autonomy safety

| `EIC_AGENT_EXEC_MODE` | Meaning |
|-----------------------|---------|
| `workspace` (default) | Headless jobs write under orchestration + services binds; deploy via `empery_deploy_agent` |
| `agent_container` | Optional sidecar pattern (no privileged) |
| `podman_exec` | **Not used** — replaced by `empery_deploy_agent` allowlisted HTTP |

| Knob | Default | Notes |
|------|---------|-------|
| `EIC_DEPLOY_AGENT_URL` | `http://empery_deploy_agent:8010` | In-loop compose |
| `EIC_DEPLOY_AGENT_TIMEOUT_S` | `120` | Per-call HTTP to deploy-agent |
| `EIC_DEPLOY_BLOCKING_BUDGET_S` | `180` | wait_for around `deploy_service` (fail vs stall) |
| `EIC_LIVE_VERIFY_BUDGET_S` | `150` | wait_for around live verify |
| `EIC_REQUIRE_DEPLOY_AGENT` | `true` | Fail closed if agent deploy fails |
| `EIC_ALLOW_COMPOSE_COMMANDS` | `false` | Legacy in-EIC compose; keep off |

## Smoke / activation

```bash
python3 scripts/verify_living_brain.py
python3 scripts/p2_evolve_enqueue_smoke.py
python3 scripts/p3_autonomous_companion_smoke.py
./scripts/smoke_convergence.sh
./scripts/grand_activation_e2e.sh   # identity → task → real insight → ECC
```

## Tear down

```bash
podman-compose down
# wipe data: podman-compose down -v
```

## Secret rotation (live DB / existing volume)

**Do not** rotate secrets by editing `.env` alone — dependent containers keep the old password and the stack fails silently on reconnect.

Use the interactive operator script (confirmational, masks secrets in logs):

```bash
./scripts/rotate_secrets.sh          # interactive menu
./scripts/rotate_secrets.sh --dry-run # planned steps only
```

| Secret | Live stack path | Notes |
|--------|-----------------|-------|
| **Operator password** | Identity `POST /api/v1/auth/password-reset/request` → `confirm` | For **existing** users. Set `IDENTITY_PASSWORD_RESET_REVEAL=true` temporarily if you need the token in the API response (admin mediation). |
| **SEED_OPERATOR_PASSWORD** | Update `.env` only | Seeds **empty** identity DB on first boot — does **not** change an existing operator. |
| **POSTGRES_PASSWORD** | `ALTER USER` inside `postgres` container → update `.env` → `--force-recreate` Python deps | Required when `pgdata` volume already exists (see Great Hardening verify report). Never `down -v` unless you intend to wipe data. |

Order for Postgres (from `reports/great_hardening_verify.md`):

1. `ALTER USER` with the **current** password from `.env` (must match live DB).
2. Write new `POSTGRES_PASSWORD` to `.env`.
3. Recreate services that embed the DSN (`identity_service`, `empery_control_center_api`, etc.).

Fresh deploys: generate via `openssl rand -hex 32` before first `up`. Legacy weak passwords on old volumes were rotated with `ALTER USER` during hardening — same pattern.

See [EMPERY_CONTROL_CENTER.md](EMPERY_CONTROL_CENTER.md) § Operator passwords.
