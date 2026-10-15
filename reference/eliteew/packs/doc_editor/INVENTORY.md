# DocEditorV2 reference pack — inventory

| Path | Role |
|------|------|
| `core/DocEditorV2Core.tsx` | TipTap editor core UI/component |
| `core/types.ts` | Shared DocEditorV2 types |
| `core/docEditorV2State.ts` | Core editor state helpers |
| `core/index.ts` | Feature barrel exports |
| `shell/DocEditorV2Shell.tsx` | Shell / chrome wrapper around core |
| `shell/docEditorV2PreviewState.ts` | Preview-mode state for shell |
| `api/documentEditorV2Api.ts` | EliteEW API client (reference only) |
| `SOURCE.md` | Provenance / absolute source paths |
| `INVENTORY.md` | This file |

## Out of scope

- **UltimateDocEditor** — not included; OUT OF SCOPE for this pack.

## npm dependencies (EliteEW)

- `@tiptap/react`
- `@tiptap/starter-kit`

## Empery adaptation notes

Empery must adapt / stub:

- `cn` (className utility)
- i18n
- DesktopApp chrome
