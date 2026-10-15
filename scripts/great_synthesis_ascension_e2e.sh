#!/usr/bin/env bash
# Great Synthesis Ascension — Phase 3 stress gate (Wave A+ criteria).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
SKIP=0

ok() { echo "PASS  $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL  $*"; FAIL=$((FAIL + 1)); }
skip() { echo "SKIP  $*"; SKIP=$((SKIP + 1)); }

echo "== Great Synthesis Ascension E2E =="

# 1) Unit/integration (in-memory bus allowed for pytest)
if EVENT_BUS_ALLOW_IN_MEMORY=true python3 -m pytest \
  tests/e2e/test_trinity_flow.py \
  tests/test_event_bus_isolation.py \
  tests/test_redis_event_bus.py \
  tests/test_registry_trinity.py \
  services/identity_service/tests \
  services/task_orchestrator_service/tests \
  services/intelligence_service/tests \
  services/empery_control_center_api/tests \
  services/empery_intelligence_core/tests \
  -q --tb=line; then
  ok "pytest trinity+ECC+EIC"
else
  bad "pytest trinity+ECC+EIC"
fi

# 2) FE typecheck
if (cd apps/empery_control_center && npm run typecheck); then
  ok "ECC UI typecheck"
else
  bad "ECC UI typecheck"
fi

# 3) Wave A contract greps (no silent regressions)
if grep -q 'runDemo: false' apps/empery_control_center/src/features/service-wizard/useWizardSession.ts; then
  ok "wizard runDemo default false"
else
  bad "wizard runDemo default false"
fi

if grep -q 'event_bus_backend' services/empery_control_center_api/src/data/schemas.py; then
  ok "ECC fabric health fields"
else
  bad "ECC fabric health fields"
fi

if [[ -f services/empery_intelligence_core/alembic.ini ]]; then
  ok "EIC Alembic present"
else
  bad "EIC Alembic present"
fi

if grep -q 'SEED_DEMO_USER.*false' .env.example && grep -q 'SEED_DEMO_USER: \${SEED_DEMO_USER:-false}' compose.yml; then
  ok "SEED_DEMO_USER default false"
else
  bad "SEED_DEMO_USER default false"
fi

# 4) Live stack (optional)
if [[ "${LIVE:-0}" == "1" ]]; then
  if curl -sf "http://127.0.0.1:8006/api/v1/health" | grep -q event_bus_backend; then
    ok "live ECC health fabric"
  else
    bad "live ECC health fabric"
  fi
  if [[ -x ./scripts/smoke_convergence.sh ]]; then
    if ./scripts/smoke_convergence.sh; then
      ok "smoke_convergence"
    else
      bad "smoke_convergence"
    fi
  fi
  if [[ -x ./scripts/grand_activation_e2e.sh ]]; then
    if LIVE=1 ./scripts/grand_activation_e2e.sh; then
      ok "grand_activation_e2e"
    else
      bad "grand_activation_e2e"
    fi
  fi
else
  skip "live stack (set LIVE=1)"
fi

echo "== Summary: pass=${PASS} fail=${FAIL} skip=${SKIP} =="
[[ "$FAIL" -eq 0 ]]
