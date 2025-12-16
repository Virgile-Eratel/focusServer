#!/bin/bash
set -euo pipefail

#
# update-blocklist.sh
# Met à jour la blocklist installée :
# - /usr/local/etc/focus/domains.json
# - /usr/local/etc/focus/hosts.blocked
# - /usr/local/etc/focus/pf.user.conf.template
# - /usr/local/etc/focus/hosts.unblocked (copie)
#
# Usage:
#   sudo ./scripts/update-blocklist.sh
#

if [[ "$EUID" -ne 0 ]]; then
  echo "❌ Ce script doit être lancé avec sudo."
  echo "   Exemple : sudo ./scripts/update-blocklist.sh"
  exit 1
fi

REAL_USER="${SUDO_USER:-$USER}"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INPUT_DOMAINS="$REPO_DIR/config/domains.json"
INPUT_UNBLOCKED="$REPO_DIR/config/hosts.unblocked"
GEN_SCRIPT="$REPO_DIR/scripts/generate-system-config.js"

DEST_FOCUS_DIR="/usr/local/etc/focus"
DEST_DOMAINS="$DEST_FOCUS_DIR/domains.json"

if [[ ! -f "$INPUT_DOMAINS" ]]; then
  echo "❌ domains.json introuvable: $INPUT_DOMAINS"
  exit 1
fi

if [[ ! -f "$GEN_SCRIPT" ]]; then
  echo "❌ générateur introuvable: $GEN_SCRIPT"
  exit 1
fi

if [[ ! -f "$INPUT_UNBLOCKED" ]]; then
  echo "❌ hosts.unblocked introuvable: $INPUT_UNBLOCKED"
  exit 1
fi

echo "🔄 Mise à jour blocklist (user=$REAL_USER)"

# Trouver Node
NODE_BIN="$(sudo -u "$REAL_USER" which node || true)"
if [[ -z "$NODE_BIN" ]]; then
  if [[ -x "/opt/homebrew/bin/node" ]]; then
    NODE_BIN="/opt/homebrew/bin/node"
  elif [[ -x "/usr/local/bin/node" ]]; then
    NODE_BIN="/usr/local/bin/node"
  else
    echo "❌ Node.js introuvable."
    exit 1
  fi
fi

echo "   -> Node: $NODE_BIN"

echo "📂 Copie domains.json vers $DEST_DOMAINS"
mkdir -p "$DEST_FOCUS_DIR"
install -m 644 "$INPUT_DOMAINS" "$DEST_DOMAINS"

echo "📂 Copie hosts.unblocked vers $DEST_FOCUS_DIR/hosts.unblocked"
install -m 644 "$INPUT_UNBLOCKED" "$DEST_FOCUS_DIR/hosts.unblocked"

echo "⚙️  Génération hosts.blocked + pf.user.conf.template dans $DEST_FOCUS_DIR"
"$NODE_BIN" "$GEN_SCRIPT" --input "$DEST_DOMAINS" --out-dir "$DEST_FOCUS_DIR"

chmod 644 "$DEST_FOCUS_DIR/hosts.blocked" "$DEST_FOCUS_DIR/pf.user.conf.template" "$DEST_FOCUS_DIR/hosts.unblocked" || true

echo "✅ Fichiers mis à jour:"
echo "   - $DEST_FOCUS_DIR/hosts.blocked"
echo "   - $DEST_FOCUS_DIR/pf.user.conf.template"
echo "   - $DEST_FOCUS_DIR/hosts.unblocked"
echo "   - $DEST_DOMAINS"
