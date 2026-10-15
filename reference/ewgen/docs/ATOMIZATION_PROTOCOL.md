# Atomization Protocol (Genesis Phase 1)

**Status:** Active · **Protocol version:** `1.0` · **Updated:** 2026-07-09  
**Package:** `EWGen/generators/atomization/`

Universal architectural unit (**Atom**) for wrapping existing system elements
(function, class, module, rule, service) into a portable, self-describing
document ready for later resynthesis (Genesis Phase 2+).

This is **not** a replacement for [SET Module Standard](./SET_MODULE_STANDARD.md)
or factory `ComponentSpec`. It is a parallel knowledge/container layer that
Scavenger and factory can feed later.

---

## Five layers

| Layer | Role | Key fields |
|-------|------|------------|
| **Essence** | Identity | `atom_id`, `semantic_name`, `kind`, `scale`, `lineage`, `composed_of` |
| **Capability** | Functionality | `capabilities`, `inputs`, `outputs`, `interface_ref` |
| **Gravity** | Connectivity | `depends_on`, `affects`, `blast` (scope + hops) |
| **Integrity** | Constraints | `invariants`, `contracts`, `health` (via `self_verify`) |
| **Context** | Knowledge | `purpose`, `intent`, `evidence`, `tags` |

`atom_id` is deterministic (`uuid5` over `origin_repo:path:symbol`).

Scales: **micro** (function/class) → **meso** (module) → **macro**
(service/world via `composed_of`). Phase 1 implements composition fields;
**Phase 2 Forge** welds Atoms into Macro-Atoms — see
[FORGE_RESYNTHESIS.md](./FORGE_RESYNTHESIS.md).

**ASE note (Stages 21+):** physical ESAL trees and import rewrites are owned by
the **Deterministic Core** (`generators/atomizer/`). The Cognitive Overlay must
never own structure — see [ESAL.md](./ESAL.md) and
`documentation/platform/EWGEN-AUTONOMOUS-SYNTHESIS-ENGINE.md`.

---

## Ingestion (Scavenger Logic)

```python
from generators.atomization import wrap_python_source, wrap_boundary_gate_sample

atom = wrap_python_source(
    "generators/scavenger/boundary_gate.py",
    symbol="validate_integration_sources",
    purpose="…",
)
# or canonical sample:
atom = wrap_boundary_gate_sample()
```

Rules:

- Offline AST only — no network.
- If `symbol=` is set but missing → **error** (no silent module fallback).
- Gravity edges from imports; relative imports marked local; stdlib/external
  unresolved.
- `self_verify()` fills `integrity.health`.

CLI:

```bash
cd EWGen
python3 -m generators.atomization.ingest \
  generators/scavenger/boundary_gate.py \
  --symbol validate_integration_sources
```

---

## Relation to existing tracks

| Track | Relationship |
|-------|----------------|
| Scavenger | Source of files to wrap; `boundary_gate` is the Phase 1 sample |
| Factory SDG | Edge roles aligned with `EdgeKind`; Atom does not replace SDG |
| SET Module Standard | Runtime slot contract; Atom is pre-runtime knowledge unit |
| DEWA / EWC | **Not wired in Phase 1** (no MissionBus executor) |

---

## Proof artifacts

| Artifact | Path |
|----------|------|
| Golden Atom JSON | `generators/atomization/samples/boundary_gate_validate_integration_sources.atom.json` |
| Regression tests | `generators/atomization/test_atomization_protocol.py` |

Note: `EWGen/tests/` is cursorignored in the monorepo; Phase 1 tests live next
to the package so agents can edit them. Pytest discovers both layouts.

```bash
cd EWGen
python3 -m pytest generators/atomization/test_atomization_protocol.py -q
```

---

## Phase boundary

| Phase 1 (this doc) | Phase 2 | Later |
|--------------------|---------|--------|
| Schema + ingest + self_verify | Forge `weld` / materialize | Atom catalog service |
| Sample from real EWGen code | Macro-Atom + manifest | DEWA/EWPower command path |
| Library API only | Conflict reject/refine | Interactive refining UI |

---

## Public API

Import from `generators.atomization`:

`Atom`, `wrap_python_source`, `wrap_boundary_gate_sample`, `self_verify`,
`atom_to_json` / `atom_from_json`, `dependency_symbol_refs`, `PROTOCOL_VERSION`.
