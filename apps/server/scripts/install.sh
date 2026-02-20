#!/bin/bash
set -euo pipefail

# install.sh - Installation simplifiée de focusServer

[[ "$EUID" -ne 0 ]] && { echo "❌ Lancez avec sudo"; exit 1; }

REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(eval echo "~$REAL_USER")
SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(cd "$SERVER_DIR/../.." && pwd)"

# Fonction pour trouver Node (une seule fois)
find_node() {
    local node_bin=$(sudo -u "$REAL_USER" which node 2>/dev/null || true)
    [[ -z "$node_bin" ]] && [[ -x "/opt/homebrew/bin/node" ]] && node_bin="/opt/homebrew/bin/node"
    [[ -z "$node_bin" ]] && [[ -x "/usr/local/bin/node" ]] && node_bin="/usr/local/bin/node"
    [[ -z "$node_bin" ]] && { echo "❌ Node.js introuvable"; exit 1; }
    echo "$node_bin"
}

NODE_BIN=$(find_node)
echo "🔧 Installation pour $REAL_USER (Node: $NODE_BIN)"

# 1. Configs système
echo "📂 [1/5] Fichiers config..."
mkdir -p /usr/local/etc/focus
install -m 644 "$SERVER_DIR/config/hosts.unblocked" /usr/local/etc/focus/
install -m 644 "$SERVER_DIR/config/domains.json" /usr/local/etc/focus/
"$NODE_BIN" "$SERVER_DIR/scripts/generate-system-config.js" \
    --input /usr/local/etc/focus/domains.json --out-dir /usr/local/etc/focus

# 2. Script moteur
echo "⚙️  [2/5] Script moteur..."
install -m 755 "$SERVER_DIR/scripts/focus-apply.sh" /usr/local/bin/

# 3. Firewall PF
echo "🛡  [3/5] Firewall..."
PF_CONF="/etc/pf.conf"
[[ ! -f "$PF_CONF.backup-focus" ]] && cp "$PF_CONF" "$PF_CONF.backup-focus"
grep -q 'anchor "user-block"' "$PF_CONF" || \
    printf '\n# focusServer\nanchor "user-block"\nload anchor "user-block" from "/etc/pf.user.conf"\n' >> "$PF_CONF"
: > /etc/pf.user.conf
/sbin/pfctl -f "$PF_CONF" 2>/dev/null || true
/sbin/pfctl -E 2>/dev/null || true

# 4. Sudoers
echo "🔑 [4/5] Droits sudo..."
echo "$REAL_USER ALL=(root) NOPASSWD: /usr/local/bin/focus-apply.sh" > /etc/sudoers.d/focus-server
chmod 440 /etc/sudoers.d/focus-server

# 5. Build
echo "📦 [5/5] Build..."
cd "$MONOREPO_ROOT"
sudo -u "$REAL_USER" pnpm install >/dev/null 2>&1 || sudo -u "$REAL_USER" npm install >/dev/null 2>&1
sudo -u "$REAL_USER" pnpm build:server || sudo -u "$REAL_USER" npm run build:server || { echo "❌ Build échoué"; exit 1; }

# 6. Launchd (optionnel - peut être séparé)
echo "🚀 Configuration launchd..."
PLIST="$REAL_HOME/Library/LaunchAgents/com.focus.server.plist"
cat <<EOF > "$PLIST"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.focus.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${SERVER_DIR}/dist/server.js</string>
    </array>
    <key>WorkingDirectory</key><string>${SERVER_DIR}</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>/tmp/focus-server.out.log</string>
    <key>StandardErrorPath</key><string>/tmp/focus-server.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key><string>/usr/local/bin:/usr/bin:/bin:/sbin:/usr/sbin</string>
    </dict>
</dict>
</plist>
EOF
chown "$REAL_USER" "$PLIST"
sudo -u "$REAL_USER" launchctl unload "$PLIST" 2>/dev/null || true
sudo -u "$REAL_USER" launchctl load "$PLIST"

echo "✨ Installation terminée ! Logs: tail -f /tmp/focus-server.out.log"