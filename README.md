# focusServer

macOS website blocker. A Node.js server enforces blocking rules via the PF firewall and `/etc/hosts`, with a Chrome extension that reloads blocked pages in the browser so that changes take effect immediately.

Domains you visit for the first time are classified by a local AI model (Ollama) and blocked automatically if they fall in a forbidden category — see [Automatic classification](#automatic-classification).

## Architecture

```
apps/server        — Express REST API (port 5959)
apps/extension     — Chrome MV3 extension (popup + service worker)
packages/shared    — Shared TypeScript types
packages/api-client — HTTP client for the server API
```

## Server Installation

### Prerequisites

- macOS
- Node.js
- pnpm (`npm install -g pnpm`)
- [Ollama](https://ollama.com) **with a model pulled** — required, this is what classifies unknown domains:

  ```bash
  brew install ollama && ollama serve
  ollama pull gemma3:4b
  ```

### 1. Clone and install dependencies

```bash
git clone https://github.com/Virgile-Eratel/focusServer && cd focusServer
pnpm install
```

### 2. Configure domains

Create the config file from the template:

```bash
cp apps/server/config/domains.example.json apps/server/config/domains.json
```

Edit `apps/server/config/domains.json` with the domains to block. See [domains.example.md](apps/server/config/domains.example.md) for detailed configuration options.

### 3. Build

```bash
pnpm build:server
```

### 4. Install the system daemon

```bash
chmod +x apps/server/scripts/*.sh
sudo apps/server/scripts/install.sh
```

This installs the launchd daemon, firewall rules and sudoers configuration.

**Generated files:**

| Path                                               | Description                  |
| -------------------------------------------------- | ---------------------------- |
| `/usr/local/etc/focusServer/hosts.blocked`         | Hosts file in blocked mode   |
| `/usr/local/etc/focusServer/hosts.unblocked`       | Hosts file in unblocked mode |
| `/usr/local/etc/focusServer/pf.user.conf.template` | PF config template           |
| `/usr/local/bin/focus-apply.sh`                    | Mode apply script            |

`hosts.blocked` and `pf.user.conf.template` are **derived** from `apps/server/config/domains.json`, which stays the single source of truth. The server regenerates them whenever the JSON changes; nothing is ever copied out of the project.

## Chrome Extension Installation

The extension is not published on the Chrome Web Store. It must be installed manually in developer mode.

### 1. Build the extension

```bash
pnpm build:extension
```

### 2. Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `apps/extension/` folder — the one holding `manifest.json`, **not** `apps/extension/dist/`

> The extension ID is derived from the path of the folder you load, and the server only accepts requests from the whitelisted ID (`ALLOWED_ORIGINS` in `apps/server/src/config/focus.ts`). Loading a different folder changes the ID, and every request is then rejected by CORS.

The popup connects to the local server (`http://localhost:5959`) and shows:

- the current status (blocked / unblocked, or server unreachable);
- the next scheduled transition (“next unblock today at 18:00”), derived from `WEEKLY_SCHEDULE`;
- one button to block the current tab's site (the hostname only: `test.com/page` is stored as `test.com`), which turns into **"Ne plus bloquer"** on a site the AI blocked by mistake;
- a read-only panel listing the blocklist.

## Automatic classification

On the first visit to an unknown domain, the extension holds the tab on a checking page and asks the server. The server fetches the page title and meta tags (the browser never loads the site) and asks the local Ollama model for a category. A verdict of `adult` or `entertainment` is added to `domains.json` — same path as a manual entry. Verdicts are cached in SQLite: a domain is classified once.

| Category        | Blocked                                        |
| --------------- | ---------------------------------------------- |
| `adult`         | always                                         |
| `entertainment` | outside the pause windows of `WEEKLY_SCHEDULE` |
| `other`         | never                                          |

A domain is only blocked on evidence. An unreadable page, a page whose title is just the brand name, or a domain the model cannot describe consistently yields `unknown` — **and `unknown` is not blocked**. Add such a site by hand if you want it blocked.

Stopping Ollama stops the classification of new domains. It unblocks nothing: `domains.json` is still enforced through `/etc/hosts` and PF.

### Configuration

| Variable       | Default                  |
| -------------- | ------------------------ |
| `OLLAMA_URL`   | `http://localhost:11434` |
| `OLLAMA_MODEL` | `gemma3:4b`              |

Set in `.env` (or the launchd plist); defaults in `apps/server/src/utils/constants.ts`. Prompts and classification rules live in `apps/server/src/services/ollama.service.ts`.

### Fixing a wrong verdict

Do **not** delete the line from `domains.json`: the cached verdict survives, and the next visit re-classifies the domain identically. Requalify it as `other` — a manual entry outranks any verdict and is never re-classified.

| Wrong verdict                           | Fix                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `entertainment`, decided by the AI      | "Ne plus bloquer" button in the popup                                                      |
| `adult`, or an entry you added yourself | Edit `domains.json` → `"category": "other"`, then `DELETE /api/v1/focus/verdicts/<domain>` |

> The server refuses (403) to lift an `adult` block from the browser. That friction is intentional.

## Update the blocklist

- Edit `apps/server/config/domains.json`
- Adding or requalifying a domain from the Chrome extension

The running server checks the file on every tick (60s by default). When it changes, it regenerates `hosts.blocked` and `pf.user.conf.template`, then reapplies the current mode.

## Uninstall

```bash
sudo apps/server/scripts/uninstall.sh
```

## Browser Configuration

**Disable Secure DNS** to prevent the browser from bypassing the blocking:

- **Chrome / Brave:** Settings > Privacy and security > Security > Disable "Use secure DNS"
- **Firefox:** Settings > General > Network Settings > Disable DNS over HTTPS

## Development

```bash
pnpm dev:server        # Build shared + server in watch mode
pnpm build             # Build all packages
pnpm format            # Format with Prettier
pnpm test:server       # Run server tests
```
