# Recipe: notes_tool

## Goal

Notes / блокнот / longread / типограф editor — TipTap local draft with optional Nervas Improve/Rewrite. Same family as `doc_editor`; may extend with lightweight CRUD list for note entities.

## Scaffold profile

- **`editor_local`** — TipTap mount + localStorage draft + Nervas assist via EIC
- **`generic`** only when design explicitly adds `{Entity}Item` list alongside editor (notes_crud pack)

## Living peer

- Draft: `localStorage` key `empery.desktop.{service_name}.draft`
- Assist: `VITE_EIC_API_BASE` → `POST /api/v1/nervas/chat` (Improve / Rewrite)
- Health: `GET /api/v1/health` → `nervas.ready` when assist enabled
- No FakeAI / companion transcript as primary UX

## Source parts

`reference/eliteew/packs/notes_crud/` + `reference/eliteew/packs/doc_editor/`

| Corpus | Role |
|--------|------|
| `upstream_fe/TiptapEditor.tsx` | TipTap surface (trimmed) |
| `doc_editor/core/DocEditorV2Core.tsx` | Save chrome + title |
| `doc_editor/shell/DocEditorV2Shell.tsx` | Rewrite affordance |

## Empery layout

```
apps/empery_desktop/src/shell/mounts/{service_name}.tsx
apps/empery_desktop/src/api/{service}Assist.ts   # optional
services/{service_name}/                        # when notes_crud + list API required
```

## Assembly steps

1. Prefer `doc_editor.md` + this pack when intent mentions notes, блокнот, notepad, longread, типограф.
2. Do **not** select `ewa_companion` unless intent also contains chat/чат/companion signals.
3. Desktop D1: real TipTap or adapted editor — not health-only stub.
4. Verify: type text → optional Improve → content updates on production Nervas path.

## Related recipes

`doc_editor`, `nervas_llm_peer`, `desktop_mount_catalog`, `verify_gates`.
