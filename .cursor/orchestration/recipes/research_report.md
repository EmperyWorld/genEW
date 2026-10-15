# Recipe: research_report

## Goal

Marketing / analyst research reports — structured report store plus optional Nervas narrative. **Not** a companion transcript UI.

## Scaffold profile

- **`research_report`** — report entities + ECC research UI bundle (`reports` peer route)
- May also select `nervas_llm_peer` for generate/summarize — profile must stay `research_report`, not `peer_http`

## Living peer

- Health: `GET /api/v1/health`
- Reports API + optional EIC Nervas generate via BFF
- Real Postgres; no FakeAI

## Source parts

`reference/eliteew/packs/research_report/`

| Corpus | Role |
|--------|------|
| `SOURCE.md` | Upstream hints + Empery adapt notes |

## Empery layout

```
services/{service_name}/
apps/empery_control_center/src/features/{feature}/
apps/empery_desktop/src/shell/mounts/{service_name}.tsx
```

## Assembly steps

1. Match: research, исследован, market/marketing report, report builder.
2. Packs: `research_report.md` + optional `nervas_llm_peer.md`.
3. Verify: list/create report + optional Nervas generate on production path.

## Related recipes

`nervas_llm_peer`, `service_factory`, `verify_gates`.
