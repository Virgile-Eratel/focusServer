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

# 0. Preflight — vérifier que le fichier seed existe
SEED_FILE="$SERVER_DIR/config/domains.json"
if [[ ! -f "$SEED_FILE" ]]; then
  echo "❌ Fichier $SEED_FILE introuvable."
  echo "   Copiez d'abord le template : cp config/domains.example.json config/domains.json"
  echo "   Puis éditez-le selon vos besoins."
  exit 1
fi

# 1. Build (doit précéder la génération qui utilise dist/)
echo "📦 [1/6] Build..."
cd "$MONOREPO_ROOT"
sudo -u "$REAL_USER" pnpm install >/dev/null 2>&1 || sudo -u "$REAL_USER" npm install >/dev/null 2>&1
sudo -u "$REAL_USER" pnpm build:server || sudo -u "$REAL_USER" npm run build:server || { echo "❌ Build échoué"; exit 1; }

# 2. Configs système
echo "📂 [2/6] Fichiers config..."
mkdir -p /usr/local/etc/focus
install -m 644 "$SEED_FILE" /usr/local/etc/focus/domains.json
install -m 644 "$SERVER_DIR/config/hosts.unblocked" /usr/local/etc/focus/
"$NODE_BIN" "$SERVER_DIR/dist/scripts/generate-system-config.js" \
    --input /usr/local/etc/focus/domains.json --out-dir /usr/local/etc/focus

# Le serveur (user-level) doit pouvoir écrire dans ce répertoire
chown -R "$REAL_USER" /usr/local/etc/focus

# 3. Script moteur
echo "⚙️  [3/6] Script moteur..."
install -m 755 "$SERVER_DIR/scripts/focus-apply.sh" /usr/local/bin/

# 4. Firewall PF
echo "🛡  [4/6] Firewall..."
PF_CONF="/etc/pf.conf"
[[ ! -f "$PF_CONF.backup-focus" ]] && cp "$PF_CONF" "$PF_CONF.backup-focus"
grep -q 'anchor "user-block"' "$PF_CONF" || \
    printf '\n# focusServer\nanchor "user-block"\nload anchor "user-block" from "/etc/pf.user.conf"\n' >> "$PF_CONF"
: > /etc/pf.user.conf
/sbin/pfctl -f "$PF_CONF" 2>/dev/null || true
/sbin/pfctl -E 2>/dev/null || true

# 5. Sudoers
echo "🔑 [5/6] Droits sudo..."
echo "$REAL_USER ALL=(root) NOPASSWD: /usr/local/bin/focus-apply.sh" > /etc/sudoers.d/focus-server
chmod 440 /etc/sudoers.d/focus-server

# 6. Launchd
echo "🚀 [6/6] Configuration launchd..."
NODE_DIR="$(dirname "$NODE_BIN")"
PLIST="$REAL_HOME/Library/LaunchAgents/com.focus.server.plist"
mkdir -p "$(dirname "$PLIST")"
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
        <key>PATH</key><string>${NODE_DIR}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/sbin:/usr/sbin</string>
        <key>HOME</key><string>${REAL_HOME}</string>
        <key>PORT</key><string>5959</string>
        <key>DOMAINS_PATH</key><string>/usr/local/etc/focus/domains.json</string>
    </dict>
</dict>
</plist>
EOF
chown "$REAL_USER" "$PLIST"
REAL_UID=$(id -u "$REAL_USER")
launchctl bootout "gui/$REAL_UID/com.focus.server" 2>/dev/null || true
launchctl bootstrap "gui/$REAL_UID" "$PLIST"

echo "✨ Installation terminée ! Logs: tail -f /tmp/focus-server.out.log"
