#!/usr/bin/env bash
# Safe operator flow for rotating Empery secrets on a LIVE stack (existing Postgres volume).
#
# Usage:
#   ./scripts/rotate_secrets.sh [--dry-run]
#
# Never prints full secrets — only masked previews (first 4 chars + …).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      cat <<'EOF'
Empery secret rotation (interactive, confirmational)

  ./scripts/rotate_secrets.sh [--dry-run]

Rotates:
  1) Identity operator password (live users) via password-reset API
  2) SEED_OPERATOR_PASSWORD in .env (empty-DB bootstrap only — documents value)
  3) POSTGRES_PASSWORD on existing pgdata volume (ALTER USER + .env + recreate deps)

Flags:
  --dry-run   Print planned steps; do not mutate .env, Postgres, or containers.

Safety:
  - Confirms each destructive step.
  - Masks secrets in stdout/stderr.
  - Does NOT run `down -v` (data-preserving path only).

See PODMAN.md § Secret rotation and EMPERY_CONTROL_CENTER.md § Operator passwords.
EOF
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

mask_secret() {
  local value="$1"
  if [[ -z "$value" ]]; then
    echo "(empty)"
    return
  fi
  if ((${#value} <= 4)); then
    echo "****"
    return
  fi
  echo "${value:0:4}…(${#value} chars)"
}

info() { echo "[INFO] $*"; }
warn() { echo "[WARN] $*" >&2; }
die() { echo "[ERROR] $*" >&2; exit 1; }

confirm() {
  local prompt="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] would confirm: $prompt"
    return 0
  fi
  read -r -p "$prompt [y/N] " reply
  case "${reply,,}" in
    y|yes) return 0 ;;
    *) return 1 ;;
  esac
}

resolve_compose() {
  if command -v podman-compose >/dev/null 2>&1; then
    echo "podman-compose"
  elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
    echo "podman compose"
  else
    die "Need podman-compose or 'podman compose' on PATH"
  fi
}

load_dotenv() {
  if [[ ! -f .env ]]; then
    die ".env missing — copy .env.example → .env first"
  fi
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
}

set_env_key() {
  local key="$1" value="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] would set ${key}=$(mask_secret "$value") in .env"
    return
  fi
  if grep -q "^${key}=" .env 2>/dev/null; then
    # shellcheck disable=SC2016
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

gen_password() {
  openssl rand -base64 24 | tr -d '/+=' | head -c 24
}

gen_hex_secret() {
  openssl rand -hex 32
}

identity_base_url() {
  local host="${IDENTITY_PUBLIC_BASE:-http://localhost:8003}"
  echo "${host%/}"
}

rotate_identity_operator_password() {
  load_dotenv
  local email="${SEED_OPERATOR_EMAIL:-admin@eworld.local}"
  local base
  base="$(identity_base_url)"

  info "Identity operator password rotation (live DB user)"
  info "  API base: ${base}"
  info "  operator email: ${email}"
  warn "SEED_OPERATOR_PASSWORD only seeds an EMPTY users table."
  warn "For existing operators, use password-reset API (this flow)."

  read -r -p "Operator email [${email}]: " input_email
  if [[ -n "$input_email" ]]; then
    email="$input_email"
  fi

  local new_pw
  new_pw="$(gen_password)"
  info "Generated new password: $(mask_secret "$new_pw")"

  if ! confirm "Request password-reset token for ${email}?"; then
    info "Skipped identity password rotation."
    return
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] POST ${base}/api/v1/auth/password-reset/request"
    info "[dry-run] POST ${base}/api/v1/auth/password-reset/confirm (token + new password)"
    info "[dry-run] optional: set SEED_OPERATOR_PASSWORD for future empty-DB boots"
    return
  fi

  local reveal="${IDENTITY_PASSWORD_RESET_REVEAL:-false}"
  if [[ "${reveal,,}" != "true" && "${reveal,,}" != "1" ]]; then
    warn "IDENTITY_PASSWORD_RESET_REVEAL is not true — token may not appear in API response."
    warn "Set IDENTITY_PASSWORD_RESET_REVEAL=true in .env, recreate identity_service, or use SQL:"
    warn "  See EMPERY_CONTROL_CENTER.md § Operator password rotation (admin SQL path)."
    if ! confirm "Continue anyway (you must supply reset token manually)?"; then
      return
    fi
  fi

  local req_body resp token
  req_body=$(printf '{"email":"%s"}' "$email")
  resp="$(curl -sfS -X POST "${base}/api/v1/auth/password-reset/request" \
    -H 'Content-Type: application/json' \
    -d "$req_body")" || die "password-reset request failed (is identity_service up on ${base}?)"

  token="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("reset_token") or "")' <<<"$resp")"
  if [[ -z "$token" ]]; then
    warn "No reset_token in response (production-safe). Paste token from admin channel:"
    read -r -s token
    echo
  else
    info "Reset token received ($(mask_secret "$token"))"
  fi

  local confirm_body
  confirm_body=$(python3 -c 'import json,sys; print(json.dumps({"token":sys.argv[1],"new_password":sys.argv[2]}))' "$token" "$new_pw")
  curl -sfS -X POST "${base}/api/v1/auth/password-reset/confirm" \
    -H 'Content-Type: application/json' \
    -d "$confirm_body" >/dev/null \
    || die "password-reset confirm failed"

  info "Identity password updated for ${email}."
  local vault_file
  vault_file="$(mktemp "${TMPDIR:-/tmp}/empery-rotate-identity-XXXXXX")"
  chmod 600 "$vault_file"
  printf '%s\n' "$new_pw" >"$vault_file"
  info "New password saved to ${vault_file} (mode 600). Copy to vault, then: shred -u ${vault_file}"
  warn "Password not echoed to logs (masked only: $(mask_secret "$new_pw"))."
  if confirm "Also update SEED_OPERATOR_PASSWORD in .env for future seeds?"; then
    set_env_key SEED_OPERATOR_PASSWORD "$new_pw"
    warn "Recreate identity_service only when users table is empty (not needed for existing users)."
  fi
}

rotate_seed_operator_password() {
  load_dotenv
  info "SEED_OPERATOR_PASSWORD — empty-DB bootstrap secret in .env only"
  warn "Does NOT change an existing operator password. Use option 1 for live users."

  local new_pw
  new_pw="$(gen_password)"
  info "Generated: $(mask_secret "$new_pw")"

  if ! confirm "Update SEED_OPERATOR_PASSWORD in .env?"; then
    return
  fi
  set_env_key SEED_OPERATOR_PASSWORD "$new_pw"
  info "Updated SEED_OPERATOR_PASSWORD in .env."
  warn "Restart identity_service only when users table is empty (first boot)."
}

rotate_postgres_password() {
  load_dotenv
  local user="${POSTGRES_USER:-eworld}"
  local old_pw="${POSTGRES_PASSWORD:-}"
  local compose
  compose="$(resolve_compose)"

  info "Postgres password rotation (existing pgdata volume)"
  info "  user: ${user}"
  info "  current .env password: $(mask_secret "$old_pw")"

  if [[ -z "$old_pw" ]]; then
    die "POSTGRES_PASSWORD unset in .env"
  fi

  local new_pw
  new_pw="$(gen_hex_secret)"
  info "Generated new POSTGRES_PASSWORD: $(mask_secret "$new_pw")"

  cat <<EOF

Order of operations (do not skip):
  1. ALTER USER inside postgres container (uses CURRENT password from .env)
  2. Update POSTGRES_PASSWORD in .env
  3. Recreate dependent services so they pick up the new secret

EOF

  if ! confirm "Proceed with Postgres password rotation?"; then
    return
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "[dry-run] ${compose} -f compose.yml exec -T postgres psql ... ALTER USER"
    info "[dry-run] update POSTGRES_PASSWORD in .env"
    info "[dry-run] ${compose} -f compose.yml up -d --force-recreate (python deps)"
    return
  fi

  if ! $compose -f compose.yml exec -T postgres pg_isready -U "$user" -d postgres >/dev/null 2>&1; then
    die "Postgres container not ready — start stack first: ${compose} -f compose.yml up -d postgres"
  fi

  info "Running ALTER USER inside postgres container…"
  PGPASSWORD="$old_pw" $compose -f compose.yml exec -T postgres \
    psql -U "$user" -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER USER \"${user}\" WITH PASSWORD '${new_pw}';" \
    || die "ALTER USER failed — is POSTGRES_PASSWORD in .env still the live DB password?"

  set_env_key POSTGRES_PASSWORD "$new_pw"
  POSTGRES_PASSWORD="$new_pw"
  info "Updated POSTGRES_PASSWORD in .env."

  local services=(
    core_auth_service
    analytics_service
    identity_service
    task_orchestrator_service
    intelligence_service
    empery_intelligence_core
    empery_control_center_api
  )

  info "Recreating dependent services…"
  # shellcheck disable=SC2086
  $compose -f compose.yml up -d --force-recreate "${services[@]}"
  info "Postgres password rotation complete. Verify: ./scripts/smoke_convergence.sh"
}

menu() {
  cat <<'EOF'

Empery secret rotation
----------------------
1) Identity operator password (password-reset API — live DB)
2) SEED_OPERATOR_PASSWORD only (.env bootstrap for empty DB)
3) POSTGRES_PASSWORD (ALTER USER + .env + recreate dependents)
4) Quit

EOF
}

main() {
  [[ -f compose.yml ]] || die "Run from repo root (compose.yml missing)"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    warn "DRY-RUN mode — no mutations"
  fi

  while true; do
    menu
    read -r -p "Choice [1-4]: " choice
    case "$choice" in
      1) rotate_identity_operator_password ;;
      2) rotate_seed_operator_password ;;
      3) rotate_postgres_password ;;
      4|q|Q) info "Done."; exit 0 ;;
      *) warn "Invalid choice" ;;
    esac
    echo
  done
}

main "$@"
