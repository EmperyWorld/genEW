# Recipe: window_snap

## Goal

Edge/corner window snap with preview overlay on the Empery desktop host.

## Source parts (EliteEW extract pack)

`reference/eliteew/packs/window_snap/`

| Corpus | Role |
|--------|------|
| `hooks/useWindowSnap.ts` | Zone detect + apply (simple) |
| `hooks/useWindowManagerSnap.ts` | WM integration helpers |
| `utils/desktopSnapGeometry.ts` | Work-area rects / zones |
| `utils/desktopWindowGeometry.ts` | Cascade / maximize bounds |
| `components/SnapPreview.tsx` | Preview overlay |
| `components/DesktopSnapTeachOverlay.tsx` | Teach UI (optional later) |

## Empery layout (already / target)

```
apps/empery_desktop/src/shell/snap.ts          # detect + rect (adapted)
apps/empery_desktop/src/shell/SnapPreview.tsx  # preview
apps/empery_desktop/src/shell/useWindowManager.ts  # snapWindow()
apps/empery_desktop/src/shell/DesktopWindow.tsx    # drag → preview → apply
```

## Assembly steps

1. Read corpus under `reference/eliteew/packs/window_snap/` — do not import it.
2. Keep runtime in Empery shell modules only.
3. Zones: left/right/maximize + four corners (thirds optional later).
4. Preview while dragging titlebar; apply on pointer-up.
5. Taskbar height reserved (56px) — never cover taskbar.
6. Verify: drag window to left edge → half-screen; top → maximize.

## Out of scope

Saved snap presets, teach overlay, multi-monitor, RDP blur variants.
