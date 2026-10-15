# EliteEW extract — provenance

**Source (read-only):** `/home/owned/powered_by_emperyworld/EliteEW/`  
**Policy:** never modify EliteEW from this repo. Copy → adapt here → distribute into Empery anatomy.

## Why this tree exists

Corpus for LLM **assembly recipes** and human porting. Not a runtime import path.
Do not `import` from `reference/eliteew` in `services/` or `apps/` production code.

## What was copied (slice 1 — desktop kernel)

| Area | Path in extract | Intent |
|------|-----------------|--------|
| FE shell | `desktop/frontend/pages/Desktop/` | Workspace, windows, icons, shell hooks/types |
| API domain | `desktop/api/domains/desktop.py` | How EliteEW registers desktop routers |
| ORM shapes | `desktop/api/models/desktop.py` | Config / items / catalog concepts |
| Bootstrap | `desktop/api/schemas/` + `services/desktop_shell_bootstrap*` | Cold-path shell snapshot |
| Shell routers | `desktop/api/routers/desktop_shell*.py`, `desktop_items`, `desktop_store`, … | HTTP surface for shell |

## Explicitly excluded (slice 1)

- `pages/Desktop/apps/**` (product apps)
- Admin mega-pages, App Store UI packs, GAF chat, voice/video call pipelines, ewDesk news
- Marketing / Site Studio / KIRS / Poemma routers
- Tests and fixtures

## Packs

| Pack | Path |
|------|------|
| window_snap | `packs/window_snap/` — edge snap geometry + preview corpus |
| doc_editor | `packs/doc_editor/` — DocEditorV2 TipTap core/shell/api corpus |
| studios | `packs/studios/` — CreativeStudio chrome + ImageStudio + ComfyUI workflow/client corpus |
| video_studio | `packs/video_studio/` — VideoStudio page/workspace + API corpus |
| music_forge | `packs/music_forge/` — MusicForge user app + API/OpenAPI corpus (no Admin) |
| ewa_companion | `packs/ewa_companion/` — CompanionSlim dock + EwaDesktopApp mount corpus |
| site_studio | `packs/site_studio/` — UserSiteStudio desktop atom (admin excluded) |

## Next slices (later)

Marketing cabinet; deeper Site Studio tabs when needed.
