# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**focusServer** is a macOS website blocker. A Node.js server periodically enforces blocking rules via macOS PF firewall and `/etc/hosts`, with a Chrome extension for status display. Documentation and comments are in French.

## Monorepo Structure

pnpm monorepo (`pnpm@10.2.1`) with four packages:

- **`apps/server`** — Express REST API (CommonJS). Runs a tick loop every 60s to calculate and apply blocking mode via `sudo focus-apply.sh`. Port 5959, localhost only.
- **`apps/extension`** — Chrome MV3 extension popup. Calls the server's `/health` endpoint.
- **`packages/shared`** — Shared TypeScript types (`FocusMode`, `FocusStatus`, API response types). Single source of truth for API contracts.
- **`packages/api-client`** — HTTP client factory (`createFocusApiClient()`) wrapping server endpoints.

Dependency flow: `shared` ← `api-client` ← `extension`, `shared` ← `server`.

## Build & Dev Commands

```bash
pnpm install                # Install all dependencies
pnpm dev:server             # Build shared + run server in watch mode
pnpm build:server           # Build shared + server
pnpm build:extension        # Build shared + extension
pnpm build                  # Build all packages
pnpm format                 # Prettier format all files
pnpm format:check           # Check formatting
```

Build is TypeScript-only (`tsc`), no bundler. Shared must be built before server or extension.

## Installation (macOS system-level)

```bash
chmod +x scripts/*.sh
sudo ./scripts/install.sh     # Install daemon, firewall rules, sudoers
sudo ./scripts/uninstall.sh   # Remove everything
sudo ./scripts/update-blocklist.sh  # Update domains without reinstall
```

Generated system files go to `/usr/local/etc/focus/`. The apply script lives at `/usr/local/bin/focus-apply.sh`.

## Server Architecture

The server's core loop:

1. `server.ts` — Starts HTTP server, launches `tick()` every `CHECK_INTERVAL_MS` (default 60s)
2. `services/focus.service.ts` — `tick()` calculates target mode (`blocked`/`unblocked`) and applies if changed
3. `services/scheduleService.ts` — Determines if current time falls within a pause window (defined in `src/config/focus.ts`)
4. `services/focusApplier.service.ts` — Shells out to `sudo focus-apply.sh <mode>`

API routes are under `/api/v1` (see `routes/index.ts`). Key endpoints:
- `GET /health` — Simple health check
- `GET /api/v1/focus/status` — Returns `{ mode, isScheduledPause, time }`

## Configuration

- **`apps/server/config/domains.json`** — Domain blocklist with per-domain options (`includeWww`, `includeMobile`, `hosts`, `pf`, `aliases`, `tags`)
- **`apps/server/src/config/focus.ts`** — Schedule config: `ACTIVE_DAYS`, `ALLOWED_PAUSES` (time windows), `ALLOWED_ORIGINS` (CORS whitelist for Chrome extension)
- **`.env`** — `PORT` (default 5959), `HOST` (default 127.0.0.1), `CHECK_INTERVAL_MS` (default 60000)

## Key Types

```typescript
type FocusMode = 'blocked' | 'unblocked' | 'unknown'  // 'unknown' is runtime-only initial state
type ApplicableFocusMode = 'blocked' | 'unblocked'     // Modes that can be applied
```
