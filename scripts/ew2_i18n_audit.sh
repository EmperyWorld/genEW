#!/usr/bin/env bash
# Empery World 2.0 — Wave 4 localization audit (hardcoded English inventory)
# Heuristic scan over ECC FE source; excludes node_modules, locale JSON, technical tokens.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/apps/empery_control_center/src"
REPORT_DIR="$ROOT/.cursor/orchestration/reports"
FRAGMENT="$REPORT_DIR/ew2_i18n_audit_fragment.md"

WRITE_FRAGMENT=1
for arg in "$@"; do
  case "$arg" in
    --stdout-only) WRITE_FRAGMENT=0 ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/ew2_i18n_audit.sh [--stdout-only]

Greps apps/empery_control_center/src for likely hardcoded English UI strings.
Writes .cursor/orchestration/reports/ew2_i18n_audit_fragment.md unless --stdout-only.
EOF
      exit 0
      ;;
  esac
done

if [[ ! -d "$SRC" ]]; then
  echo "ERROR: FE src not found: $SRC" >&2
  exit 1
fi

if ! command -v rg >/dev/null 2>&1; then
  echo "ERROR: ripgrep (rg) required" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Collect candidate lines via Python (avoids bash quote-escaping landmines with rg -e)
python3 - "$SRC" "$TMP_DIR/all.txt" <<'PY'
from __future__ import annotations

import re
from pathlib import Path

import sys

src_root = Path(sys.argv[1])
out_path = Path(sys.argv[2])

# Likely user-visible English in source (not via t(...))
patterns = [
    re.compile(r">([A-Z][A-Za-z0-9 ,.\-!?]{2,})<"),
    re.compile(r"""\b(aria-label|placeholder|title|label)=["']([^"']+)["']"""),
    re.compile(r"""\b(aria-label|placeholder|title|label):\s*["']([^"']+)["']"""),
    re.compile(
        r"""["']([^"']*\b(?:Enter Ops|Ops|Autonomous|Wizard|Sandbox|Dismiss|Connected|Reconnecting|Submit|Loading|Error|Failed|Success|Primary|Command|Insight|Registry|Health|Close|Refresh|Cancel|Retry|Save|Delete|Search|Empty|Offline|Standby|Live)\b[^"']*)["']"""
    ),
]

# Skip technical / non-chrome tokens
tech_re = re.compile(
    r"("
    r"className|data-testid|console\.(log|warn|error|debug)|error_code|"
    r"topic\.|/api/v1|task\.created|task\.insight|FakeAI|local-deterministic|"
    r"Bearer |Content-Type|Authorization|application/json|"
    r"z-index|px-|rem-|hsl\(|rgb\(|var\(--|lucide-|@radix|framer-motion|"
    r"react-router|useQuery|useMutation|queryKey|"
    r"t\(|useTranslation|i18n\.|namespaces?"
    r")"
)

# Skip pure keys / identifiers
keyish_re = re.compile(r"^[a-z][a-zA-Z0-9_.-]*$")
# Must contain at least one Latin letter word starting with capital OR known UI word
latin_ui_re = re.compile(r"[A-Za-z]{2,}")

hits: list[str] = []
for path in sorted(src_root.rglob("*")):
    if not path.is_file():
        continue
    if path.suffix not in {".ts", ".tsx"}:
        continue
    rel = path.as_posix()
    if any(part in rel for part in ("/node_modules/", "/i18n/locales/")):
        continue
    if path.name.endswith(".d.ts"):
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        continue
    for i, line in enumerate(text.splitlines(), 1):
        if tech_re.search(line):
            continue
        if "t(" in line and "aria-label={t(" in line:
            continue
        matched = False
        captured: list[str] = []
        for pat in patterns:
            for m in pat.finditer(line):
                groups = [g for g in m.groups() if g]
                val = groups[-1] if groups else m.group(0)
                if keyish_re.match(val.strip()):
                    continue
                if not latin_ui_re.search(val):
                    continue
                # Skip template/translation-looking keys
                if re.fullmatch(r"[a-z]+(\.[a-zA-Z0-9_]+)+", val.strip()):
                    continue
                captured.append(val)
                matched = True
        if matched:
            # Dedupe by file:line
            hits.append(f"{path}:{i}:{line.strip()}")

# Unique preserve order
seen: set[str] = set()
uniq: list[str] = []
for h in hits:
    if h in seen:
        continue
    seen.add(h)
    uniq.append(h)

out_path.write_text("\n".join(uniq) + ("\n" if uniq else ""), encoding="utf-8")
print(f"raw_hits={len(uniq)}")
PY

TOTAL=$(wc -l <"$TMP_DIR/all.txt" | tr -d ' ')
if [[ ! -s "$TMP_DIR/all.txt" ]]; then
  TOTAL=0
fi
FILES_HIT=0
if [[ -s "$TMP_DIR/all.txt" ]]; then
  FILES_HIT=$(awk -F: '{print $1}' "$TMP_DIR/all.txt" | sort -u | wc -l | tr -d ' ')
  awk -F: '{print $1}' "$TMP_DIR/all.txt" | sort | uniq -c | sort -rn >"$TMP_DIR/by_file.txt"
else
  : >"$TMP_DIR/by_file.txt"
fi

# Locale catalog stats + residual English-looking Russian values
python3 - "$ROOT" "$TMP_DIR/locale_stats.txt" <<'PY'
import json, re, sys
from pathlib import Path

root = Path(sys.argv[1])
out = Path(sys.argv[2])
en_p = root / "apps/empery_control_center/src/i18n/locales/en/common.json"
ru_p = root / "apps/empery_control_center/src/i18n/locales/ru/common.json"

def leaves(obj, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from leaves(v, f"{prefix}.{k}" if prefix else k)
    elif isinstance(obj, str):
        yield prefix, obj

en = json.loads(en_p.read_text()) if en_p.exists() else {}
ru = json.loads(ru_p.read_text()) if ru_p.exists() else {}

en_n = sum(1 for _ in leaves(en))
ru_n = sum(1 for _ in leaves(ru))

# Cyrillic present?
cyr = re.compile(r"[\u0400-\u04FF]")
# English-looking residual in ru (no cyrillic, has Latin letters, length>2)
residual = []
for key, val in leaves(ru):
    if not isinstance(val, str):
        continue
    if cyr.search(val):
        continue
    if re.search(r"[A-Za-z]{3,}", val):
        residual.append((key, val))

out.write_text(
    "\n".join(
        [
            f"en_leaves={en_n}",
            f"ru_leaves={ru_n}",
            f"ru_latin_residual={len(residual)}",
            *[f"residual\t{k}\t{v}" for k, v in residual[:80]],
        ]
    )
    + "\n",
    encoding="utf-8",
)
print(f"en_leaves={en_n} ru_leaves={ru_n} ru_latin_residual={len(residual)}")
PY

EN_LEAVES=$(grep -E '^en_leaves=' "$TMP_DIR/locale_stats.txt" | cut -d= -f2)
RU_LEAVES=$(grep -E '^ru_leaves=' "$TMP_DIR/locale_stats.txt" | cut -d= -f2)
RU_LATIN=$(grep -E '^ru_latin_residual=' "$TMP_DIR/locale_stats.txt" | cut -d= -f2)

I18N_HITS=$(rg -n --glob '!**/node_modules/**' \
  -e 'i18n|useTranslation|react-i18next|i18next|locale|locales/' \
  "$ROOT/apps/empery_control_center" 2>/dev/null | wc -l | tr -d ' ' || echo 0)

DATE_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

render() {
  cat <<EOF
# EW2 i18n Audit Fragment

**Date:** $DATE_UTC  
**Target:** \`apps/empery_control_center/src\`  
**Methodology:** Wave 4 §7 grep inventory (hardcoded English heuristic)  
**Exclusions:** node_modules, i18n locale JSON, technical tokens (API paths, CSS vars, test ids, \`t()\` calls)

## Summary

| Metric | Value |
|--------|------:|
| Likely hardcoded English matches (source) | $TOTAL |
| Files with hardcoded matches | $FILES_HIT |
| EN locale string leaves | ${EN_LEAVES:-0} |
| RU locale string leaves | ${RU_LEAVES:-0} |
| RU values still Latin/English-looking | ${RU_LATIN:-0} |
| i18n scaffolding grep hits (informational) | $I18N_HITS |

## Hotspots (hardcoded in source, by file)

| Matches | File |
|--------:|------|
EOF

  if [[ ! -s "$TMP_DIR/by_file.txt" ]]; then
    echo "| 0 | _(none — UI chrome largely via i18n)_ |"
  else
    while read -r count path; do
      [[ -z "${count:-}" ]] && continue
      rel="${path#"$ROOT/"}"
      echo "| $count | \`$rel\` |"
    done <"$TMP_DIR/by_file.txt"
  fi

  cat <<'EOF'

## Sample hardcoded matches (first 40)

```
EOF
  if [[ -s "$TMP_DIR/all.txt" ]]; then
    head -n 40 "$TMP_DIR/all.txt" | sed "s|$ROOT/||g"
  else
    echo "(none)"
  fi
  cat <<'EOF'
```

## RU Latin residual samples (first 40)

| Key | Value |
|-----|-------|
EOF
  grep $'^residual\t' "$TMP_DIR/locale_stats.txt" | head -n 40 | while IFS=$'\t' read -r _ key val; do
    echo "| \`$key\` | $val |"
  done
  if ! grep -q $'^residual\t' "$TMP_DIR/locale_stats.txt"; then
    echo "| _(none)_ | |"
  fi

  cat <<'EOF'

## Notes

- Wave 4 gate: inventory complete (L10N-01/02). Full `ru` default / toggle may already be present; residual Latin in `ru` and hardcoded source strings are debt.
- Technical identifiers (registry names, topics, error_codes) intentionally excluded.
EOF
}

REPORT="$(render)"
echo "$REPORT"

if [[ "$WRITE_FRAGMENT" == "1" ]]; then
  mkdir -p "$REPORT_DIR"
  printf '%s\n' "$REPORT" >"$FRAGMENT"
  echo ""
  echo "fragment written: $FRAGMENT"
fi

echo ""
echo "== i18n audit: hardcoded=$TOTAL files=$FILES_HIT ru_latin_residual=${RU_LATIN:-0} =="
