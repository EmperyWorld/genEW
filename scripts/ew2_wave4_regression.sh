#!/usr/bin/env bash
# Empery World 2.0 — Wave 4 Integration & QA regression orchestrator
# Suites: smoke → Trinity E2E → ECC/EIC unit → optional live grand_activation → FE build
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPORT_DIR="$ROOT/.cursor/orchestration/reports"
EVIDENCE="$REPORT_DIR/ew2_wave4_regression_evidence.json"
mkdir -p "$REPORT_DIR"

export PYTHONPATH="${PYTHONPATH:-}:$ROOT"

LIVE=0
SKIP_FE=0
for arg in "$@"; do
  case "$arg" in
    --live) LIVE=1 ;;
    --skip-fe) SKIP_FE=1 ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/ew2_wave4_regression.sh [--live] [--skip-fe]

  --live     Run grand_activation_e2e.sh (also: LIVE=1 or EW2_LIVE=1)
  --skip-fe  Skip FE typecheck+build
EOF
      exit 0
      ;;
  esac
done

if [[ "${LIVE:-0}" == "1" || "${EW2_LIVE:-0}" == "1" ]]; then
  LIVE=1
fi

PASS=0
FAIL=0
SKIP=0
declare -a RESULTS=()

ts_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
STARTED_AT="$(ts_iso)"

record() {
  local id="$1" status="$2" note="${3:-}"
  RESULTS+=("$id|$status|$note")
  case "$status" in
    PASS) PASS=$((PASS + 1)); echo "[PASS] $id${note:+ — $note}" ;;
    FAIL) FAIL=$((FAIL + 1)); echo "[FAIL] $id${note:+ — $note}" ;;
    SKIP) SKIP=$((SKIP + 1)); echo "[SKIP] $id${note:+ — $note}" ;;
  esac
}

run_suite() {
  local id="$1"
  shift
  echo ""
  echo "== $id =="
  echo "\$ $*"
  if "$@"; then
    record "$id" "PASS"
    return 0
  else
    local rc=$?
    record "$id" "FAIL" "exit=$rc"
    return "$rc"
  fi
}

echo "== Empery World 2.0 Wave 4 regression =="
echo "ROOT=$ROOT"
echo "LIVE=$LIVE SKIP_FE=$SKIP_FE"
echo "started_at=$STARTED_AT"

# E2E-0 — smoke / preflight
if [[ -x "$ROOT/scripts/smoke_convergence.sh" ]]; then
  run_suite "E2E-0_smoke_convergence" "$ROOT/scripts/smoke_convergence.sh" || true
else
  record "E2E-0_smoke_convergence" "FAIL" "script missing or not executable"
fi

# E2E-1 — in-process Trinity
if command -v pytest >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1; then
  run_suite "E2E-1_trinity_flow" python3 -m pytest tests/e2e/test_trinity_flow.py -q || true
else
  record "E2E-1_trinity_flow" "SKIP" "pytest/python3 unavailable"
fi

# E2E-5 + E2E-6 — ECC API + EIC
run_suite "E2E-5_ecc_api" python3 -m pytest services/empery_control_center_api/tests -q || true
run_suite "E2E-6_eic" python3 -m pytest services/empery_intelligence_core/tests -q || true

# E2E-4 — optional live grand activation
if [[ "$LIVE" == "1" ]]; then
  if curl -sf -m 3 "http://127.0.0.1:8003/api/v1/health" >/dev/null 2>&1 \
     && curl -sf -m 3 "http://127.0.0.1:8006/api/v1/health" >/dev/null 2>&1; then
    run_suite "E2E-4_grand_activation" "$ROOT/scripts/grand_activation_e2e.sh" || true
  else
    record "E2E-4_grand_activation" "FAIL" "LIVE requested but stack not healthy on :8003/:8006"
  fi
else
  record "E2E-4_grand_activation" "SKIP" "set LIVE=1 / EW2_LIVE=1 or pass --live"
fi

# E2E-7 — FE typecheck + build
if [[ "$SKIP_FE" == "1" ]]; then
  record "E2E-7_fe_build" "SKIP" "--skip-fe"
elif ! command -v npm >/dev/null 2>&1; then
  record "E2E-7_fe_build" "SKIP" "npm unavailable"
elif [[ ! -d "$ROOT/apps/empery_control_center" ]]; then
  record "E2E-7_fe_build" "FAIL" "apps/empery_control_center missing"
else
  echo ""
  echo "== E2E-7_fe_build =="
  echo "\$ npm run typecheck && npm run build (in apps/empery_control_center)"
  if (
    cd "$ROOT/apps/empery_control_center"
    npm run typecheck && npm run build
  ); then
    record "E2E-7_fe_build" "PASS"
  else
    record "E2E-7_fe_build" "FAIL" "typecheck/build failed"
  fi
fi

FINISHED_AT="$(ts_iso)"

echo ""
echo "== Wave 4 regression summary =="
echo "pass=$PASS fail=$FAIL skip=$SKIP"
for row in "${RESULTS[@]}"; do
  IFS='|' read -r id status note <<<"$row"
  printf '  %-28s %-4s %s\n' "$id" "$status" "$note"
done

# Evidence JSON
python3 - "$EVIDENCE" "$STARTED_AT" "$FINISHED_AT" "$PASS" "$FAIL" "$SKIP" "${RESULTS[@]}" <<'PY'
import json, sys
from pathlib import Path

out, started, finished, pass_n, fail_n, skip_n = sys.argv[1:7]
rows = sys.argv[7:]
suites = []
for row in rows:
    parts = row.split("|", 2)
    suites.append({
        "id": parts[0],
        "status": parts[1] if len(parts) > 1 else "UNKNOWN",
        "note": parts[2] if len(parts) > 2 else "",
    })
doc = {
    "artifact": "ew2_wave4_regression_evidence",
    "started_at": started,
    "finished_at": finished,
    "summary": {
        "pass": int(pass_n),
        "fail": int(fail_n),
        "skip": int(skip_n),
    },
    "suites": suites,
}
Path(out).write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
print(f"evidence written: {out}")
PY

[[ "$FAIL" -eq 0 ]]
