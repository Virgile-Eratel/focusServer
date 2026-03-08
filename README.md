# focusServer

macOS website blocker. A Node.js server enforces blocking rules via the PF firewall and `/etc/hosts`, with a Chrome extension that reloads blocked pages in the browser so that changes take effect immediately.

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

| Path                                         | Description                  |
| -------------------------------------------- | ---------------------------- |
| `/usr/local/etc/focus/hosts.blocked`         | Hosts file in blocked mode   |
| `/usr/local/etc/focus/hosts.unblocked`       | Hosts file in unblocked mode |
| `/usr/local/etc/focus/pf.user.conf.template` | PF config template           |
| `/usr/local/etc/focus/domains.json`          | Domain list copy             |
| `/usr/local/bin/focus-apply.sh`              | Mode apply script            |

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
4. Select the `apps/extension/` folder

The extension connects to the local server (`http://localhost:5959`) to display blocking status and manage domains.

## Update the blocklist

```bash
# Edit apps/server/config/domains.json then:
sudo apps/server/scripts/update-blocklist.sh
```

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
