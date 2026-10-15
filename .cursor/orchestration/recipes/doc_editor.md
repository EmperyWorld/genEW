# Recipe: doc_editor

## Goal

TipTap document editor as a desktop-window app: local draft + Nervas rewrite/improve. Assemble from EliteEW DocEditorV2 core; no UltimateDocEditor megapage.

## Living peer

- Draft: `localStorage` key `empery.desktop.doc_editor.draft`
- Assist: `VITE_EIC_API_BASE` (default `http://127.0.0.1:8007`)
- Chat: `POST /api/v1/nervas/chat` — Improve / Rewrite (selection or full doc)
- Health: `GET /api/v1/health` → `nervas.ready`
- No FakeAI stubs

## Source parts

`reference/eliteew/packs/doc_editor/`

| Corpus | Role |
|--------|------|
| `core/DocEditorV2Core.tsx` | TipTap canvas + title/save chrome |
| `shell/DocEditorV2Shell.tsx` | Suggest-rewrite affordance shape |
| `api/documentEditorV2Api.ts` | EWA suggest HTTP shape (reference) |

**Out of scope:** UltimateDocEditor (~49k), Paperless, collab/yjs, OCR, guarded suggestion rail persistence.

## Empery layout

```
apps/empery_desktop/src/api/docEditorAssist.ts
apps/empery_desktop/src/shell/mounts/doc_editor.tsx
```

## Assembly steps

1. TipTap local draft first; Nervas assist via EIC (same path as Companion).
2. Improve / Rewrite: selection if present, else whole document; apply replaces content.
3. Persist after assist; surface Nervas readiness in chrome.
4. Verify: type text → Improve → content updates with `backend=local_llama`.

## Related recipes

`nervas_llm_peer`, `desktop_mount_catalog`, `verify_gates`.
