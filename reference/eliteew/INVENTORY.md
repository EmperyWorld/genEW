# Extract inventory (slice 1)

Generated at copy time from EliteEW desktop kernel.

## Counts

- Frontend TS/TSX under `desktop/frontend/`: ~618 files / ~125k LOC
- API Python under `desktop/api/`: 18 files / ~6.5k LOC

## Empery mapping in progress

| Extract concept | Empery home |
|-----------------|-------------|
| Shell bootstrap envelope | `services/desktop_shell` `/api/v1/shell-bootstrap` |
| Desktop items / icons | `services/desktop_shell` `/api/v1/items` + `apps/empery_desktop` |
| Window chrome / taskbar | adapt next from FE extract → `apps/empery_desktop/src/shell` |
| App Store / GAF / studios | later recipe packs |

## Note

Extract code keeps EliteEW import paths (`api.*`, deep relative FE imports). It is **corpus**, not runnable as-is.
