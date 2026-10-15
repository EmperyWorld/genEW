# EliteEW → Empery research_report pack

## Intent

Structured research / marketing reports with optional Nervas narrative. Profile `research_report` — not companion chat.

## Upstream (RO)

- Report list / detail surfaces when present in EliteEW
- Nervas generate via Empery `core/integration/nervas.py` + EIC peer (already in extract_globs)

## Empery adapt

- Reports stored in service Postgres
- Generate calls go EIC Nervas — never FakeAI in `src/`
