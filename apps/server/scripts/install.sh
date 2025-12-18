#!/bin/bash
set -euo pipefail

#
# install.sh
# 1. Installe les configs système (/etc/hosts, PF).
# 2. Configure les droits sudo sans mot de passe.
# 3. Compile le projet TypeScript.
# 4. Configure le lancement automatique au démarrage (Launchd).
#

if [[ "$EUID" -ne 0 ]]; then
  echo "❌ Lancez ce script avec sudo :"
  echo "   sudo ./scripts/install.sh"
  exit 1
fi

# Récupérer l'utilisateur réel (celui qui a lancé sudo)
REAL_USER="${SUDO_USER:-$USER}"
# Récupérer le dossier Home réel
REAL_HOME=$(eval echo "~$REAL_USER")

echo "🔧 Installation de focusServer pour l'utilisateur : $REAL_USER"

# Chemins
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_CONFIG="$REPO_DIR/config"
SRC_SCRIPTS="$REPO_DIR/scripts"

DEST_CONFIG_DIR="/usr/local/etc"
DEST_FOCUS_DIR="/usr/local/etc/focus"
DEST_BIN_DIR="/usr/local/bin"

# ==============================================================================
# 1. Installation des fichiers de configuration
# ==============================================================================
echo "📂 [1/6] Mise en place des fichiers config..."
mkdir -p "$DEST_FOCUS_DIR"

install -m 644 "$SRC_CONFIG/hosts.unblocked" "$DEST_FOCUS_DIR/hosts.unblocked"

# (blocklist)
install -m 644 "$SRC_CONFIG/domains.json" "$DEST_FOCUS_DIR/domains.json"

# Génération des fichiers système depuis domains.json
echo "⚙️  Génération hosts.blocked et pf.user.conf.template depuis domains.json..."
NODE_BIN=$(sudo -u "$REAL_USER" which node || true)
if [[ -z "$NODE_BIN" ]]; then
    echo "⚠️  'which node' n'a rien retourné. Recherche des chemins standards..."
    if [[ -x "/opt/homebrew/bin/node" ]]; then
        NODE_BIN="/opt/homebrew/bin/node"
    elif [[ -x "/usr/local/bin/node" ]]; then
        NODE_BIN="/usr/local/bin/node"
    else
        echo "❌ Erreur critique : Node.js introuvable."
        exit 1
    fi
fi


"$NODE_BIN" "$REPO_DIR/scripts/generate-system-config.js" \
  --input "$DEST_FOCUS_DIR/domains.json" \
  --out-dir "$DEST_FOCUS_DIR"

chmod 644 "$DEST_FOCUS_DIR/hosts.blocked" "$DEST_FOCUS_DIR/pf.user.conf.template" || true

# ==============================================================================
# 2. Installation du script de contrôle (Moteur)
# ==============================================================================
echo "⚙️  [2/6] Installation du script moteur..."
install -m 755 "$SRC_SCRIPTS/focus-apply.sh" "$DEST_BIN_DIR/focus-apply.sh"

# ==============================================================================
# 3. Configuration du Firewall macOS (PF)
# ==============================================================================
echo "🛡  [3/6] Configuration du Firewall..."
PF_CONF="/etc/pf.conf"
PF_ANCHOR_TEXT='anchor "user-block"'
PF_LOAD_TEXT='load anchor "user-block" from "/etc/pf.user.conf"'

if [[ ! -f "$PF_CONF.backup-focus" ]]; then
    cp "$PF_CONF" "$PF_CONF.backup-focus"
fi

if ! grep -q "$PF_ANCHOR_TEXT" "$PF_CONF"; then
    printf "\n# focusServer\n%s\n%s\n" "$PF_ANCHOR_TEXT" "$PF_LOAD_TEXT" >> "$PF_CONF"
fi

# Initialisation passive
: > /etc/pf.user.conf 
pfctl -f "$PF_CONF" 2>/dev/null || echo "⚠️  PF reload warning (normal)"
pfctl -E 2>/dev/null || true

# ==============================================================================
# 4. Automatisation des droits Sudo
# ==============================================================================
echo "🔑 [4/6] Configuration des droits sudo..."
SUDOERS_FILE="/etc/sudoers.d/focus-server"
echo "$REAL_USER ALL=(root) NOPASSWD: $DEST_BIN_DIR/focus-apply.sh" > "$SUDOERS_FILE"
chmod 440 "$SUDOERS_FILE"

# ==============================================================================
# 5. Build du projet (TypeScript -> JS)
# ==============================================================================
echo "📦 [5/6] Compilation du serveur..."

if sudo -u "$REAL_USER" command -v pnpm >/dev/null 2>&1; then
    CMD_INSTALL="pnpm install"
    CMD_BUILD="pnpm build"
else
    CMD_INSTALL="npm install"
    CMD_BUILD="npm run build"
fi

echo "   -> Installation des dépendances ($CMD_INSTALL)..."
cd "$REPO_DIR"
sudo -u "$REAL_USER" $CMD_INSTALL >/dev/null 2>&1

echo "   -> Compilation ($CMD_BUILD)..."
if sudo -u "$REAL_USER" $CMD_BUILD; then
    echo "   ✅ Build succès."
else
    echo "❌ Erreur lors du build. Vérifiez le code TypeScript."
    exit 1
fi

# ==============================================================================
# 6. Automatisation du lancement (Launchd)
# ==============================================================================
echo "🤖 [6/6] Configuration du démarrage automatique..."

# Trouver le chemin de Node pour l'utilisateur réel
NODE_BIN=$(sudo -u "$REAL_USER" which node || true)

if [[ -z "$NODE_BIN" ]]; then
    echo "⚠️  'which node' n'a rien retourné. Recherche des chemins standards..."
    if [[ -x "/opt/homebrew/bin/node" ]]; then
        NODE_BIN="/opt/homebrew/bin/node"
    elif [[ -x "/usr/local/bin/node" ]]; then
        NODE_BIN="/usr/local/bin/node"
    else
        echo "❌ Erreur critique : Node.js introuvable."
        echo "   Installez Node ou vérifiez qu'il est dans le PATH de $REAL_USER."
        exit 1
    fi
fi

echo "   -> Node trouvé : $NODE_BIN"

APP_LABEL="com.focus.server"
PLIST_DEST="$REAL_HOME/Library/LaunchAgents/${APP_LABEL}.plist"
SERVER_SCRIPT="$REPO_DIR/dist/server.js"

# Création du fichier .plist
cat <<EOF > "$PLIST_DEST"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${APP_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${SERVER_SCRIPT}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${REPO_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/focus-server.out.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/focus-server.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>PORT</key>
        <string>5050</string>
    </dict>
</dict>
</plist>
EOF

# Donner la propriété du fichier à l'utilisateur (sinon launchd ne peut pas le lire)
chown "$REAL_USER" "$PLIST_DEST"

# Recharger le service
echo "🚀 Activation du service..."
sudo -u "$REAL_USER" launchctl unload "$PLIST_DEST" 2>/dev/null || true
sudo -u "$REAL_USER" launchctl load "$PLIST_DEST"

echo
echo "✨ Installation COMPLÈTE !"
echo "   - Le système est configuré."
echo "   - Le serveur Node est compilé et démarré."
echo "   - Il se relancera automatiquement à chaque démarrage du Mac."
echo
echo "📜 Voir les logs : tail -f /tmp/focus-server.out.log"