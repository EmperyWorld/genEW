#!/usr/bin/env bash
# Empery World 2.0 — one-click Living Engine deploy (Podman rootless).
# Usage:
#   ./scripts/ew2_one_click_deploy.sh [--no-pull] [--strict] [--lab] [--profile-llm] [--no-build]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DO_PULL=1
STRICT=0
LAB=0
PROFILE_LLM=0
DO_BUILD=1
# Populated after flag parse (lab adds compose.lab.yml).
COMPOSE_FILE_ARGS=(-f compose.yml)

for arg in "$@"; do
  case "$arg" in
    --no-pull) DO_PULL=0 ;;
    --strict) STRICT=1 ;;
    --lab) LAB=1 ;;
    --profile-llm) PROFILE_LLM=1 ;;
    --no-build) DO_BUILD=0 ;;
    -h|--help)
      cat <<'EOF'
Empery World 2.0 one-click deploy

  ./scripts/ew2_one_click_deploy.sh [flags]

Flags:
  --no-pull       Skip git pull --ff-only
  --lab           Lab stand: compose.yml + compose.lab.yml (autonomy ON).
                  For a stranger's machine — see PODMAN.md «From zero to green smoke».
                  Mutually exclusive with --strict.
  --strict        Production profile: fail on weak/missing POSTGRES_PASSWORD or
                  IDENTITY_JWT_SECRET, SEED_DEMO_USER=true, FakeAI/FakeNervas,
                  or ECC_REQUIRE_AUTH=false (unless EMPERY_ENV=production|prod|staging)
                  (does not auto-generate secrets — set them in .env first)
  --profile-llm   Also start compose profile llm (in-compose llama)
  --no-build      up -d without --build

Deploy order:
  1. Validate secrets (--strict) or ensure .env secrets (openssl rand -hex 32)
  2. chown orchestration bind mounts to uid 1000:1000 (Fedora rootless)
  3. Start postgres + redis
  4. alembic upgrade head (per Postgres service DB, incl. EIC when alembic.ini exists)
  5. Start full stack
EOF
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

if [[ "$LAB" -eq 1 && "$STRICT" -eq 1 ]]; then
  echo "[ERROR] --lab and --strict are mutually exclusive" >&2
  exit 2
fi

if [[ "$LAB" -eq 1 ]]; then
  if [[ ! -f compose.lab.yml ]]; then
    echo "[ERROR] compose.lab.yml missing — cannot enable --lab" >&2
    exit 1
  fi
  COMPOSE_FILE_ARGS=(-f compose.yml -f compose.lab.yml)
fi

JWT_PLACEHOLDER_PREFIX="change-me-identity"
WEAK_POSTGRES_PASSWORDS="eworld change-me password postgres"
RUN_UID="${EMPEY_RUN_UID:-1000}"
RUN_GID="${EMPEY_RUN_GID:-1000}"

die() { echo "[ERROR] $*" >&2; exit 1; }
warn() { echo "[WARN] $*" >&2; }
info() { echo "[INFO] $*"; }

resolve_compose() {
  if command -v podman-compose >/dev/null 2>&1; then
    echo "podman-compose"
  elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
    echo "podman compose"
  else
    die "Need podman-compose or 'podman compose' on PATH"
  fi
}

set_env_key() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    # shellcheck disable=SC2016
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

is_weak_postgres_password() {
  local pw="$1"
  [[ -z "$pw" || ${#pw} -lt 16 ]] && return 0
  for weak in $WEAK_POSTGRES_PASSWORDS; do
    [[ "$pw" == "$weak" ]] && return 0
  done
  return 1
}

is_weak_jwt() {
  local jwt="$1"
  [[ -z "$jwt" ]] && return 0
  [[ ${#jwt} -lt 32 ]] && return 0
  [[ "$jwt" == ${JWT_PLACEHOLDER_PREFIX}* ]] && return 0
  return 1
}

is_seed_demo_enabled() {
  local val="${1:-false}"
  case "${val,,}" in
    true|1|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

is_production_env() {
  case "${EMPERY_ENV:-}" in
    production|prod|staging) return 0 ;;
    *) return 1 ;;
  esac
}

is_auth_required() {
  local val="${1:-true}"
  case "${val,,}" in
    true|1|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

strict_preflight() {
  local pg_pw="${POSTGRES_PASSWORD:-}"
  local jwt="${IDENTITY_JWT_SECRET:-}"
  local seed="${SEED_DEMO_USER:-false}"

  if is_weak_postgres_password "$pg_pw"; then
    die "POSTGRES_PASSWORD is unset or weak — set via: openssl rand -hex 32 (required for --strict)"
  fi
  if is_weak_jwt "$jwt"; then
    die "IDENTITY_JWT_SECRET is unset or weak — set via: openssl rand -hex 32 (required for --strict)"
  fi
  if is_seed_demo_enabled "$seed"; then
    die "SEED_DEMO_USER=true is forbidden in --strict (production profile requires false)"
  fi
  local autonomy="${EIC_AUTONOMOUS_ENABLED:-false}"
  if is_seed_demo_enabled "$autonomy"; then
    die "EIC_AUTONOMOUS_ENABLED=true is forbidden in --strict (enable only after ops review)"
  fi
  local require_auth="${ECC_REQUIRE_AUTH:-true}"
  if ! is_auth_required "$require_auth" && ! is_production_env; then
    die "ECC_REQUIRE_AUTH must be true in --strict (or set EMPERY_ENV=production|staging|prod)"
  fi
  if ! is_auth_required "$require_auth" && is_production_env; then
    die "ECC_REQUIRE_AUTH=false is forbidden when EMPERY_ENV=${EMPERY_ENV} — set ECC_REQUIRE_AUTH=true"
  fi
}

ensure_host_ownership() {
  local dirs=(
    .cursor/orchestration
    .cursor/agents
    .cursor/skills
    .data/eic/models
  )
  local subdirs=(
    .cursor/orchestration/jobs
    .cursor/orchestration/jobs/pending
    .cursor/orchestration/jobs/archive
    .cursor/orchestration/designs
    .cursor/orchestration/reports
    .cursor/orchestration/intents
    .cursor/orchestration/audit
    .cursor/orchestration/eic
  )

  mkdir -p "${subdirs[@]}" .data/eic/models

  info "Ensuring bind-mount ownership ${RUN_UID}:${RUN_GID} (ECC/EIC run as 1000:1000)"
  if chown -R "${RUN_UID}:${RUN_GID}" "${dirs[@]}" 2>/dev/null; then
    :
  elif command -v sudo >/dev/null 2>&1 && sudo chown -R "${RUN_UID}:${RUN_GID}" "${dirs[@]}"; then
    info "Used sudo to chown orchestration dirs"
  else
    warn "Could not chown ${dirs[*]} — run: sudo chown -R ${RUN_UID}:${RUN_GID} .cursor/orchestration .cursor/agents .cursor/skills"
  fi

  if command -v chcon >/dev/null 2>&1; then
    chcon -Rt container_file_t .cursor/orchestration .cursor/agents .cursor/skills .data/eic/models 2>/dev/null \
      || warn "chcon skipped (non-Fedora SELinux or permission denied)"
  fi
}

ensure_secrets() {
  if [[ "$STRICT" -eq 1 ]]; then
    info "Skipping secret auto-generation (--strict; secrets must be set in .env)"
    return 0
  fi

  local generated=0
  local pg_pw="${POSTGRES_PASSWORD:-}"
  local jwt="${IDENTITY_JWT_SECRET:-}"

  if is_weak_postgres_password "$pg_pw"; then
    pg_pw="$(openssl rand -hex 32)"
    set_env_key POSTGRES_PASSWORD "$pg_pw"
    POSTGRES_PASSWORD="$pg_pw"
    generated=1
    info "Generated POSTGRES_PASSWORD (openssl rand -hex 32)"
    if podman volume inspect empery_pgdata >/dev/null 2>&1; then
      warn "Existing empery_pgdata volume may still use the old password."
      warn "Rotate Postgres: podman-compose down -v  (destroys DB volume) then redeploy, or ALTER USER manually."
    fi
  fi

  if is_weak_jwt "$jwt"; then
    jwt="$(openssl rand -hex 32)"
    set_env_key IDENTITY_JWT_SECRET "$jwt"
    IDENTITY_JWT_SECRET="$jwt"
    generated=1
    info "Generated IDENTITY_JWT_SECRET (openssl rand -hex 32)"
  fi

  if [[ "$generated" -eq 1 ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi
}

wait_for_postgres() {
  local user="${POSTGRES_USER:-eworld}"
  info "Waiting for postgres (pg_isready -U ${user})"
  local i
  for i in $(seq 1 60); do
    if $COMPOSE "${COMPOSE_FILE_ARGS[@]}" exec -T postgres pg_isready -U "$user" -d postgres >/dev/null 2>&1; then
      info "Postgres is ready"
      return 0
    fi
    sleep 2
  done
  die "Postgres not ready after 120s"
}

run_alembic_migrations() {
  local user="${POSTGRES_USER:-eworld}"
  local pw="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required for migrations}"
  local specs=(
    "services/core_auth_service/alembic.ini:DATABASE_URL:core_auth"
    "services/analytics_service/alembic.ini:ANALYTICS_DATABASE_URL:analytics"
    "services/identity_service/alembic.ini:IDENTITY_DATABASE_URL:identity"
    "services/task_orchestrator_service/alembic.ini:TASK_ORCHESTRATOR_DATABASE_URL:task_orchestrator"
    "services/intelligence_service/alembic.ini:INTELLIGENCE_DATABASE_URL:intelligence"
    "services/ai_chat/alembic.ini:AI_CHAT_DATABASE_URL:ai_chat"
    "services/desktop_shell/alembic.ini:DESKTOP_SHELL_DATABASE_URL:desktop_shell"
    "services/dedmoroz/alembic.ini:DEDMOROZ_DATABASE_URL:dedmoroz"
  )
  local eic_ini="services/empery_intelligence_core/alembic.ini"
  local spec ini env_var db url
  # Runtime images only bake one SERVICE_APP — mount host services/ so every
  # alembic.ini is visible (required for --lab stranger deploys).
  local services_mount=(-v "${ROOT}/services:/app/services:z")

  info "Running Alembic migrations (AUTO_CREATE_TABLES=false in compose)"
  for spec in "${specs[@]}"; do
    IFS=':' read -r ini env_var db <<< "$spec"
    if [[ ! -f "${ROOT}/${ini}" ]]; then
      info "  skip ${ini} (not on host)"
      continue
    fi
    url="postgresql+psycopg://${user}:${pw}@postgres:5432/${db}"
    info "  alembic -c ${ini} upgrade head  →  ${db}"
    svc_dir="/app/$(dirname "${ini}")"
    # shellcheck disable=SC2086
    $COMPOSE "${COMPOSE_FILE_ARGS[@]}" run --rm --no-deps \
      "${services_mount[@]}" \
      -e "${env_var}=${url}" \
      -e "PYTHONPATH=/app" \
      -e "ALEMBIC_CONFIG=/app/${ini}" \
      core_auth_service \
      sh -c "cd \"${svc_dir}\" && alembic -c /app/${ini} upgrade head"
  done

  if [[ -f "$eic_ini" ]]; then
    url="postgresql+psycopg://${user}:${pw}@postgres:5432/eic"
    info "  alembic -c ${eic_ini} upgrade head  →  eic"
    svc_dir="/app/$(dirname "${eic_ini}")"
    # shellcheck disable=SC2086
    $COMPOSE "${COMPOSE_FILE_ARGS[@]}" run --rm --no-deps \
      "${services_mount[@]}" \
      -e "EIC_DATABASE_URL=${url}" \
      -e "PYTHONPATH=/app" \
      -e "ALEMBIC_CONFIG=/app/${eic_ini}" \
      core_auth_service \
      sh -c "cd \"${svc_dir}\" && alembic -c /app/${eic_ini} upgrade head"
  else
    info "Skipping EIC Alembic (${eic_ini} not found — A4 migrations pending)"
  fi

  warn "If upgrade fails with DuplicateTable on a legacy volume, stamp once: alembic stamp head"
}

# --- 1) Optional fast-forward pull ---
if [[ "$DO_PULL" -eq 1 ]]; then
  if [[ -d .git ]] && command -v git >/dev/null 2>&1; then
    info "git pull --ff-only"
    git pull --ff-only || die "git pull --ff-only failed (use --no-pull to skip)"
  else
    warn "Skipping git pull (not a git checkout or git missing)"
  fi
else
  info "Skipping git pull (--no-pull)"
fi

# --- 2) Ensure .env (never overwrite existing) ---
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    info "Created .env from .env.example"
  else
    die ".env missing and .env.example not found"
  fi
fi

# Load .env for checks (export keys we care about)
set -a
# shellcheck disable=SC1091
source .env
set +a

# Rootless deploy-agent requires path-identity workspace + user podman.sock.
HOST_WS="$(pwd -P)"
set_env_key "EMPERY_HOST_WORKSPACE" "${HOST_WS}"
PODMAN_SOCK_DEFAULT="${XDG_RUNTIME_DIR:-/run/user/${RUN_UID}}/podman/podman.sock"
if [[ -z "${PODMAN_SOCKET:-}" ]]; then
  set_env_key "PODMAN_SOCKET" "${PODMAN_SOCK_DEFAULT}"
fi
export EMPERY_HOST_WORKSPACE="${HOST_WS}"
export PODMAN_SOCKET="${PODMAN_SOCKET:-$PODMAN_SOCK_DEFAULT}"
if [[ ! -S "${PODMAN_SOCKET}" ]]; then
  warn "Podman user socket missing at ${PODMAN_SOCKET} — starting podman.socket"
  systemctl --user enable --now podman.socket >/dev/null 2>&1 || true
fi
if [[ ! -S "${PODMAN_SOCKET}" ]]; then
  die "Rootless podman.socket required for empery_deploy_agent at ${PODMAN_SOCKET}"
fi
info "Deploy agent workspace=${EMPERY_HOST_WORKSPACE} sock=${PODMAN_SOCKET}"
if [[ ! -f compose.reflex.yml ]]; then
  cat > compose.reflex.yml <<'YAML'
# Auto-generated Empery Reflex overlay placeholder — ServiceScaffoldAction rewrites this.
services: {}
YAML
  info "Created empty compose.reflex.yml for EIC bind"
fi

if [[ "$STRICT" -eq 1 ]]; then
  strict_preflight
fi

ensure_secrets

JWT="${IDENTITY_JWT_SECRET:-}"
PG_PW="${POSTGRES_PASSWORD:-}"
AI_URL="${AI_CHAT_BASE_URL:-}"
EIC_URL="${EIC_LLM_BASE_URL:-}"
FAKE_AI="${INTELLIGENCE_USE_FAKE_AI:-false}"
FAKE_FALLBACK="${AI_CHAT_FALLBACK_FAKE:-false}"
FAKE_NERVAS="${EIC_USE_FAKE_NERVAS:-false}"
SEED_DEMO="${SEED_DEMO_USER:-false}"
AUTONOMY="${EIC_AUTONOMOUS_ENABLED:-false}"
REQUIRE_AUTH="${ECC_REQUIRE_AUTH:-true}"

# --- 3) Env checks (warn in lab; --strict already failed in strict_preflight for secrets/seed) ---
if is_weak_jwt "$JWT"; then
  msg="IDENTITY_JWT_SECRET is unset or weak — set via: openssl rand -hex 32"
  if [[ "$STRICT" -eq 1 ]]; then
    die "$msg"
  else
    warn "$msg"
  fi
fi

if is_weak_postgres_password "$PG_PW"; then
  msg="POSTGRES_PASSWORD is unset or weak — set via: openssl rand -hex 32"
  if [[ "$STRICT" -eq 1 ]]; then
    die "$msg"
  else
    warn "$msg"
  fi
fi

if is_seed_demo_enabled "$SEED_DEMO"; then
  msg="SEED_DEMO_USER=true seeds admin@eworld.local — disable for production"
  if [[ "$STRICT" -eq 1 ]]; then
    die "$msg"
  else
    warn "$msg"
  fi
fi

if is_seed_demo_enabled "$AUTONOMY"; then
  msg="EIC_AUTONOMOUS_ENABLED=true — headless worker may act on workspace; keep false unless intentional"
  if [[ "$STRICT" -eq 1 ]]; then
    die "$msg"
  else
    warn "$msg"
  fi
fi

if ! is_auth_required "$REQUIRE_AUTH"; then
  msg="ECC_REQUIRE_AUTH=false — guest mutating flows allowed; set true for production"
  if [[ "$STRICT" -eq 1 ]]; then
    die "$msg"
  else
    warn "$msg"
  fi
fi

if [[ -z "$AI_URL" || -z "$EIC_URL" ]]; then
  warn "Living-brain URLs missing (AI_CHAT_BASE_URL / EIC_LLM_BASE_URL) — compose defaults may apply"
fi

fake_on=0
for v in "$FAKE_AI" "$FAKE_FALLBACK" "$FAKE_NERVAS"; do
  case "${v,,}" in
    true|1|yes|on) fake_on=1 ;;
  esac
done
if [[ "$fake_on" -eq 1 ]]; then
  msg="FakeAI / FakeNervas enabled — living brain is recommended for production"
  if [[ "$STRICT" -eq 1 ]]; then
    die "$msg"
  else
    warn "$msg"
  fi
fi

ensure_host_ownership

# --- 4) Compose runner + HEALTHCHECK-friendly format ---
COMPOSE="$(resolve_compose)"
export BUILDAH_FORMAT="${BUILDAH_FORMAT:-docker}"
info "BUILDAH_FORMAT=$BUILDAH_FORMAT"
if [[ "$LAB" -eq 1 ]]; then
  info "Using: $COMPOSE ${COMPOSE_FILE_ARGS[*]}  (lab: autonomy ON)"
else
  info "Using: $COMPOSE ${COMPOSE_FILE_ARGS[*]}"
fi

PROFILE_ARGS=()
if [[ "$PROFILE_LLM" -eq 1 ]]; then
  PROFILE_ARGS+=(--profile llm)
  info "Including profile: llm"
fi

UP_ARGS=(up -d)
if [[ "$DO_BUILD" -eq 1 ]]; then
  UP_ARGS+=(--build)
fi

# --- 5) Postgres + Redis first, then Alembic, then full stack ---
info "Starting postgres + redis"
# shellcheck disable=SC2086
$COMPOSE "${COMPOSE_FILE_ARGS[@]}" up -d postgres redis

wait_for_postgres
run_alembic_migrations

info "Starting full stack"
# shellcheck disable=SC2086
$COMPOSE "${COMPOSE_FILE_ARGS[@]}" "${PROFILE_ARGS[@]}" "${UP_ARGS[@]}"

echo
info "Stack is up (or updating)."
echo "  UI:      http://localhost:${ECC_UI_HOST_PORT:-5173}"
echo "  ECC API: http://localhost:8006"
echo "  Desktop: http://localhost:${DESKTOP_UI_HOST_PORT:-5174}"
echo
if [[ "$LAB" -eq 1 ]]; then
  echo "Lab stand ready (compose.lab.yml — EIC autonomy enabled)."
  echo "Next (from zero to green — no mid-run code edits):"
  echo "  1. Point brain: set EIC_LLM_BASE_URL / AI_CHAT_BASE_URL in .env (default host.containers.internal:8080)"
  echo "  2. python3 scripts/verify_living_brain.py"
  echo "  3. ./scripts/smoke_convergence.sh"
  echo "  4. python3 scripts/p4_golden_loop_smoke.py"
  echo "  5. python3 scripts/p8_notes_golden_smoke.py"
  echo "See PODMAN.md § «From zero to green smoke (lab)»."
else
  echo "Next:"
  echo "  ./scripts/smoke_convergence.sh"
  echo "  ./scripts/grand_activation_e2e.sh   # when living brain is reachable"
  echo
  echo "Tip: keep FakeAI off and point AI_* / EIC_* at your living brain (see PODMAN.md)."
  echo "Lab stranger path: ./scripts/ew2_one_click_deploy.sh --lab"
fi
echo "Schema: Alembic runs on deploy (incl. EIC when alembic.ini is present)."
