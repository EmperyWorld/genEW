# SOURCE — ops_dashboard pack

Read-only EliteEW upstream (never import at runtime). Copy/adapt into Empery targets.

## Upstream (EliteEW)

- `web/frontend/src/pages/Desktop/components/DashboardFavoritesSlotBody.tsx`
- `web/frontend/src/pages/MarketingCabinet/dashboard-widgets/dashboardWidgetBody.tsx`
- `api/services/marketing_cabinet/dashboard_service.py`

## Local extract

- `reference/eliteew/packs/ops_dashboard/upstream_fe/`
- `reference/eliteew/packs/ops_dashboard/upstream_api/`

## Empery targets

- `services/loshkovskiy/` — metrics/list API
- `apps/empery_desktop/src/shell/mounts/loshkovskiy.tsx`
- ECC feature module per design
