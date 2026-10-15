# EliteEW → Empery task_board pack

## Intent

Kanban / task board UI patterns. Prefer Empery `task_board` scaffold profile + DomainItem/Task API.

## Upstream (RO — do not edit in place)

When available under `$ELITEEW_ROOT`:

- Task / board list surfaces in Desktop or Marketing cabinet
- Copy adapted TSX into `upstream_fe/` via corpus sync, then `extract_adapt`

## Empery adapt

- No EliteEW runtime imports
- Wire through ECC BFF + Desktop mount with `peerApiBase`
- Provenance: `user_created` on genesis capsules
