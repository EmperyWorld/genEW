# Empery Control Center (ECC)

Signal Obsidian SPA — human-facing Plug & Play command deck for Empery World.

## Stack

Vite 6 · React 18 · TypeScript · Tailwind · Framer Motion · Lucide · React Flow (`@xyflow/react`) · Zustand · TanStack Query

## Prerequisites

- Node 20+ and npm
- ECC API gateway running on **port 8006** (`services/empery_control_center_api`)

## Setup

```bash
cd apps/empery_control_center
cp .env.example .env
npm install
npm run dev
```

Dev server defaults to `http://localhost:5173`.

### Point the UI at the API (port 8006)

`.env` (from `.env.example`):

```env
# Same machine:
# VITE_ECC_API_BASE=http://localhost:8006
# VITE_ECC_WS_URL=ws://localhost:8006/api/v1/ws/events

# LAN (open UI as http://<host-ip>:5173 — e.g. http://192.168.1.136:5173):
VITE_ECC_API_BASE=http://192.168.1.136:8006
VITE_ECC_WS_URL=ws://192.168.1.136:8006/api/v1/ws/events
```

If the baked/env API URL is still `localhost` but you open the UI via a LAN IP, `src/config.ts` remaps API/WS to that page host `:8006`.

REST calls go through `src/api/http.ts` (`eccFetch`) → `{VITE_ECC_API_BASE}/api/v1/...`.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run typecheck` | TypeScript project check |

## Routes

| Path | Layout | Notes |
|------|--------|-------|
| `/` | Focus | Brand-first landing |
| `/ops`, `/ops/map`, `/ops/console`, `/ops/feed` | Command | Map + Console + Feed |
| `/wizard`, `/wizard/:sessionId` | Focus | Service Wizard |
| `/sandbox`, `/sandbox/:sessionId` | Focus | Interactive Sandbox |

## Visual language

**Signal Obsidian** — void field, phosphor `#3DDC97`, brass `#B08D57`. See `src/styles/tokens.css`.

Aesthetic bans: purple-indigo gradients, cream+terracotta, broadsheet, emoji spam, glow-everything, rounded-full pill clusters.

## Ownership

**Shell (Implementer 2):** Vite/Tailwind scaffold, Signal Obsidian theme, AppShell/CommandLayout/FocusLayout, routes, Zustand slices, `api/http.ts` + `api/types.ts`, shell chrome (`BrandMark`, `NavPrimary`, `StatusBeacon`, `ThemeProvider`).

**Features (Implementer 3):** Map / Console / Wizard / Feed / Sandbox under `src/features/*` (plus shared `src/components/`).

**Realtime (Implementer 4):** `src/api/ws.ts`, `src/hooks/useEccSocket.ts` — shell mounts via `SocketBridge`.
