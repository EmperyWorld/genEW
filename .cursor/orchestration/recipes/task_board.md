# Recipe: task_board

## Goal

Kanban / task board — columns and tasks for operator work tracking. Assemble from EliteEW task UI patterns when present; **not** a companion chat.

## Scaffold profile

- **`task_board`** — DomainItem (or Task) entities + ECC board UI bundle (`tasks` peer route)
- Forbid defaulting to `companion_chat` / bare `peer_http` for «канбан / задачи board» intents

## Living peer

- Health: `GET /api/v1/health`
- Task CRUD via service API + ECC BFF (Postgres, `AUTO_CREATE_TABLES=false`, Alembic)
- No FakeAI / demo seed as happy path

## Source parts

`reference/eliteew/packs/task_board/`

| Corpus | Role |
|--------|------|
| `SOURCE.md` | Upstream hints + Empery adapt notes |

## Empery layout

```
services/{service_name}/src/api/routes.py
apps/empery_control_center/src/features/{feature}/
apps/empery_desktop/src/shell/mounts/{service_name}.tsx
.cursor/orchestration/eic/desktop_catalog/{service_name}.json
```

## Assembly steps

1. Match: kanban, task board, задачи, доска задач — never companion unless chat signal.
2. `extract_adapt` from pack globs; UI profile `task_board`.
3. Verify: health + task list create + Desktop mount not stub-only.

## Related recipes

`service_factory`, `desktop_mount_catalog`, `verify_gates`.
