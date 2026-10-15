# empery_desktop

Product desktop host for Empery.

- Slice 1: bootstrap from `desktop_shell`
- Slice 2: window manager, titlebar chrome, taskbar, start menu

EliteEW sources (read-only corpus): `reference/eliteew/desktop/`.
Do not import that tree at runtime — adapt parts into this app.

## Run (production path — Podman)

```bash
# from repo root
BUILDAH_FORMAT=docker podman-compose -f compose.yml up -d --build empery_desktop_ui
# → http://localhost:5174  (DESKTOP_UI_HOST_PORT)
```

## Run (local Vite — Hands / hot mounts)

```bash
pnpm install
pnpm dev       # http://localhost:5174
```

Env (Vite / bake args):

- `VITE_DESKTOP_SHELL_API_BASE` — default remaps to page host `:8020`
- `VITE_ECC_UI_BASE` — default `http://<page-host>:5173` (Control Center / Autonomous iframes)
- Compose: `DESKTOP_UI_HOST_PORT` (default `5174`)
