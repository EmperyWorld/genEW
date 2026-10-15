#!/usr/bin/env bash
# Market Ascension — production SaaS gate.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
SKIP=0

ok() { echo "PASS  $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL  $*"; FAIL=$((FAIL + 1)); }
skip() { echo "SKIP  $*"; SKIP=$((SKIP + 1)); }

echo "== Market Ascension E2E =="

# 1) Auth BFF + Identity + ECC unit tests
if EVENT_BUS_ALLOW_IN_MEMORY=true python3 -m pytest \
  services/empery_control_center_api/tests/test_auth_bff.py \
  services/identity_service/tests \
  services/empery_control_center_api/tests/test_health.py \
  -q --tb=line; then
  ok "pytest auth+health"
else
  bad "pytest auth+health"
fi

# 2) FE typecheck
if (cd apps/empery_control_center && npm run typecheck); then
  ok "ECC UI typecheck"
else
  bad "ECC UI typecheck"
fi

# 3) Contract greps — secure-by-default
if grep -qE 'ECC_REQUIRE_AUTH: \$\{ECC_REQUIRE_AUTH:-true\}' compose.yml; then
  ok "compose ECC_REQUIRE_AUTH default true"
else
  bad "compose ECC_REQUIRE_AUTH default true"
fi

if grep -q 'SEED_DEMO_USER: \${SEED_DEMO_USER:-false}' compose.yml; then
  ok "SEED_DEMO_USER default false"
else
  bad "SEED_DEMO_USER default false"
fi

if grep -q 'EVENT_BUS_ALLOW_IN_MEMORY: "false"' compose.yml; then
  ok "EVENT_BUS_ALLOW_IN_MEMORY false"
else
  bad "EVENT_BUS_ALLOW_IN_MEMORY false"
fi

if cmp -s compose.yml docker-compose.yml; then
  ok "compose.yml ≡ docker-compose.yml"
else
  bad "compose.yml ≡ docker-compose.yml"
fi

if grep -q 'auth_required' services/empery_control_center_api/src/data/schemas.py; then
  ok "health auth_required field"
else
  bad "health auth_required field"
fi

if [[ -f apps/empery_control_center/src/features/auth/RegisterPage.tsx ]]; then
  ok "RegisterPage present"
else
  bad "RegisterPage present"
fi

if [[ -f apps/empery_control_center/e2e/golden-path.spec.ts ]]; then
  ok "Playwright golden-path spec"
else
  bad "Playwright golden-path spec"
fi

# 4) Live stack + Playwright (optional)
if [[ "${LIVE:-0}" == "1" ]]; then
  if curl -sf "http://127.0.0.1:8006/api/v1/health" | grep -q auth_required; then
    ok "live ECC health auth_required"
  else
    bad "live ECC health auth_required"
  fi

  if (cd apps/empery_control_center && npx playwright test --reporter=list); then
    ok "Playwright golden path"
  else
    bad "Playwright golden path"
  fi
else
  skip "LIVE=1 Playwright + live health"
fi

echo ""
echo "RESULT pass=$PASS fail=$FAIL skip=$SKIP"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
