#!/usr/bin/env bash
# Grand Convergence smoke checks — safe to run without a full image pull.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
SKIP=0

ok() { echo "[PASS] $*"; PASS=$((PASS + 1)); }
bad() { echo "[FAIL] $*"; FAIL=$((FAIL + 1)); }
skip() { echo "[SKIP] $*"; SKIP=$((SKIP + 1)); }

echo "== Empery convergence smoke =="

# 1) Compose / deploy files present
for f in compose.yml docker-compose.yml deploy/docker/Dockerfile.python deploy/docker/Dockerfile.ui deploy/docker/Dockerfile.desktop deploy/postgres/init-databases.sql .env.example .dockerignore requirements.runtime.txt scripts/ew2_one_click_deploy.sh; do
  if [[ -f "$f" ]] || [[ -x "$f" ]]; then ok "exists $f"; else bad "missing $f"; fi
done

# 1b) Compose parity + WAVE 3 deploy hygiene
if cmp -s compose.yml docker-compose.yml; then
  ok "compose.yml ↔ docker-compose.yml parity"
else
  bad "compose.yml and docker-compose.yml differ"
fi
if [[ -x scripts/ew2_one_click_deploy.sh ]]; then
  ok "ew2_one_click_deploy.sh executable"
else
  bad "ew2_one_click_deploy.sh not executable"
fi
if grep -q 'target: runtime' compose.yml \
  && grep -q 'AS runtime' deploy/docker/Dockerfile.python \
  && grep -q 'AS runtime' deploy/docker/Dockerfile.ui; then
  ok "build.target runtime (compose + Dockerfiles)"
else
  bad "missing target: runtime / AS runtime"
fi
if grep -qE 'INTELLIGENCE_USE_FAKE_AI:.*false|INTELLIGENCE_USE_FAKE_AI:-false' compose.yml \
  && grep -qE 'EIC_LLM_BASE_URL:.*host\.containers\.internal:8080|EIC_LLM_BASE_URL:.*127\.0\.0\.1:8080' compose.yml; then
  ok "living-brain portable defaults in compose"
else
  bad "living-brain portable defaults missing from compose"
fi

# 2) Compose config validation
if command -v podman-compose >/dev/null 2>&1; then
  if podman-compose -f compose.yml config >/dev/null 2>&1; then
    ok "podman-compose config"
  else
    # some versions print to stderr but exit 0 only on success
    if podman-compose -f compose.yml config -q >/dev/null 2>&1; then
      ok "podman-compose config -q"
    else
      bad "podman-compose config failed"
    fi
  fi
elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  if podman compose -f compose.yml config >/dev/null 2>&1; then
    ok "podman compose config"
  else
    bad "podman compose config failed"
  fi
else
  skip "podman-compose / podman compose not available"
fi

# 3) Unit tests (EventBus + registry) — no Redis/Podman required
if command -v pytest >/dev/null 2>&1; then
  if pytest -q tests/test_event_bus_isolation.py tests/test_redis_event_bus.py tests/test_registry_trinity.py 2>/dev/null; then
    ok "pytest event_bus + registry"
  else
    # install redis client if missing
    pip install -q redis pytest-asyncio >/dev/null 2>&1 || true
    if pytest -q tests/test_event_bus_isolation.py tests/test_redis_event_bus.py tests/test_registry_trinity.py; then
      ok "pytest event_bus + registry (after deps)"
    else
      bad "pytest event_bus + registry"
    fi
  fi
else
  skip "pytest not installed"
fi

# 4) Optional live stack probe (only if already up)
if curl -sf "http://127.0.0.1:8006/api/v1/health" >/dev/null 2>&1; then
  ok "ECC health on :8006"
  if curl -sf "http://127.0.0.1:8005/api/v1/health" >/dev/null 2>&1; then
    ok "intelligence health on :8005"
  else
    bad "intelligence health on :8005"
  fi
  if curl -sf "http://127.0.0.1:8080/v1/models" >/dev/null 2>&1 \
     || curl -sf "http://127.0.0.1:8080/health" >/dev/null 2>&1 \
     || curl -sf "http://127.0.0.1:8080/" >/dev/null 2>&1; then
    ok "llama-cpp reachable on :8080"
  else
    skip "llama-cpp not reachable (model/image may be absent)"
  fi
else
  skip "full stack not running — start with: podman-compose up -d --build"
fi

echo "== Summary: pass=$PASS fail=$FAIL skip=$SKIP =="
[[ "$FAIL" -eq 0 ]]
