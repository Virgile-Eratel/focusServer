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

# node:sqlite exige Node >= 24 ; un binaire plus vieux = crash-loop launchd silencieux
NODE_MAJOR=$("$NODE_BIN" -v | sed 's/^v//' | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt 24 ]]; then
  echo "❌ Node >= 24 requis (trouvé : $("$NODE_BIN" -v))."
  echo "   Installez-le avec nvm : nvm install 24 && nvm alias default 24"
  exit 1
fi

echo "🔧 Installation pour $REAL_USER (Node: $NODE_BIN)"

# 0. Preflight — la blocklist du projet est la source de vérité (jamais copiée ailleurs)
DOMAINS_FILE="$SERVER_DIR/config/domains.json"
if [[ ! -f "$DOMAINS_FILE" ]]; then
  echo "❌ Fichier $DOMAINS_FILE introuvable."
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
# Génération initiale seulement : ensuite le serveur régénère ces fichiers
# lui-même dès que config/domains.json change.
echo "📂 [2/6] Fichiers config..."
mkdir -p /usr/local/etc/focusServer
# Les 4 fichiers (hosts.blocked, hosts.unblocked, pf.*.template) sont générés
# depuis domains.json — plus aucun fichier statique copié.
"$NODE_BIN" "$SERVER_DIR/dist/scripts/generate-system-config.js" \
    --input "$DOMAINS_FILE" --out-dir /usr/local/etc/focusServer

# Le serveur (user-level) doit pouvoir écrire dans ce répertoire
chown -R "$REAL_USER" /usr/local/etc/focusServer

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
        <key>DOMAINS_PATH</key><string>${DOMAINS_FILE}</string>
        <key>OLLAMA_URL</key><string>http://localhost:11434</string>
        <key>OLLAMA_MODEL</key><string>gemma3:4b</string>
    </dict>
</dict>
</plist>
EOF
chown "$REAL_USER" "$PLIST"
REAL_UID=$(id -u "$REAL_USER")
launchctl bootout "gui/$REAL_UID/com.focus.server" 2>/dev/null || true
launchctl bootstrap "gui/$REAL_UID" "$PLIST"

# 7. Préflight Ollama (non bloquant — fail closed : sans Ollama, les domaines
# inconnus sont simplement bloqués)
if curl -s --max-time 2 http://localhost:11434/api/version >/dev/null 2>&1; then
  echo "🤖 Ollama détecté."
else
  echo "⚠️  Ollama injoignable sur localhost:11434 : les domaines inconnus"
  echo "   seront bloqués par défaut (fail closed) tant qu'il ne tourne pas."
fi

echo "✨ Installation terminée ! Logs: tail -f /tmp/focus-server.out.log"
