# Recipe: ops_dashboard

## Goal

Operator metrics / JTBD dashboard — tiles, KPIs, and list widgets. Assemble from EliteEW marketing-cabinet dashboard widgets; **not** a companion chat.

## Scaffold profile

- **`ops_dashboard`** (default) — metrics/KPI tiles + Postgres-backed entities; ECC ops_dashboard UI bundle
- Optional **`nervas_llm_peer`** pack for narrative summaries — must **not** steal profile to `peer_http` / companion

## Living peer

- Health: `GET /api/v1/health`
- Metrics/list APIs per design — real Postgres or peer HTTP only (`production-path.mdc`)
- Optional Nervas assist for narrative summaries — via EIC `/api/v1/nervas/chat`, not companion transcript UI

## Source parts

`reference/eliteew/packs/ops_dashboard/`

| Corpus | Role |
|--------|------|
| `upstream_fe/DashboardFavoritesSlotBody.tsx` | Desktop favorites slot layout |
| `upstream_fe/dashboardWidgetBody.tsx` | Widget tile body pattern |
| `upstream_api/dashboard_service.py` | Dashboard series/metrics service shape |

## Empery layout

```
services/{service_name}/src/api/routes.py     # metrics / widget config APIs
apps/empery_control_center/src/features/{feature}/   # ops screens
apps/empery_desktop/src/shell/mounts/{service_name}.tsx   # dashboard mount (peerApiBase)
.cursor/orchestration/eic/desktop_catalog/{service_name}.json
```

## Assembly steps

1. Match intent keywords: dashboard, дашборд, метрики, jtbd — **never** map bare `llm`/`ai` to companion.
2. `extract_adapt` from pack globs; forbid inventing companion chat when profile is `generic`.
3. ECC: list + detail/actions per `service-ui.mdc`; Desktop D1–D3 with real peer calls.
4. Verify: health + at least one metrics/list endpoint + mount not stub-only.

## Related recipes

`service_factory`, `nervas_llm_peer` (optional assist), `desktop_mount_catalog`, `verify_gates`.
