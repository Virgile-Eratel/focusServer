# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**focusServer** is a macOS website blocker. A Node.js server periodically enforces blocking rules via macOS PF firewall and `/etc/hosts`, with a Chrome extension for status display. Documentation and comments are in French.

## Monorepo Structure

pnpm monorepo (`pnpm@10.2.1`) with four packages:

- **`apps/server`** — Express REST API (CommonJS). Runs a tick loop every 60s to calculate and apply blocking mode via `sudo focus-apply.sh`. Port 5959, localhost only.
- **`apps/extension`** — Chrome MV3 extension: React popup (shadcn/ui + Tailwind) + service worker. Built with Vite.
- **`packages/shared`** — Shared TypeScript types (`FocusMode`, `FocusStatus`, API response types). Single source of truth for API contracts.
- **`packages/api-client`** — HTTP client factory (`createFocusApiClient({ baseUrl })`, `baseUrl` = server root) wrapping every server endpoint. Consumed by the extension popup.

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

The server and `shared` are built by `tsc` alone. The extension is built by **Vite** (`tsc --noEmit` for typecheck, then `vite build`) — a bundler is required for JSX and Tailwind. Shared must be built before server or extension.

## Extension Architecture

Two entry points, output into `apps/extension/dist/` and referenced by `manifest.json`:

| Source                              | Output               | Referenced by               |
| ----------------------------------- | -------------------- | --------------------------- |
| `popup.html` + `src/popup/main.tsx` | `dist/popup.html`    | `action.default_popup`      |
| `src/background.ts`                 | `dist/background.js` | `background.service_worker` |

The Vite template is named `popup.html`, **not** `index.html`, on purpose. Chrome caches an unpacked extension's manifest until you reload it; a stale manifest still pointing at `index.html` would load the source template (which references a `.tsx`, served as `application/octet-stream`) instead of failing loudly. With no `index.html` in the loaded folder, a stale manifest fails visibly and you know to reload.

**After changing `manifest.json`, reload the extension in `chrome://extensions` (↻).** Rebuilding alone is not enough — Chrome keeps the old manifest.

- **The folder loaded in Chrome stays `apps/extension/`** (the one holding `manifest.json`). An unpacked extension's ID is derived from that folder's path, and the resulting ID is CORS-whitelisted in `ALLOWED_ORIGINS`. Moving the loaded folder changes the ID and the server starts rejecting every request.
- **No dev server.** MV3 forbids `eval` and inline scripts, so Vite's HMR cannot work. Develop with `pnpm --filter @focus/extension dev` (`vite build --watch`) and reload the extension in Chrome.
- **The popup is read-mostly**: current status, next scheduled transition, one button to block the current tab's site, and a read-only sheet listing the blocklist. Removing a domain is done by editing `domains.json`.
- **`src/background.ts` stays plain TypeScript, no React.** It derives "is blocking active?" by re-reading the `declarativeNetRequest` rules actually installed in Chrome (`getDynamicRules()`), because an MV3 service worker is killed constantly and no in-memory state survives. Do not replace this with stored state.

## Installation (macOS system-level)

```bash
chmod +x scripts/*.sh
sudo ./scripts/install.sh     # Install daemon, firewall rules, sudoers
sudo ./scripts/uninstall.sh   # Remove everything
```

Generated system files go to `/usr/local/etc/focusServer/`. The apply script lives at `/usr/local/bin/focus-apply.sh`.

To change the blocklist, edit `apps/server/config/domains.json` — the running server picks it up on the next tick. There is no update script.

## Server Architecture

**Single source of truth**: `apps/server/config/domains.json`. It is never copied anywhere; `hosts.blocked` and `pf.user.conf.template` are derived from it. There is no cache — not in the server, not in the extension.

The server's core loop, every `CHECK_INTERVAL_MS` (default 60s), from `server.ts`:

1. `services/domain.service.ts` — `syncSystemFilesIfChanged()` hashes `domains.json`; on change (including a manual edit), regenerates the system files and force-applies
2. `services/focus.service.ts` — `tick()` calculates target mode (`blocked`/`unblocked`) and applies if changed
3. `services/scheduleService.ts` — Pure functions over `WEEKLY_SCHEDULE`: `isInPauseWindow()` (are we paused now?) and `getNextTransition()` (when does the mode next flip, and to what — scans up to 7 days ahead, crossing day boundaries)
4. `services/systemConfig.service.ts` — Renders `hosts.blocked` + `pf.user.conf.template` into `/usr/local/etc/focusServer/` (in-process, no subprocess)
5. `services/focusApplier.service.ts` — Shells out to `sudo focus-apply.sh <mode>`, the only privileged step: it copies the generated files into `/etc/` and reloads PF

`scripts/generate-system-config.ts` is a thin CLI over step 4, used only by `install.sh` to seed the files before the server first starts.

API routes are under `/api/v1` (see `routes/index.ts`). Key endpoints:

- `GET /health` — Simple health check
- `GET /api/v1/focus/status` — Returns `{ mode, isScheduledPause, time, nextTransition }`, where `nextTransition` is `{ mode, at }` (ISO 8601) or `null` when the schedule never changes state
- `GET /api/v1/focus/domains` — Expanded hostnames (`www.`, `m.`, aliases)
- `GET /api/v1/focus/domains/entries` — Raw `domains.json` entries
- `POST /api/v1/focus/domains` — Body `{ domain, tags? }` → 201 (400 invalid, 409 already present)
- `DELETE /api/v1/focus/domains/:domain` — → 200 (404 not found)

## Configuration

- **`apps/server/config/domains.json`** — Domain blocklist with per-domain options (`includeWww`, `includeMobile`, `hosts`, `pf`, `aliases`, `tags`)
- **`apps/server/src/config/focus.ts`** — Schedule config: `WEEKLY_SCHEDULE` (pause windows per weekday; a missing day means unblocked all day, an empty array means blocked all day), `ALLOWED_ORIGINS` (CORS whitelist for the Chrome extension)
- **`.env`** — `PORT` (default 5959), `HOST` (default 127.0.0.1), `CHECK_INTERVAL_MS` (default 60000), `DOMAINS_PATH` (default `apps/server/config/domains.json`), `FOCUS_SYSTEM_DIR` (default `/usr/local/etc/focusServer`)

## Key Types

```typescript
type FocusMode = 'blocked' | 'unblocked' | 'unknown'; // 'unknown' is runtime-only initial state
type ApplicableFocusMode = 'blocked' | 'unblocked'; // Modes that can be applied
```
